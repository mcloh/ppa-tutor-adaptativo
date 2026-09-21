import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, max, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import {
  anacExamAttempts,
  authLoginAttempts,
  authPasswordDeliveries,
  authSessions,
  billingOrders,
  canonicalConcepts,
  creditBalances,
  creditLedger,
  homologationAuditEvents,
  courseCatalogVersions,
  inAppNotifications,
  knowledgeChunks,
  knowledgeChunkTerms,
  knowledgeSources,
  learningEvents,
  paymentAttempts,
  paymentWebhookEvents,
  progressAssessments,
  readinessMapVersions,
  sharedQuestionCache,
  studentConceptReadiness,
  studentProfiles,
  studentReadinessMaps,
  studentStudyPrograms,
  studyQuestions,
  studySessions,
  studyPlans,
  type InsertUser,
  type User,
  users,
} from "../drizzle/schema";
import { BILLING_MODE, getPrepaidProduct, nextBalance, type PrepaidProductKey } from "./domain/billing";
import { assessmentMatrixSummary, buildAssessmentMatrix, nextMatrixSlot, type AssessmentMatrixSlot, type SelectableStudyMode, type StudyMode } from "./domain/assessmentMatrix";
import { buildPublicCanonicalCatalog } from "./domain/publicCanonicalCatalog";
import { diagnosticStatusAfterAnswer, nextModeAfterSelection, sessionCompletesAfterAnswer } from "./domain/studyProgram";
import {
  appendMapEvent,
  assessmentMilestoneForQuestion,
  initialReadinessMap,
  parseReadinessMap,
  readinessChecksum,
  transitionProgress,
  type PedagogicalAction,
  type ResponseInput,
} from "./domain/learning";
import { buildRagQuery, composeRagContext, tokenizeForRetrieval, type RagConcept, type RagEvidence } from "./domain/rag";
import { fetchPagBankOrder, fetchPagBankSandboxOrder, PAGBANK_PRODUCTION_API_URL, sha256 } from "./domain/pagbankSandbox";
import {
  buildPagBankHomologationExport,
  evidenceHash,
  sanitizeHomologationEvidence,
  type HomologationAuditOperation,
  type HomologationAuditOutcome,
} from "./domain/homologationAudit";
import { createOpaqueToken, hashPassword, normalizeEmail } from "./domain/password";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function getUserByEmail(email: string) {
  const db = await requireDb();
  return (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
}

export async function getUserByOpenId(openId: string) {
  const db = await requireDb();
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export async function getUserByGoogleSubject(subject: string) {
  const db = await requireDb();
  return (await db.select().from(users).where(eq(users.googleSubject, subject)).limit(1))[0];
}

/** Vincula um Gmail verificado ao usuário existente ou cria uma conta federada sem senha local conhecida. */
export async function findOrCreateGoogleUser(input: { subject: string; email: string; name?: string }) {
  const db = await requireDb();
  const email = normalizeEmail(input.email);
  const now = new Date();

  const result = await db.transaction(async tx => {
    const bySubject = (await tx.select().from(users).where(eq(users.googleSubject, input.subject)).limit(1))[0];
    if (bySubject) {
      await tx.update(users).set({ lastSignedIn: now }).where(eq(users.id, bySubject.id));
      return { user: { ...bySubject, lastSignedIn: now }, created: false, linked: false };
    }

    const byEmail = (await tx.select().from(users).where(eq(users.email, email)).limit(1))[0];
    if (byEmail) {
      if (byEmail.googleSubject && byEmail.googleSubject !== input.subject) {
        throw new Error("A identidade Google informada não corresponde à vinculação existente desta conta.");
      }
      const loginMethod = byEmail.loginMethod === "password" ? "password_google" : byEmail.loginMethod;
      await tx.update(users).set({ googleSubject: input.subject, loginMethod, lastSignedIn: now }).where(eq(users.id, byEmail.id));
      return { user: { ...byEmail, googleSubject: input.subject, loginMethod, lastSignedIn: now }, created: false, linked: true };
    }

    await tx.insert(users).values({
      openId: `google_${nanoid(20)}`,
      name: (input.name?.trim() || "Aluno PPA").slice(0, 120),
      email,
      passwordHash: await hashPassword(createOpaqueToken()),
      googleSubject: input.subject,
      loginMethod: "google",
      passwordChangeRequired: false,
      lastSignedIn: now,
    });
    const created = (await tx.select().from(users).where(eq(users.email, email)).limit(1))[0];
    if (!created) throw new Error("Não foi possível criar a conta vinculada ao Google.");
    return { user: created, created: true, linked: false };
  });

  if (result.created) await ensureCreditBalance(result.user.id);
  return result;
}

/** Compatibility adapter for inactive legacy routes. New accounts must use createPasswordUser. */
export async function upsertUser(input: { openId: string; lastSignedIn?: Date; name?: string | null; email?: string | null; loginMethod?: string | null; role?: "user" | "admin" }) {
  const db = await requireDb();
  const existing = await getUserByOpenId(input.openId);
  if (!existing) throw new Error("O fluxo de autenticação legado está desativado.");
  await db.update(users).set({ lastSignedIn: input.lastSignedIn ?? new Date() }).where(eq(users.id, existing.id));
}

export async function createPasswordUser(user: InsertUser) {
  const db = await requireDb();
  await db.insert(users).values(user);
  const created = await getUserByEmail(user.email);
  if (created) await ensureCreditBalance(created.id);
  return created;
}

export async function updateLastSignedIn(userId: number) {
  const db = await requireDb();
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

export type PasswordDeliveryPurpose = "activation" | "password_reset";

const TEMPORARY_PASSWORD_TTL_MS = 30 * 60 * 1000;
const PASSWORD_DELIVERY_WINDOW_MS = 15 * 60 * 1000;
const MAX_PASSWORD_DELIVERIES_PER_WINDOW = 3;

/** Substitui credencial, invalida sessões e registra a emissão sem reter a senha transitória. */
export async function issueTemporaryPassword(input: { userId: number; passwordHash: string; purpose: PasswordDeliveryPurpose }) {
  const db = await requireDb();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const expiresAt = new Date(now.getTime() + TEMPORARY_PASSWORD_TTL_MS);
  return db.transaction(async tx => {
    const recent = await tx
      .select({ id: authPasswordDeliveries.id })
      .from(authPasswordDeliveries)
      .where(and(eq(authPasswordDeliveries.userId, input.userId), gt(authPasswordDeliveries.createdAt, new Date(now.getTime() - PASSWORD_DELIVERY_WINDOW_MS))))
      .limit(MAX_PASSWORD_DELIVERIES_PER_WINDOW);
    if (recent.length >= MAX_PASSWORD_DELIVERIES_PER_WINDOW) {
      throw new Error("Limite de solicitações de senha temporária atingido. Aguarde alguns minutos.");
    }

    const user = (await tx.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!user) throw new Error("Conta não encontrada para emissão de senha temporária.");
    const deliveryId = nanoid();
    await tx.update(users).set({
      passwordHash: input.passwordHash,
      passwordChangeRequired: true,
      temporaryPasswordIssuedAt: now,
      temporaryPasswordExpiresAt: expiresAt,
    }).where(eq(users.id, input.userId));
    await tx.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, input.userId), isNull(authSessions.revokedAt)));
    await tx.insert(authPasswordDeliveries).values({
      id: deliveryId,
      userId: input.userId,
      purpose: input.purpose,
      recipientHash: createHash("sha256").update(user.email).digest("hex"),
      expiresAt,
    });
    return {
      deliveryId,
      email: user.email,
      expiresAt,
      issuedAt: now,
      previousPasswordHash: user.passwordHash,
      previousPasswordChangeRequired: user.passwordChangeRequired,
      previousTemporaryPasswordIssuedAt: user.temporaryPasswordIssuedAt,
      previousTemporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt,
    };
  });
}

/** O estado sent significa aceite pelo servidor SMTP; ele não prova a entrega na caixa de entrada. */
export async function markPasswordDeliveryResult(input: { deliveryId: string; status: "sent" | "failed"; smtpMessageId?: string; failureCode?: string }) {
  const db = await requireDb();
  await db.update(authPasswordDeliveries).set({
    status: input.status,
    smtpAcceptedAt: input.status === "sent" ? new Date() : null,
    smtpMessageIdHash: input.status === "sent" && input.smtpMessageId ? createHash("sha256").update(input.smtpMessageId).digest("hex") : null,
    dispatchedAt: new Date(),
    failureCode: input.failureCode?.slice(0, 48),
  }).where(eq(authPasswordDeliveries.id, input.deliveryId));
}

/** Restaura integralmente o estado anterior se a entrega falhar antes de a nova senha chegar ao titular. */
export async function restorePasswordAfterDeliveryFailure(input: {
  userId: number;
  deliveryId: string;
  issuedAt: Date;
  previousPasswordHash: string;
  previousPasswordChangeRequired: boolean;
  previousTemporaryPasswordIssuedAt: Date | null;
  previousTemporaryPasswordExpiresAt: Date | null;
  failureCode?: string;
}) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.update(users).set({
      passwordHash: input.previousPasswordHash,
      passwordChangeRequired: input.previousPasswordChangeRequired,
      temporaryPasswordIssuedAt: input.previousTemporaryPasswordIssuedAt,
      temporaryPasswordExpiresAt: input.previousTemporaryPasswordExpiresAt,
    }).where(and(eq(users.id, input.userId), eq(users.temporaryPasswordIssuedAt, input.issuedAt)));
    await tx.update(authPasswordDeliveries).set({
      status: "failed",
      dispatchedAt: new Date(),
      failureCode: input.failureCode?.slice(0, 48) ?? "smtp_delivery_failed",
    }).where(eq(authPasswordDeliveries.id, input.deliveryId));
  });
}

/** Remove uma conta local recém-criada quando a mensagem de ativação não foi aceita pelo SMTP. */
export async function discardUnactivatedPasswordUser(userId: number) {
  const db = await requireDb();
  await db.delete(users).where(and(
    eq(users.id, userId),
    eq(users.loginMethod, "password"),
    eq(users.passwordChangeRequired, true),
    isNull(users.temporaryPasswordIssuedAt),
  ));
}

/** Finaliza a ativação ou troca voluntária e torna credenciais temporárias inutilizáveis. */
export async function completePasswordChange(input: { userId: number; passwordHash: string }) {
  const db = await requireDb();
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(users).set({
      passwordHash: input.passwordHash,
      passwordChangeRequired: false,
      temporaryPasswordIssuedAt: null,
      temporaryPasswordExpiresAt: null,
    }).where(eq(users.id, input.userId));
    await tx.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, input.userId), isNull(authSessions.revokedAt)));
  });
}

export type StudentProfileInput = {
  name: string;
  dateOfBirth: string | null;
  gender: "M" | "F" | "NB" | null;
  city: string | null;
  stateUf: string | null;
  theoreticalCourseProvider: string | null;
};

export type AnacExamAttemptInput = {
  examDate: string;
  metScore: number;
  regScore: number;
  navScore: number;
  mecScore: number;
  tvoScore: number;
  approved: boolean;
};

/** Retorna somente os dados cadastrais necessários à tela do próprio titular. */
export async function getStudentProfile(userId: number) {
  const db = await requireDb();
  const [user, profile] = await Promise.all([
    db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1),
  ]);
  if (!user[0]) throw new Error("Conta não encontrada.");
  return {
    name: user[0].name,
    email: user[0].email,
    dateOfBirth: profile[0]?.dateOfBirth ?? null,
    gender: profile[0]?.gender ?? null,
    city: profile[0]?.city ?? null,
    stateUf: profile[0]?.stateUf ?? null,
    theoreticalCourseProvider: profile[0]?.theoreticalCourseProvider ?? null,
  };
}

/** Atualiza somente os campos permitidos para o titular, preservando o e-mail de login. */
export async function upsertStudentProfile(userId: number, input: StudentProfileInput) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.update(users).set({ name: input.name }).where(eq(users.id, userId));
    await tx.insert(studentProfiles).values({ userId, ...input }).onDuplicateKeyUpdate({
      set: {
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        city: input.city,
        stateUf: input.stateUf,
        theoreticalCourseProvider: input.theoreticalCourseProvider,
        updatedAt: new Date(),
      },
    });
  });
  return getStudentProfile(userId);
}

/** Lista somente o histórico do titular, da tentativa mais recente para a mais antiga. */
export async function listAnacExamAttempts(userId: number) {
  const db = await requireDb();
  return db
    .select({
      id: anacExamAttempts.id,
      examDate: anacExamAttempts.examDate,
      metScore: anacExamAttempts.metScore,
      regScore: anacExamAttempts.regScore,
      navScore: anacExamAttempts.navScore,
      mecScore: anacExamAttempts.mecScore,
      tvoScore: anacExamAttempts.tvoScore,
      approved: anacExamAttempts.approved,
      createdAt: anacExamAttempts.createdAt,
    })
    .from(anacExamAttempts)
    .where(eq(anacExamAttempts.userId, userId))
    .orderBy(desc(anacExamAttempts.examDate), desc(anacExamAttempts.createdAt));
}

/** Registra uma tentativa para o usuário autenticado; o userId nunca vem do cliente. */
export async function createAnacExamAttempt(userId: number, input: AnacExamAttemptInput) {
  const db = await requireDb();
  const attempt = { id: `anac_${nanoid(20)}`, userId, ...input };
  await db.insert(anacExamAttempts).values(attempt);
  return attempt;
}

export type CreditLedgerEntryType = "trial_grant" | "purchase_grant" | "question_debit" | "adjustment_grant" | "adjustment_debit" | "refund_debit";

type CreditBalanceRow = {
  userId: number;
  availableCredits: number;
  lifetimeGranted: number;
  lifetimeConsumed: number;
  updatedAt: Date;
};

async function lockCreditBalance(tx: any, userId: number): Promise<CreditBalanceRow> {
  await tx.insert(creditBalances).values({ userId }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
  await tx.execute(sql`SELECT userId FROM credit_balances WHERE userId = ${userId} FOR UPDATE`);
  const balance = (await tx.select().from(creditBalances).where(eq(creditBalances.userId, userId)).limit(1))[0];
  if (!balance) throw new Error("Não foi possível inicializar o saldo de créditos.");
  return balance;
}

/** Garante o benefício inicial uma única vez para contas novas e já existentes. */
export async function ensureCreditBalance(userId: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const balance = await lockCreditBalance(tx, userId);
    const existingTrial = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), eq(creditLedger.referenceType, "trial"), eq(creditLedger.referenceId, "initial")))
      .limit(1);
    if (existingTrial[0]) return balance;

    const availableCredits = nextBalance(balance.availableCredits, BILLING_MODE.trialCredits);
    await tx.insert(creditLedger).values({
      id: nanoid(),
      userId,
      entryType: "trial_grant",
      deltaCredits: BILLING_MODE.trialCredits,
      balanceAfter: availableCredits,
      referenceType: "trial",
      referenceId: "initial",
      idempotencyKey: `trial-initial:${userId}`,
      metadataJson: JSON.stringify({ source: "account-initialization", creditQuantity: BILLING_MODE.trialCredits }),
    });
    await tx.update(creditBalances).set({
      availableCredits,
      lifetimeGranted: balance.lifetimeGranted + BILLING_MODE.trialCredits,
    }).where(eq(creditBalances.userId, userId));
    return { ...balance, availableCredits, lifetimeGranted: balance.lifetimeGranted + BILLING_MODE.trialCredits, updatedAt: new Date() };
  });
}

export async function getCreditBalance(userId: number) {
  await ensureCreditBalance(userId);
  const db = await requireDb();
  const balance = (await db.select().from(creditBalances).where(eq(creditBalances.userId, userId)).limit(1))[0];
  if (!balance) throw new Error("Saldo de créditos não encontrado.");
  return balance;
}

export async function listCreditLedger(userId: number, limit = 20) {
  await ensureCreditBalance(userId);
  const db = await requireDb();
  return db
    .select({
      id: creditLedger.id,
      entryType: creditLedger.entryType,
      deltaCredits: creditLedger.deltaCredits,
      balanceAfter: creditLedger.balanceAfter,
      referenceType: creditLedger.referenceType,
      createdAt: creditLedger.createdAt,
    })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}

async function debitCreditInTransaction(tx: any, input: { userId: number; questionId: string; questionNumber: number }) {
  const balance = await lockCreditBalance(tx, input.userId);
  const existing = await tx
    .select({ id: creditLedger.id, balanceAfter: creditLedger.balanceAfter })
    .from(creditLedger)
    .where(and(eq(creditLedger.userId, input.userId), eq(creditLedger.referenceType, "study_question"), eq(creditLedger.referenceId, input.questionId)))
    .limit(1);
  if (existing[0]) {
    return { charged: false, idempotent: true, experimentalAccess: false, balance: { ...balance, availableCredits: existing[0].balanceAfter } };
  }

  const availableCredits = nextBalance(balance.availableCredits, -1);
  await tx.insert(creditLedger).values({
    id: nanoid(),
    userId: input.userId,
    entryType: "question_debit",
    deltaCredits: -1,
    balanceAfter: availableCredits,
    referenceType: "study_question",
    referenceId: input.questionId,
    idempotencyKey: `study-question:${input.questionId}`,
    metadataJson: JSON.stringify({ questionNumber: input.questionNumber }),
  });
  await tx.update(creditBalances).set({
    availableCredits,
    lifetimeConsumed: balance.lifetimeConsumed + 1,
  }).where(eq(creditBalances.userId, input.userId));
  return { charged: true, idempotent: false, experimentalAccess: false, balance: { ...balance, availableCredits, lifetimeConsumed: balance.lifetimeConsumed + 1, updatedAt: new Date() } };
}

/**
 * Debita exatamente uma vez pela apresentação de uma questão. Durante a fase
 * experimental retorna sem débito; quando ativado, saldo insuficiente reverte
 * a entrega antes de qualquer questão se tornar visível ao aluno.
 */
export async function debitCreditForQuestion(input: { userId: number; questionId: string; questionNumber: number }) {
  if (!BILLING_MODE.enforceStudyCredits) {
    return { charged: false, idempotent: false, experimentalAccess: true, balance: await getCreditBalance(input.userId) };
  }

  const db = await requireDb();
  return db.transaction(tx => debitCreditInTransaction(tx, input));
}

/** Cria apenas o pedido interno; nenhuma chamada ao PagBank ou cobrança ocorre nesta etapa. */
export async function createBillingOrder(input: { userId: number; productKey: PrepaidProductKey; idempotencyKey: string; environment?: "sandbox" | "production" }) {
  const product = getPrepaidProduct(input.productKey);
  if (!product) throw new Error("Pacote de créditos indisponível.");
  const db = await requireDb();
  return db.transaction(async tx => {
    const existing = await tx
      .select()
      .from(billingOrders)
      .where(and(eq(billingOrders.userId, input.userId), eq(billingOrders.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing[0]) {
      if (existing[0].productKey !== product.key) throw new Error("A chave de idempotência já está vinculada a outro pacote.");
      return { order: existing[0], idempotent: true };
    }

    const order = {
      id: `ord_${nanoid(20)}`,
      userId: input.userId,
      productKey: product.key,
      status: "draft" as const,
      amountCents: product.amountCents,
      currency: "BRL",
      creditQuantity: product.credits,
      provider: "pagbank",
      environment: input.environment ?? "sandbox",
      referenceId: `ppa-${input.userId}-${nanoid(16)}`,
      idempotencyKey: input.idempotencyKey,
      metadataJson: JSON.stringify({ catalogVersion: "2026-09", productName: product.name }),
    };
    await tx.insert(billingOrders).values(order);
    return { order, idempotent: false };
  });
}

export async function savePagBankSandboxCheckout(input: {
  userId: number;
  orderId: string;
  checkoutId: string;
  checkoutUrl: string;
  expiresAt: Date;
  requestPayloadHash: string;
  responsePayloadHash: string;
  environment?: "sandbox" | "production";
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const environment = input.environment ?? "sandbox";
    const order = (await tx.select().from(billingOrders).where(and(eq(billingOrders.id, input.orderId), eq(billingOrders.userId, input.userId), eq(billingOrders.environment, environment))).limit(1))[0];
    if (!order) throw new Error("Pedido indisponível para esta conta.");
    if (order.checkoutUrl && order.checkoutUrl !== input.checkoutUrl) throw new Error("O pedido já possui um checkout diferente associado.");

    await tx.update(billingOrders).set({ status: "pending", checkoutUrl: input.checkoutUrl, expiresAt: input.expiresAt }).where(eq(billingOrders.id, order.id));
    const attemptId = `pay_${nanoid(20)}`;
    await tx.insert(paymentAttempts).values({
      id: attemptId,
      orderId: order.id,
      userId: input.userId,
      provider: "pagbank",
      environment,
      status: "waiting",
      externalPaymentId: input.checkoutId,
      externalReference: order.referenceId,
      idempotencyKey: `checkout:${order.id}`,
      requestPayloadHash: input.requestPayloadHash,
      responsePayloadHash: input.responsePayloadHash,
    }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
    return { order: { ...order, status: "pending" as const, checkoutUrl: input.checkoutUrl, expiresAt: input.expiresAt }, checkoutId: input.checkoutId };
  });
}

export async function recordHomologationAuditEvent(input: {
  actorUserId: number;
  orderId: string | null;
  operation: HomologationAuditOperation;
  outcome: HomologationAuditOutcome;
  request: unknown;
  response: unknown;
  environment?: "sandbox" | "production";
}) {
  const db = await requireDb();
  const requestEvidenceJson = sanitizeHomologationEvidence(input.request);
  const responseEvidenceJson = sanitizeHomologationEvidence(input.response);
  return db.transaction(async tx => {
    const actor = (await tx.select({ role: users.role }).from(users).where(eq(users.id, input.actorUserId)).limit(1))[0];
    if (actor?.role !== "homologation") return null;
    const id = `hml_${nanoid(20)}`;
    await tx.insert(homologationAuditEvents).values({
      id,
      actorUserId: input.actorUserId,
      orderId: input.orderId,
      operation: input.operation,
      outcome: input.outcome,
      environment: input.environment ?? "sandbox",
      requestEvidenceJson,
      responseEvidenceJson,
      requestHash: evidenceHash(requestEvidenceJson),
      responseHash: evidenceHash(responseEvidenceJson),
    });
    return id;
  });
}

export async function listHomologationAuditEvents(actorUserId: number, limit = 50, environment?: "sandbox" | "production") {
  const db = await requireDb();
  return db
    .select({
      id: homologationAuditEvents.id,
      operation: homologationAuditEvents.operation,
      outcome: homologationAuditEvents.outcome,
      requestHash: homologationAuditEvents.requestHash,
      responseHash: homologationAuditEvents.responseHash,
      createdAt: homologationAuditEvents.createdAt,
      exportedAt: homologationAuditEvents.exportedAt,
    })
    .from(homologationAuditEvents)
    .where(environment ? and(eq(homologationAuditEvents.actorUserId, actorUserId), eq(homologationAuditEvents.environment, environment)) : eq(homologationAuditEvents.actorUserId, actorUserId))
    .orderBy(desc(homologationAuditEvents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function exportHomologationAuditEvents(actorUserId: number, eventIds: string[], environment: "sandbox" | "production" = "sandbox") {
  const db = await requireDb();
  const ids = Array.from(new Set(eventIds)).slice(0, 100);
  if (ids.length === 0) throw new Error("Nenhum evento de homologação foi selecionado.");
  return db.transaction(async tx => {
    const events = await tx
      .select({
        id: homologationAuditEvents.id,
        orderId: homologationAuditEvents.orderId,
        operation: homologationAuditEvents.operation,
        outcome: homologationAuditEvents.outcome,
        requestEvidenceJson: homologationAuditEvents.requestEvidenceJson,
        responseEvidenceJson: homologationAuditEvents.responseEvidenceJson,
        requestHash: homologationAuditEvents.requestHash,
        responseHash: homologationAuditEvents.responseHash,
        createdAt: homologationAuditEvents.createdAt,
        environment: homologationAuditEvents.environment,
      })
      .from(homologationAuditEvents)
      .where(and(eq(homologationAuditEvents.actorUserId, actorUserId), eq(homologationAuditEvents.environment, environment), inArray(homologationAuditEvents.id, ids)));
    if (events.length !== ids.length) throw new Error("Um ou mais eventos não pertencem ao usuário de homologação.");
    await tx.update(homologationAuditEvents).set({ exportedAt: new Date() }).where(and(eq(homologationAuditEvents.actorUserId, actorUserId), inArray(homologationAuditEvents.id, ids)));
    return buildPagBankHomologationExport({ environment, events });
  });
}

type PagBankWebhookStatus = "waiting" | "in_analysis" | "paid" | "declined" | "canceled" | "expired" | "unknown";

/** Nunca confia no corpo sem assinatura: no Sandbox consulta o pedido por TLS autenticado e só então reutiliza o processamento idempotente. */
export async function reconcilePagBankSandboxOrder(input: { token: string; externalOrderId: string; fetchImpl?: typeof fetch }) {
  const { snapshot, rawBody } = await fetchPagBankSandboxOrder(input);
  const db = await requireDb();
  const order = (await db.select().from(billingOrders).where(and(eq(billingOrders.referenceId, snapshot.referenceId), eq(billingOrders.provider, "pagbank"), eq(billingOrders.environment, "sandbox"))).limit(1))[0];
  if (!order) throw new Error("O pedido consultado não pertence a uma compra PPA pendente.");
  const requestEvidence = { method: "GET", resource: "/orders/:orderId", externalOrderId: snapshot.externalOrderId };
  let responseEvidence: unknown;
  try {
    responseEvidence = JSON.parse(rawBody) as unknown;
  } catch {
    responseEvidence = { bodyFormat: "non_json", bodyBytes: Buffer.byteLength(rawBody) };
  }
  if (order.status !== "pending" && order.status !== "draft") {
    await recordHomologationAuditEvent({ actorUserId: order.userId, orderId: order.id, operation: "order_reconcile", outcome: "ignored", request: requestEvidence, response: responseEvidence });
    return { idempotent: true, credited: false, orderId: order.id };
  }
  if (order.productKey !== snapshot.itemReferenceId || order.amountCents !== snapshot.amountCents) {
    await recordHomologationAuditEvent({ actorUserId: order.userId, orderId: order.id, operation: "order_reconcile", outcome: "failed", request: requestEvidence, response: responseEvidence });
    throw new Error("Os dados financeiros retornados pelo PagBank não correspondem ao pedido interno.");
  }
  const result = await processPagBankWebhook({
    dedupeKey: `sandbox-reconcile:${snapshot.externalOrderId}:${snapshot.externalPaymentId ?? snapshot.status}`,
    payloadHash: sha256(rawBody),
    signatureHash: sha256(`sandbox-reconciliation:${snapshot.externalOrderId}`),
    referenceId: snapshot.referenceId,
    externalEventId: snapshot.externalOrderId,
    externalPaymentId: snapshot.externalPaymentId,
    status: snapshot.status,
    occurredAt: snapshot.occurredAt,
  });
  await recordHomologationAuditEvent({ actorUserId: order.userId, orderId: order.id, operation: "order_reconcile", outcome: "succeeded", request: requestEvidence, response: responseEvidence });
  return result;
}

/** Reconciliação de produção isolada por ambiente; nunca processa um pedido Sandbox. */
export async function reconcilePagBankProductionOrder(input: { token: string; externalOrderId: string; fetchImpl?: typeof fetch }) {
  const { snapshot, rawBody } = await fetchPagBankOrder({ ...input, apiUrl: PAGBANK_PRODUCTION_API_URL });
  const db = await requireDb();
  const order = (await db.select().from(billingOrders).where(and(eq(billingOrders.referenceId, snapshot.referenceId), eq(billingOrders.provider, "pagbank"), eq(billingOrders.environment, "production"))).limit(1))[0];
  if (!order) throw new Error("O pedido consultado não pertence a uma compra PPA pendente de produção.");
  const requestEvidence = { method: "GET", resource: "/orders/:orderId", externalOrderId: snapshot.externalOrderId, environment: "production" };
  let responseEvidence: unknown;
  try { responseEvidence = JSON.parse(rawBody) as unknown; } catch { responseEvidence = { bodyFormat: "non_json", bodyBytes: Buffer.byteLength(rawBody) }; }
  if (order.status !== "pending" && order.status !== "draft") {
    await recordHomologationAuditEvent({ actorUserId: order.userId, orderId: order.id, operation: "order_reconcile", outcome: "ignored", request: requestEvidence, response: responseEvidence, environment: "production" });
    return { idempotent: true, credited: false, orderId: order.id };
  }
  if (order.productKey !== snapshot.itemReferenceId || order.amountCents !== snapshot.amountCents) {
    await recordHomologationAuditEvent({ actorUserId: order.userId, orderId: order.id, operation: "order_reconcile", outcome: "failed", request: requestEvidence, response: responseEvidence, environment: "production" });
    throw new Error("Os dados financeiros retornados pelo PagBank não correspondem ao pedido interno.");
  }
  const result = await processPagBankWebhook({
    dedupeKey: `production-reconcile:${snapshot.externalOrderId}:${snapshot.externalPaymentId ?? snapshot.status}`,
    payloadHash: sha256(rawBody), signatureHash: sha256(`production-reconciliation:${snapshot.externalOrderId}`),
    referenceId: snapshot.referenceId, externalEventId: snapshot.externalOrderId, externalPaymentId: snapshot.externalPaymentId,
    status: snapshot.status, occurredAt: snapshot.occurredAt, environment: "production",
  });
  await recordHomologationAuditEvent({ actorUserId: order.userId, orderId: order.id, operation: "order_reconcile", outcome: "succeeded", request: requestEvidence, response: responseEvidence, environment: "production" });
  return result;
}

export async function processPagBankWebhook(input: {
  dedupeKey: string;
  payloadHash: string;
  signatureHash: string;
  referenceId: string | null;
  externalEventId: string | null;
  externalPaymentId: string | null;
  status: PagBankWebhookStatus;
  occurredAt: Date | null;
  environment?: "sandbox" | "production";
}) {
  const environment = input.environment ?? "sandbox";
  const db = await requireDb();
  const result = await db.transaction(async tx => {
    const eventId = `evt_${nanoid(20)}`;
    await tx.insert(paymentWebhookEvents).values({
      id: eventId,
      provider: "pagbank",
      environment,
      dedupeKey: input.dedupeKey,
      externalEventId: input.externalEventId,
      externalPaymentId: input.externalPaymentId,
      payloadHash: input.payloadHash,
      signatureHash: input.signatureHash,
      processingStatus: "received",
      occurredAt: input.occurredAt,
    }).onDuplicateKeyUpdate({ set: { receivedAt: new Date() } });
    const webhookEvent = (await tx.select().from(paymentWebhookEvents).where(and(eq(paymentWebhookEvents.provider, "pagbank"), eq(paymentWebhookEvents.environment, environment), eq(paymentWebhookEvents.dedupeKey, input.dedupeKey))).limit(1))[0];
    if (!webhookEvent || webhookEvent.id !== eventId) return { idempotent: true, credited: false, orderId: webhookEvent?.orderId ?? null };

    const order = input.referenceId
      ? (await tx.select().from(billingOrders).where(and(eq(billingOrders.referenceId, input.referenceId), eq(billingOrders.provider, "pagbank"), eq(billingOrders.environment, environment))).limit(1))[0]
      : null;
    if (!order || input.status === "unknown") {
      await tx.update(paymentWebhookEvents).set({ processingStatus: "ignored", processedAt: new Date() }).where(eq(paymentWebhookEvents.id, eventId));
      return { idempotent: false, credited: false, orderId: null };
    }

    await tx.update(paymentWebhookEvents).set({ orderId: order.id }).where(eq(paymentWebhookEvents.id, eventId));
    if (input.externalPaymentId) {
      await tx.insert(paymentAttempts).values({
        id: `pay_${nanoid(20)}`,
        orderId: order.id,
        userId: order.userId,
        provider: "pagbank",
        environment,
        status: input.status,
        externalPaymentId: input.externalPaymentId,
        externalReference: order.referenceId,
        idempotencyKey: `webhook:${input.externalPaymentId}:${input.status}`,
        responsePayloadHash: input.payloadHash,
      }).onDuplicateKeyUpdate({ set: { status: input.status, updatedAt: new Date() } });
    }

    if (input.status !== "paid") {
      const orderStatus = input.status === "declined" ? "failed" : input.status === "canceled" ? "cancelled" : input.status === "expired" ? "expired" : "pending";
      await tx.update(billingOrders).set({ status: orderStatus, externalOrderId: input.externalEventId ?? order.externalOrderId }).where(eq(billingOrders.id, order.id));
      await tx.update(paymentWebhookEvents).set({ processingStatus: "processed", processedAt: new Date() }).where(eq(paymentWebhookEvents.id, eventId));
      return { idempotent: false, credited: false, orderId: order.id };
    }

    const balance = await lockCreditBalance(tx, order.userId);
    const existingGrant = (await tx.select({ id: creditLedger.id }).from(creditLedger).where(and(eq(creditLedger.userId, order.userId), eq(creditLedger.referenceType, "billing_order"), eq(creditLedger.referenceId, order.id))).limit(1))[0];
    if (!existingGrant) {
      const availableCredits = nextBalance(balance.availableCredits, order.creditQuantity);
      await tx.insert(creditLedger).values({
        id: nanoid(), userId: order.userId, entryType: "purchase_grant", deltaCredits: order.creditQuantity, balanceAfter: availableCredits,
        referenceType: "billing_order", referenceId: order.id, idempotencyKey: `purchase:${order.id}`,
        metadataJson: JSON.stringify({ provider: "pagbank", externalOrderId: input.externalEventId, externalPaymentId: input.externalPaymentId, amountCents: order.amountCents, currency: order.currency }),
      });
      await tx.update(creditBalances).set({ availableCredits, lifetimeGranted: balance.lifetimeGranted + order.creditQuantity }).where(eq(creditBalances.userId, order.userId));
    }
    await tx.update(billingOrders).set({ status: "paid", paidAt: new Date(), externalOrderId: input.externalEventId ?? order.externalOrderId }).where(eq(billingOrders.id, order.id));
    await tx.update(paymentWebhookEvents).set({ processingStatus: "processed", processedAt: new Date() }).where(eq(paymentWebhookEvents.id, eventId));
    return { idempotent: false, credited: !existingGrant, orderId: order.id };
  });
  if (result.orderId) {
    const order = (await db.select({
      userId: billingOrders.userId,
      status: billingOrders.status,
      productKey: billingOrders.productKey,
      amountCents: billingOrders.amountCents,
      creditQuantity: billingOrders.creditQuantity,
    }).from(billingOrders).where(eq(billingOrders.id, result.orderId)).limit(1))[0];
    if (order) {
      await recordHomologationAuditEvent({
        actorUserId: order.userId,
        orderId: result.orderId,
        operation: "webhook_received",
        outcome: result.idempotent ? "ignored" : "succeeded",
        environment,
        request: { source: "pagbank_webhook", environment, referenceId: input.referenceId, status: input.status, externalOrderId: input.externalEventId, externalPaymentId: input.externalPaymentId },
        response: { idempotent: result.idempotent, credited: result.credited, processing: "completed" },
      });
      await recordHomologationAuditEvent({
        actorUserId: order.userId,
        orderId: result.orderId,
        operation: "credit_settlement",
        outcome: result.credited ? "succeeded" : "ignored",
        environment,
        request: { source: "ppa_ledger", trigger: "pagbank_webhook", paymentStatus: input.status, productKey: order.productKey, amountCents: order.amountCents, creditQuantity: order.creditQuantity },
        response: { orderStatus: order.status, ledgerGrantCreated: result.credited, idempotent: result.idempotent },
      });
    }
  }
  return result;
}

export async function listBillingOrders(userId: number, limit = 10) {
  const db = await requireDb();
  return db
    .select({
      id: billingOrders.id,
      productKey: billingOrders.productKey,
      status: billingOrders.status,
      amountCents: billingOrders.amountCents,
      creditQuantity: billingOrders.creditQuantity,
      createdAt: billingOrders.createdAt,
      paidAt: billingOrders.paidAt,
    })
    .from(billingOrders)
    .where(eq(billingOrders.userId, userId))
    .orderBy(desc(billingOrders.createdAt))
    .limit(Math.min(Math.max(limit, 1), 25));
}

/** Retorno de checkout limitado ao proprietário: não expõe pagador, cobrança, URL ou dados externos. */
export async function getBillingCheckoutReturnStatus(userId: number, referenceId: string) {
  const db = await requireDb();
  return (await db
    .select({
      status: billingOrders.status,
      creditQuantity: billingOrders.creditQuantity,
      productKey: billingOrders.productKey,
      paidAt: billingOrders.paidAt,
    })
    .from(billingOrders)
    .where(and(eq(billingOrders.userId, userId), eq(billingOrders.referenceId, referenceId), eq(billingOrders.provider, "pagbank")))
     .limit(1))[0] ?? null;
}

/** Registra etapas do navegador somente quando a referência pertence à própria conta de homologação. */
export async function recordSandboxCheckoutLifecycle(input: {
  userId: number;
  referenceId: string;
  operation: "checkout_opened" | "checkout_return";
  environment?: "sandbox" | "production";
}) {
  const db = await requireDb();
  const environment = input.environment ?? "sandbox";
  const order = (await db
    .select({
      id: billingOrders.id,
      referenceId: billingOrders.referenceId,
      status: billingOrders.status,
      productKey: billingOrders.productKey,
      amountCents: billingOrders.amountCents,
      creditQuantity: billingOrders.creditQuantity,
      externalOrderId: billingOrders.externalOrderId,
      expiresAt: billingOrders.expiresAt,
      checkoutUrl: billingOrders.checkoutUrl,
    })
    .from(billingOrders)
    .where(and(eq(billingOrders.userId, input.userId), eq(billingOrders.referenceId, input.referenceId), eq(billingOrders.provider, "pagbank"), eq(billingOrders.environment, environment)))
    .limit(1))[0];
  if (!order) return null;

  return recordHomologationAuditEvent({
    actorUserId: input.userId,
    orderId: order.id,
    operation: input.operation,
    outcome: "succeeded",
    environment,
    request: {
      source: "ppa_browser",
      route: "/planos",
      environment,
      referenceId: order.referenceId,
      checkout: { hostedLinkAvailable: Boolean(order.checkoutUrl), expiresAt: order.expiresAt },
    },
    response: {
      orderStatus: order.status,
      productKey: order.productKey,
      amountCents: order.amountCents,
      creditQuantity: order.creditQuantity,
      providerOrderLinked: Boolean(order.externalOrderId),
    },
  });
}

export async function recordLoginAttempt(emailHash: string, ipHash: string, succeeded: boolean) {
  const db = await requireDb();
  await db.insert(authLoginAttempts).values({ id: nanoid(), emailHash, ipHash, succeeded });
}

export async function failedLoginCount(emailHash: string, after: Date) {
  const db = await requireDb();
  const result = await db
    .select({ total: sql<number>`count(*)` })
    .from(authLoginAttempts)
    .where(and(eq(authLoginAttempts.emailHash, emailHash), eq(authLoginAttempts.succeeded, false), gt(authLoginAttempts.createdAt, after)));
  return Number(result[0]?.total ?? 0);
}

export async function getLatestCatalog() {
  const db = await requireDb();
  const catalog = await db.select().from(courseCatalogVersions).orderBy(desc(courseCatalogVersions.createdAt)).limit(1);
  if (!catalog[0]) throw new Error("Catálogo pedagógico não foi carregado.");
  return catalog[0];
}

/** Retorna somente a taxonomia pública do mapa; sem IDs, RAG, prioridades ou dados individuais. */
export async function getPublicCanonicalCatalog() {
  const db = await requireDb();
  const catalog = await getLatestCatalog();
  const rows = await db
    .select({
      canonicalIndex: canonicalConcepts.canonicalIndex,
      matterId: canonicalConcepts.matterId,
      matterName: canonicalConcepts.matterName,
      chapterId: canonicalConcepts.chapterId,
      chapterName: canonicalConcepts.chapterName,
      topicId: canonicalConcepts.topicId,
      topicName: canonicalConcepts.topicName,
      conceptName: canonicalConcepts.name,
    })
    .from(canonicalConcepts)
    .where(eq(canonicalConcepts.catalogVersionId, catalog.id))
    .orderBy(asc(canonicalConcepts.canonicalIndex));
  if (!rows.length) throw new Error("O catálogo pedagógico não possui conceitos disponíveis.");
  return buildPublicCanonicalCatalog(rows);
}

export async function listCacheWarmupConcepts() {
  const db = await requireDb();
  const catalog = await getLatestCatalog();
  const concepts = await db
    .select()
    .from(canonicalConcepts)
    .where(eq(canonicalConcepts.catalogVersionId, catalog.id))
    .orderBy(asc(canonicalConcepts.canonicalIndex));
  return { catalog, concepts };
}

export async function listApprovedCacheForConcept(input: { catalogVersionId: string; conceptId: string; ragSourceId: string }) {
  const db = await requireDb();
  return db
    .select()
    .from(sharedQuestionCache)
    .where(and(
      eq(sharedQuestionCache.catalogVersionId, input.catalogVersionId),
      eq(sharedQuestionCache.conceptId, input.conceptId),
      eq(sharedQuestionCache.ragSourceId, input.ragSourceId),
      eq(sharedQuestionCache.status, "approved"),
    ))
    .orderBy(asc(sharedQuestionCache.createdAt));
}

export async function getLatestReadyKnowledgeSource() {
  const db = await requireDb();
  return (await db.select({ id: knowledgeSources.id, sourceChecksum: knowledgeSources.sourceChecksum }).from(knowledgeSources).where(eq(knowledgeSources.status, "ready")).orderBy(desc(knowledgeSources.indexedAt)).limit(1))[0] ?? null;
}

export async function retrieveRagEvidence(concepts: RagConcept[]): Promise<RagEvidence> {
  const db = await requireDb();
  const tokens = tokenizeForRetrieval(buildRagQuery(concepts));
  if (!tokens.length) throw new Error("Não há termos válidos para a recuperação de conhecimento.");
  const source = await getLatestReadyKnowledgeSource();
  if (!source) throw new Error("A base EAD ainda não está disponível para recuperação.");
  const matches = await db
    .select({ chunk: knowledgeChunks, weight: knowledgeChunkTerms.weight })
    .from(knowledgeChunkTerms)
    .innerJoin(knowledgeChunks, eq(knowledgeChunkTerms.chunkId, knowledgeChunks.id))
    .where(and(eq(knowledgeChunkTerms.sourceId, source.id), inArray(knowledgeChunkTerms.token, tokens)));
  const ranked = new Map<string, { id: string; sourcePath: string; content: string; score: number }>();
  for (const match of matches) {
    const current = ranked.get(match.chunk.id) ?? { id: match.chunk.id, sourcePath: match.chunk.sourcePath, content: match.chunk.content, score: 0 };
    current.score += match.weight;
    ranked.set(match.chunk.id, current);
  }
  let evidence = composeRagContext(Array.from(ranked.values()).sort((a, b) => b.score - a.score || a.sourcePath.localeCompare(b.sourcePath)));
  if (!evidence) {
    const fallback = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id)).orderBy(asc(knowledgeChunks.ordinal)).limit(3);
    evidence = composeRagContext(fallback);
  }
  if (!evidence) throw new Error("Não foi encontrado material EAD relevante para o conceito solicitado.");
  return { ...evidence, sourceId: source.id, sourceChecksum: source.sourceChecksum };
}

export async function getCanonicalConceptsByIds(conceptIds: string[]) {
  const db = await requireDb();
  if (!conceptIds.length) return [];
  return db.select().from(canonicalConcepts).where(inArray(canonicalConcepts.id, conceptIds));
}

export function questionSignature(input: { ragSourceChecksum: string; conceptId: string; conceptIds?: string[]; prompt: string; optionA: string; optionB: string; optionC: string; correctOption: "A" | "B" | "C" }) {
  return createHash("sha256").update(JSON.stringify({
    source: input.ragSourceChecksum,
    concepts: [...(input.conceptIds ?? [input.conceptId])].sort(),
    prompt: input.prompt.trim().toLocaleLowerCase("pt-BR"),
    options: [input.optionA, input.optionB, input.optionC].map(option => option.trim().toLocaleLowerCase("pt-BR")),
    correct: input.correctOption,
  })).digest("hex");
}

export async function findEligibleCachedQuestion(input: { userId: number; catalogVersionId: string; conceptId: string; conceptIds?: string[]; ragSourceId: string }) {
  const db = await requireDb();
  const rows = await db
    .select({ cache: sharedQuestionCache })
    .from(sharedQuestionCache)
    .leftJoin(studyQuestions, and(eq(studyQuestions.cacheQuestionId, sharedQuestionCache.id), eq(studyQuestions.userId, input.userId)))
    .where(and(
      eq(sharedQuestionCache.catalogVersionId, input.catalogVersionId),
      eq(sharedQuestionCache.conceptId, input.conceptId),
      eq(sharedQuestionCache.ragSourceId, input.ragSourceId),
      eq(sharedQuestionCache.status, "approved"),
      isNotNull(sharedQuestionCache.feedbackCorrectMarkdown),
      isNotNull(sharedQuestionCache.feedbackIncorrectMarkdown),
      isNotNull(sharedQuestionCache.feedbackTeachMarkdown),
      isNull(studyQuestions.id),
    ))
    .orderBy(asc(sharedQuestionCache.deliveryCount), desc(sharedQuestionCache.lastUsedAt), asc(sharedQuestionCache.createdAt))
    .limit(16);
  const expectedConceptIds = [...(input.conceptIds ?? [input.conceptId])].sort();
  return rows.map(row => row.cache).find(cache => {
    const cachedConceptIds = cache.conceptIdsJson ? JSON.parse(cache.conceptIdsJson) as string[] : [cache.conceptId];
    return cachedConceptIds.length === expectedConceptIds.length && cachedConceptIds.every((conceptId, index) => conceptId === expectedConceptIds[index]);
  });
}

export async function storeSharedQuestion(input: {
  catalogVersionId: string;
  conceptId: string;
  conceptIds?: string[];
  ragSourceId: string;
  ragSourceChecksum: string;
  ragChunkIds: string[];
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  correctOption: "A" | "B" | "C";
  validationNote: string;
  warmup?: { batchId: string; wave: number };
}) {
  const db = await requireDb();
  const signature = questionSignature(input);
  const id = `sqc_${signature.slice(0, 40)}`;
  await db.insert(sharedQuestionCache).values({
    id, catalogVersionId: input.catalogVersionId, conceptId: input.conceptId,
    conceptIdsJson: JSON.stringify(input.conceptIds ?? [input.conceptId]),
    ragSourceId: input.ragSourceId, ragSourceChecksum: input.ragSourceChecksum,
    ragChunkIdsJson: JSON.stringify(input.ragChunkIds), questionSignature: signature,
    prompt: input.prompt, optionA: input.optionA, optionB: input.optionB, optionC: input.optionC,
    correctOption: input.correctOption,
    validationJson: JSON.stringify({ generatedAt: new Date().toISOString(), note: input.validationNote, provenance: "EAD_RAG", warmup: input.warmup ?? null }),
  }).onDuplicateKeyUpdate({ set: { lastUsedAt: new Date() } });
  return (await db.select().from(sharedQuestionCache).where(eq(sharedQuestionCache.questionSignature, signature)).limit(1))[0];
}

export async function getCachedFeedback(cacheQuestionId: string | null, classification: "correct" | "incorrect" | "me_ensine") {
  if (!cacheQuestionId) return null;
  const db = await requireDb();
  const cache = (await db.select().from(sharedQuestionCache).where(and(eq(sharedQuestionCache.id, cacheQuestionId), eq(sharedQuestionCache.status, "approved"))).limit(1))[0];
  if (!cache) return null;
  return classification === "correct" ? cache.feedbackCorrectMarkdown : classification === "incorrect" ? cache.feedbackIncorrectMarkdown : cache.feedbackTeachMarkdown;
}

export async function storeCachedFeedback(cacheQuestionId: string | null, classification: "correct" | "incorrect" | "me_ensine", feedbackMarkdown: string) {
  if (!cacheQuestionId) return;
  const db = await requireDb();
  const field = classification === "correct" ? "feedbackCorrectMarkdown" : classification === "incorrect" ? "feedbackIncorrectMarkdown" : "feedbackTeachMarkdown";
  await db.update(sharedQuestionCache).set({ [field]: feedbackMarkdown, feedbackGenerationCount: sql`${sharedQuestionCache.feedbackGenerationCount} + 1`, lastUsedAt: new Date() }).where(eq(sharedQuestionCache.id, cacheQuestionId));
}

export async function retireCachedQuestion(cacheQuestionId: string, reason: string) {
  const db = await requireDb();
  await db.update(sharedQuestionCache).set({ status: "retired", retiredAt: new Date(), retiredReason: reason }).where(and(eq(sharedQuestionCache.id, cacheQuestionId), eq(sharedQuestionCache.status, "approved")));
}

export async function getCacheMetrics() {
  const db = await requireDb();
  return db
    .select({
      id: sharedQuestionCache.id,
      concept: canonicalConcepts.name,
      status: sharedQuestionCache.status,
      deliveryCount: sharedQuestionCache.deliveryCount,
      correctDeliveries: sharedQuestionCache.correctDeliveries,
      incorrectDeliveries: sharedQuestionCache.incorrectDeliveries,
      teachDeliveries: sharedQuestionCache.teachDeliveries,
      feedbackGenerationCount: sharedQuestionCache.feedbackGenerationCount,
      retiredAt: sharedQuestionCache.retiredAt,
      retiredReason: sharedQuestionCache.retiredReason,
    })
    .from(sharedQuestionCache)
    .innerJoin(canonicalConcepts, eq(sharedQuestionCache.conceptId, canonicalConcepts.id))
    .orderBy(desc(sharedQuestionCache.lastUsedAt))
    .limit(100);
}

export async function getOrCreateReadinessMap(userId: number) {
  const db = await requireDb();
  const existing = await db.select().from(studentReadinessMaps).where(eq(studentReadinessMaps.userId, userId)).limit(1);
  if (existing[0]) return existing[0];

  const catalog = await getLatestCatalog();
  const map = initialReadinessMap(catalog.version);
  const serialized = JSON.stringify(map);
  const record = {
    id: nanoid(),
    userId,
    catalogVersionId: catalog.id,
    currentVersion: 0,
    mapJson: serialized,
    checksum: readinessChecksum(map),
    integrityStatus: "valid" as const,
  };
  await db.insert(studentReadinessMaps).values(record);
  return { ...record, updatedAt: new Date(), lastEventId: null };
}

function parseAssessmentMatrix(raw: string): AssessmentMatrixSlot[] {
  const parsed = JSON.parse(raw) as AssessmentMatrixSlot[];
  if (!Array.isArray(parsed) || parsed.length !== 100 || parsed.some(slot => !slot?.slot || !slot.matterId || !Array.isArray(slot.conceptIds))) {
    throw new Error("Matriz diagnóstica inválida.");
  }
  return parsed;
}

export async function getOrCreateStudyProgram(userId: number) {
  const db = await requireDb();
  const existing = await db.select().from(studentStudyPrograms).where(eq(studentStudyPrograms.userId, userId)).limit(1);
  if (existing[0]) return existing[0];

  const catalog = await getLatestCatalog();
  const concepts = await db.select().from(canonicalConcepts).where(eq(canonicalConcepts.catalogVersionId, catalog.id));
  const program = {
    id: `program_${nanoid(20)}`,
    userId,
    catalogVersionId: catalog.id,
    diagnosticStatus: "active" as const,
    selectedMode: null,
    diagnosticPlanJson: JSON.stringify(buildAssessmentMatrix(concepts)),
    diagnosticSessionId: null,
  };
  try {
    await db.insert(studentStudyPrograms).values(program);
  } catch (error) {
    const concurrent = await db.select().from(studentStudyPrograms).where(eq(studentStudyPrograms.userId, userId)).limit(1);
    if (concurrent[0]) return concurrent[0];
    throw error;
  }
  return { ...program, completedAt: null, selectedAt: null, createdAt: new Date(), updatedAt: new Date() };
}

export async function getOrCreateStudySession(input: { userId: number; mode: StudyMode; programId?: string; matrix?: AssessmentMatrixSlot[] }) {
  const db = await requireDb();
  const existing = await db
    .select()
    .from(studySessions)
    .where(and(
      eq(studySessions.userId, input.userId),
      eq(studySessions.mode, input.mode),
      eq(studySessions.status, "active"),
      ...(input.programId ? [eq(studySessions.programId, input.programId)] : []),
    ))
    .orderBy(desc(studySessions.updatedAt))
    .limit(1);
  if (existing[0]) return existing[0];

  const session = {
    id: nanoid(),
    userId: input.userId,
    mode: input.mode,
    programId: input.programId ?? null,
    matrixJson: input.matrix ? JSON.stringify(input.matrix) : null,
    status: "active" as const,
    resumedAt: new Date(),
  };
  await db.insert(studySessions).values(session);
  return {
    ...session,
    currentQuestionId: null,
    lastMatterId: null,
    consecutiveMatterQuestions: 0,
    questionsSinceLastReview: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function getOrCreateActiveSession(userId: number) {
  return getOrCreateStudySession({ userId, mode: "tutor" });
}

export async function startDiagnosticSession(userId: number) {
  const db = await requireDb();
  const program = await getOrCreateStudyProgram(userId);
  if (program.diagnosticStatus !== "active") return { program, session: null };
  const matrix = parseAssessmentMatrix(program.diagnosticPlanJson);
  const session = await getOrCreateStudySession({ userId, mode: "diagnostic", programId: program.id, matrix });
  if (!program.diagnosticSessionId) {
    await db.update(studentStudyPrograms).set({ diagnosticSessionId: session.id }).where(and(eq(studentStudyPrograms.id, program.id), eq(studentStudyPrograms.userId, userId)));
  }
  return { program: { ...program, diagnosticSessionId: program.diagnosticSessionId ?? session.id }, session };
}

export async function selectStudyMode(input: { userId: number; mode: SelectableStudyMode }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM student_study_programs WHERE userId = ${input.userId} FOR UPDATE`);
    const program = (await tx.select().from(studentStudyPrograms).where(eq(studentStudyPrograms.userId, input.userId)).limit(1))[0];
    if (!program) throw new Error("Conclua o diagnóstico antes de escolher uma modalidade.");
    const nextMode = nextModeAfterSelection({ status: program.diagnosticStatus, mode: input.mode });
    if (program.selectedMode && program.selectedMode !== input.mode) throw new Error("A modalidade já foi definida para esta conta.");
    const now = new Date();
    await tx.update(studentStudyPrograms).set({ diagnosticStatus: nextMode.diagnosticStatus, selectedMode: input.mode, selectedAt: now }).where(eq(studentStudyPrograms.userId, input.userId));
    return { ...program, diagnosticStatus: nextMode.diagnosticStatus, selectedMode: input.mode, selectedAt: now };
  });
}

export async function getStudyProgramStatus(userId: number) {
  const db = await requireDb();
  const program = await getOrCreateStudyProgram(userId);
  const matrix = parseAssessmentMatrix(program.diagnosticPlanJson);
  const delivered = program.diagnosticSessionId
    ? await db.select({ slot: studyQuestions.matrixSlot, status: studyQuestions.status }).from(studyQuestions).where(and(eq(studyQuestions.userId, userId), eq(studyQuestions.sessionId, program.diagnosticSessionId), eq(studyQuestions.studyMode, "diagnostic")))
    : [];
  const summary = assessmentMatrixSummary(matrix);
  const completedQuestions = delivered.filter(item => item.slot !== null && item.slot <= summary.totalQuestions && item.status === "answered").length;
  return {
    diagnosticStatus: program.diagnosticStatus,
    selectedMode: program.selectedMode,
    diagnostic: {
      completedQuestions,
      totalQuestions: summary.totalQuestions,
      matterCounts: summary.matterCounts,
      completedAt: program.completedAt,
    },
  };
}

export async function chooseMatrixQuestionCandidate(input: { userId: number; sessionId: string; matrix: AssessmentMatrixSlot[] }) {
  const db = await requireDb();
  const delivered = await db
    .select({ matrixSlot: studyQuestions.matrixSlot })
    .from(studyQuestions)
    .where(and(eq(studyQuestions.userId, input.userId), eq(studyQuestions.sessionId, input.sessionId)));
  const slot = nextMatrixSlot(input.matrix, delivered.flatMap(item => item.matrixSlot === null ? [] : [item.matrixSlot]));
  if (!slot) return null;
  const concepts = await db.select().from(canonicalConcepts).where(inArray(canonicalConcepts.id, slot.conceptIds));
  if (concepts.length !== slot.conceptIds.length) throw new Error("A matriz faz referência a conceitos indisponíveis no catálogo.");
  const byId = new Map(concepts.map(concept => [concept.id, concept]));
  return { slot, concepts: slot.conceptIds.map(conceptId => byId.get(conceptId)!), action: "new" as PedagogicalAction, questionNumber: slot.slot };
}

export async function getSelectedModeSession(userId: number) {
  const program = await getOrCreateStudyProgram(userId);
  if (program.diagnosticStatus !== "completed" || !program.selectedMode) {
    throw new Error("O diagnóstico deve ser concluído e a modalidade definida antes de continuar.");
  }
  if (program.selectedMode === "simulado") {
    return { program, session: await getOrCreateStudySession({ userId, mode: "simulado", programId: program.id, matrix: parseAssessmentMatrix(program.diagnosticPlanJson) }) };
  }
  return { program, session: await getOrCreateStudySession({ userId, mode: "tutor", programId: program.id }) };
}

export async function getOpenQuestion(userId: number, allowedModes?: StudyMode[]) {
  const db = await requireDb();
  return (
    await db
      .select({
        id: studyQuestions.id,
        questionNumber: studyQuestions.questionNumber,
        studyMode: studyQuestions.studyMode,
        prompt: studyQuestions.prompt,
        optionA: studyQuestions.optionA,
        optionB: studyQuestions.optionB,
        optionC: studyQuestions.optionC,
      })
      .from(studyQuestions)
      .where(and(
        eq(studyQuestions.userId, userId),
        eq(studyQuestions.status, "presented"),
        ...(allowedModes?.length ? [inArray(studyQuestions.studyMode, allowedModes)] : []),
      ))
      .orderBy(desc(studyQuestions.createdAt))
      .limit(1)
  )[0];
}

export async function nextQuestionNumber(userId: number) {
  const db = await requireDb();
  const result = await db.select({ highest: max(studyQuestions.questionNumber) }).from(studyQuestions).where(eq(studyQuestions.userId, userId));
  return Number(result[0]?.highest ?? 0) + 1;
}

export type QuestionCandidate = {
  concept: {
    id: string;
    canonicalIndex: number;
    matterId: string;
    matterName: string;
    chapterId: string;
    chapterName: string;
    topicId: string;
    topicName: string;
    name: string;
    priority: "P1" | "P2" | "P3" | "P4";
  };
  action: PedagogicalAction;
  avoidPrompt?: string;
};

const priorityRank = { P1: 1, P2: 2, P3: 3, P4: 4 };
const incidenceWeight: Record<string, number> = { very_high: 32, recurrent: 22, occasional: 10, none: 0 };

export function adaptiveSelectionWeight(input: {
  priority: "P1" | "P2" | "P3" | "P4";
  gapScore: number;
  recentIncidence: string;
  referenceQuestionCount: number;
  progress?: { questionsPresented: number; confidence: number; incorrect: number; lastIndependentAnswerAt: Date | null } | null;
}) {
  const progress = input.progress;
  const priority = (5 - priorityRank[input.priority]) * 100;
  const incidence = incidenceWeight[input.recentIncidence] ?? 0;
  const coverage = Math.max(0, 30 - Math.min(progress?.questionsPresented ?? 0, 6) * 5);
  const confidence = Math.max(0, 30 - Math.round((progress?.confidence ?? 0) * 0.3));
  const errors = Math.min((progress?.incorrect ?? 0) * 9, 27);
  const materialGap = input.referenceQuestionCount === 0 ? 8 : input.referenceQuestionCount < 5 ? 4 : 0;
  const recency = progress?.lastIndependentAnswerAt
    ? Math.min(18, Math.floor((Date.now() - progress.lastIndependentAnswerAt.getTime()) / 86_400_000))
    : 12;
  return priority + input.gapScore * 8 + incidence + coverage + confidence + errors + materialGap + recency;
}

export async function chooseQuestionCandidate(userId: number): Promise<QuestionCandidate> {
  const db = await requireDb();
  const map = await getOrCreateReadinessMap(userId);
  const session = await getOrCreateActiveSession(userId);
  const number = await nextQuestionNumber(userId);
  const now = new Date();

  const rows = await db
    .select({ concept: canonicalConcepts, progress: studentConceptReadiness })
    .from(canonicalConcepts)
    .leftJoin(
      studentConceptReadiness,
      and(eq(studentConceptReadiness.conceptId, canonicalConcepts.id), eq(studentConceptReadiness.userId, userId))
    )
    .where(eq(canonicalConcepts.catalogVersionId, map.catalogVersionId));

  const preserveMatterBalance = <T extends { concept: { matterId: string } }>(candidates: T[]) => {
    if (session.consecutiveMatterQuestions < 3) return candidates;
    const alternatives = candidates.filter(item => item.concept.matterId !== session.lastMatterId);
    return alternatives.length ? alternatives : candidates;
  };

  const rankCandidates = <T extends { concept: typeof canonicalConcepts.$inferSelect; progress: { questionsPresented: number; confidence: number; incorrect: number; lastIndependentAnswerAt: Date | null } | null }>(candidates: T[]) =>
    candidates.sort((a, b) => adaptiveSelectionWeight({ ...b.concept, progress: b.progress }) - adaptiveSelectionWeight({ ...a.concept, progress: a.progress }) || a.concept.canonicalIndex - b.concept.canonicalIndex);

  const immediate = rankCandidates(
    rows
      .filter(row => row.progress && ["relearning", "taught"].includes(row.progress.currentState))
      .filter(row => (row.progress?.reviewEligibleAfterQuestion ?? 0) <= number)
  );
  const spaced = rankCandidates(preserveMatterBalance(
    rows
      .filter(row => row.progress && !["relearning", "taught"].includes(row.progress.currentState))
      .filter(row => (row.progress?.reviewEligibleAfterQuestion ?? Number.MAX_SAFE_INTEGER) <= number)
      .filter(row => !row.progress?.reviewDueAt || row.progress.reviewDueAt <= now)
  ));
  const newConcepts = rankCandidates(preserveMatterBalance(
    rows
      .filter(row => !row.progress || row.progress.questionsPresented === 0)
  ));
  const fallback = rankCandidates(preserveMatterBalance(rows));
  const picked = immediate[0] ?? spaced[0] ?? newConcepts[0] ?? fallback[0];
  if (!picked) throw new Error("Nenhum conceito disponível no catálogo.");

  const action: PedagogicalAction = immediate[0] ? "immediate_review" : spaced[0] ? "spaced_review" : "new";
  const previous = await db
    .select({ prompt: studyQuestions.prompt, concepts: studyQuestions.conceptIdsJson })
    .from(studyQuestions)
    .where(eq(studyQuestions.userId, userId))
    .orderBy(desc(studyQuestions.createdAt))
    .limit(12);
  const avoidPrompt = previous.find(item => {
    try {
      return (JSON.parse(item.concepts) as string[]).includes(picked.concept.id);
    } catch {
      return false;
    }
  })?.prompt;

  return {
    concept: picked.concept,
    action,
    avoidPrompt,
  };
}

export async function persistQuestion(input: {
  userId: number;
  sessionId: string;
  questionNumber: number;
  conceptId: string;
  conceptIds?: string[];
  studyMode?: StudyMode;
  matrixSlot?: number;
  action: PedagogicalAction;
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  correctOption: "A" | "B" | "C";
  validationNote: string;
  cacheQuestionId?: string;
}) {
  const db = await requireDb();
  const id = nanoid();
  const conceptIds = input.conceptIds ?? [input.conceptId];
  if (BILLING_MODE.enforceStudyCredits) await ensureCreditBalance(input.userId);
  await db.transaction(async tx => {
    await tx.insert(studyQuestions).values({
      id,
      userId: input.userId,
      sessionId: input.sessionId,
      questionNumber: input.questionNumber,
      studyMode: input.studyMode ?? "tutor",
      matrixSlot: input.matrixSlot ?? null,
      prompt: input.prompt,
      optionA: input.optionA,
      optionB: input.optionB,
      optionC: input.optionC,
      correctOption: input.correctOption,
      conceptIdsJson: JSON.stringify(conceptIds),
      pedagogicalAction: input.action,
      validationJson: JSON.stringify({ generatedAt: new Date().toISOString(), note: input.validationNote, studyMode: input.studyMode ?? "tutor", matrixSlot: input.matrixSlot ?? null }),
      cacheQuestionId: input.cacheQuestionId ?? null,
    });
    if (BILLING_MODE.enforceStudyCredits) {
      await debitCreditInTransaction(tx, { userId: input.userId, questionId: id, questionNumber: input.questionNumber });
    }
    await tx.update(studySessions).set({ currentQuestionId: id }).where(and(eq(studySessions.id, input.sessionId), eq(studySessions.userId, input.userId)));
    if (input.cacheQuestionId) {
      await tx.update(sharedQuestionCache).set({ deliveryCount: sql`${sharedQuestionCache.deliveryCount} + 1`, lastUsedAt: new Date() }).where(eq(sharedQuestionCache.id, input.cacheQuestionId));
    }
  });
  return id;
}

export async function getSessionForQuestion(userId: number, questionId: string) {
  const db = await requireDb();
  return (
    await db
      .select({ session: studySessions, question: studyQuestions })
      .from(studyQuestions)
      .innerJoin(studySessions, eq(studyQuestions.sessionId, studySessions.id))
      .where(and(eq(studyQuestions.id, questionId), eq(studyQuestions.userId, userId), eq(studySessions.userId, userId)))
      .limit(1)
  )[0];
}

export async function recordAnswer(input: { userId: number; questionId: string; answer: ResponseInput; feedbackMarkdown: string }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM student_readiness_maps WHERE userId = ${input.userId} FOR UPDATE`);
    const found = await tx
      .select({ question: studyQuestions, session: studySessions, map: studentReadinessMaps })
      .from(studyQuestions)
      .innerJoin(studySessions, eq(studyQuestions.sessionId, studySessions.id))
      .innerJoin(studentReadinessMaps, eq(studentReadinessMaps.userId, studyQuestions.userId))
      .where(and(eq(studyQuestions.id, input.questionId), eq(studyQuestions.userId, input.userId), eq(studySessions.userId, input.userId)))
      .limit(1);
    const record = found[0];
    if (!record) throw new Error("Questão não encontrada para este estudante.");

    if (record.question.status === "answered") {
      const event = await tx.select().from(learningEvents).where(eq(learningEvents.questionId, record.question.id)).limit(1);
      return {
        idempotent: true,
        classification: event[0]?.classification ?? "incorrect",
        feedbackMarkdown: record.question.feedbackMarkdown ?? input.feedbackMarkdown,
        questionNumber: record.question.questionNumber,
      };
    }
    if (record.question.status !== "presented") throw new Error("Esta questão não está disponível para resposta.");

    const conceptIds = JSON.parse(record.question.conceptIdsJson) as string[];
    const now = new Date();
    const profiles = await tx
      .select()
      .from(studentConceptReadiness)
      .where(and(eq(studentConceptReadiness.userId, input.userId), inArray(studentConceptReadiness.conceptId, conceptIds)));
    const profilesByConcept = new Map(profiles.map(profile => [profile.conceptId, profile]));
    const transitionsByConcept = Object.fromEntries(conceptIds.map(conceptId => [
      conceptId,
      transitionProgress(
        profilesByConcept.get(conceptId),
        input.answer,
        record.question.correctOption,
        record.question.pedagogicalAction,
        record.question.questionNumber,
        now
      ),
    ]));
    const transition = transitionsByConcept[conceptIds[0]];
    const eventId = nanoid();
    const sourceMap = parseReadinessMap(record.map.mapJson);
    const nextMap = appendMapEvent(sourceMap, {
      eventId,
      conceptIds,
      progressByConcept: Object.fromEntries(conceptIds.map(conceptId => [conceptId, transitionsByConcept[conceptId].next])),
      transition,
      at: now,
    });
    const serializedMap = JSON.stringify(nextMap);
    const checksum = readinessChecksum(nextMap);

    await tx.insert(learningEvents).values({
      id: eventId,
      userId: input.userId,
      questionId: record.question.id,
      mapVersion: nextMap.current_version,
      eventType: transition.eventType,
      classification: transition.classification,
      answer: input.answer,
      correctAnswer: record.question.correctOption,
      conceptIdsJson: record.question.conceptIdsJson,
      auditNote: `Mapa ${nextMap.current_version} validado antes do commit.`,
    });
    if (record.question.cacheQuestionId) {
      if (transition.classification === "correct") {
        await tx.update(sharedQuestionCache).set({ correctDeliveries: sql`${sharedQuestionCache.correctDeliveries} + 1`, lastUsedAt: now }).where(eq(sharedQuestionCache.id, record.question.cacheQuestionId));
      } else if (transition.classification === "incorrect") {
        await tx.update(sharedQuestionCache).set({ incorrectDeliveries: sql`${sharedQuestionCache.incorrectDeliveries} + 1`, lastUsedAt: now }).where(eq(sharedQuestionCache.id, record.question.cacheQuestionId));
      } else {
        await tx.update(sharedQuestionCache).set({ teachDeliveries: sql`${sharedQuestionCache.teachDeliveries} + 1`, lastUsedAt: now }).where(eq(sharedQuestionCache.id, record.question.cacheQuestionId));
      }
    }

    for (const conceptId of conceptIds) {
      const profile = profilesByConcept.get(conceptId);
      const conceptTransition = transitionsByConcept[conceptId];
      await tx.insert(studentConceptReadiness).values({
        id: profile?.id ?? nanoid(),
        userId: input.userId,
        conceptId,
        ...conceptTransition.next,
        firstPresentedAt: profile?.firstPresentedAt ?? now,
        lastPresentedAt: now,
        lastIndependentAnswerAt: conceptTransition.classification === "me_ensine" ? profile?.lastIndependentAnswerAt ?? null : now,
        lastTeachAt: conceptTransition.classification === "me_ensine" ? now : profile?.lastTeachAt ?? null,
        lastReviewAt: record.question.pedagogicalAction === "new" ? profile?.lastReviewAt ?? null : now,
        reviewDueAt: conceptTransition.reviewDueAt,
      }).onDuplicateKeyUpdate({
        set: {
          ...conceptTransition.next,
          lastPresentedAt: now,
          lastIndependentAnswerAt: conceptTransition.classification === "me_ensine" ? profile?.lastIndependentAnswerAt ?? null : now,
          lastTeachAt: conceptTransition.classification === "me_ensine" ? now : profile?.lastTeachAt ?? null,
          lastReviewAt: record.question.pedagogicalAction === "new" ? profile?.lastReviewAt ?? null : now,
          reviewDueAt: conceptTransition.reviewDueAt,
        },
      });
    }

    await tx.update(studentReadinessMaps).set({
      currentVersion: nextMap.current_version,
      mapJson: serializedMap,
      checksum,
      integrityStatus: "valid",
      lastEventId: eventId,
    }).where(and(eq(studentReadinessMaps.id, record.map.id), eq(studentReadinessMaps.userId, input.userId)));

    await tx.insert(readinessMapVersions).values({
      id: nanoid(),
      mapId: record.map.id,
      userId: input.userId,
      version: nextMap.current_version,
      eventId,
      patchJson: JSON.stringify({ eventId, classification: transition.classification, conceptIds, states: Object.fromEntries(conceptIds.map(conceptId => [conceptId, transitionsByConcept[conceptId].next.currentState])) }),
      snapshotJson: nextMap.current_version % 20 === 0 ? serializedMap : null,
      checksum,
    });

    const consecutiveMatterQuestions = record.session.lastMatterId === (await tx.select({ matterId: canonicalConcepts.matterId }).from(canonicalConcepts).where(eq(canonicalConcepts.id, conceptIds[0])).limit(1))[0]?.matterId
      ? record.session.consecutiveMatterQuestions + 1
      : 1;
    const currentMatter = (await tx.select({ matterId: canonicalConcepts.matterId }).from(canonicalConcepts).where(eq(canonicalConcepts.id, conceptIds[0])).limit(1))[0]?.matterId ?? null;
    const completesDiagnostic = diagnosticStatusAfterAnswer({ currentStatus: "active", mode: record.session.mode, matrixSlot: record.question.matrixSlot }) === "mode_selection";
    const completesSimulation = sessionCompletesAfterAnswer({ mode: record.session.mode, matrixSlot: record.question.matrixSlot }) && record.session.mode === "simulado";
    await tx.update(studySessions).set({
      currentQuestionId: null,
      lastMatterId: currentMatter,
      consecutiveMatterQuestions,
      questionsSinceLastReview: record.question.pedagogicalAction === "new" ? record.session.questionsSinceLastReview + 1 : 0,
      ...(completesDiagnostic || completesSimulation ? { status: "completed" as const } : {}),
    }).where(and(eq(studySessions.id, record.session.id), eq(studySessions.userId, input.userId)));
    if (completesDiagnostic && record.session.programId) {
      await tx.update(studentStudyPrograms).set({ diagnosticStatus: "mode_selection", completedAt: now }).where(and(eq(studentStudyPrograms.id, record.session.programId), eq(studentStudyPrograms.userId, input.userId), eq(studentStudyPrograms.diagnosticStatus, "active")));
    }
    await tx.update(studyQuestions).set({ status: "answered", answeredAt: now, feedbackMarkdown: input.feedbackMarkdown }).where(and(eq(studyQuestions.id, record.question.id), eq(studyQuestions.userId, input.userId)));

    return {
      idempotent: false,
      classification: transition.classification,
      feedbackMarkdown: input.feedbackMarkdown,
      questionNumber: record.question.questionNumber,
      mapVersion: nextMap.current_version,
      milestone: record.session.mode === "simulado" ? null : assessmentMilestoneForQuestion(record.question.questionNumber),
      modeSelectionRequired: completesDiagnostic,
    };
  });
}

export async function getDashboardData(userId: number) {
  const db = await requireDb();
  const map = await getOrCreateReadinessMap(userId);
  const rows = await db
    .select({ concept: canonicalConcepts, progress: studentConceptReadiness })
    .from(canonicalConcepts)
    .leftJoin(studentConceptReadiness, and(eq(studentConceptReadiness.conceptId, canonicalConcepts.id), eq(studentConceptReadiness.userId, userId)))
    .where(eq(canonicalConcepts.catalogVersionId, map.catalogVersionId));
  const parsed = parseReadinessMap(map.mapJson);
  const due = rows.filter(row => row.progress?.reviewDueAt && row.progress.reviewDueAt <= new Date()).length;
  const subjects = Object.values(
    rows.reduce<Record<string, { id: string; name: string; presented: number; correct: number; independent: number; readinessTotal: number; readinessCount: number; chapters: Record<string, { id: string; name: string; presented: number; concepts: Array<{ id: string; name: string; topic: string; state: string; readiness: number; priority: string }> }> }>>((acc, row) => {
      const subject = (acc[row.concept.matterId] ??= { id: row.concept.matterId, name: row.concept.matterName, presented: 0, correct: 0, independent: 0, readinessTotal: 0, readinessCount: 0, chapters: {} });
      const progress = row.progress;
      subject.presented += progress?.questionsPresented ?? 0;
      subject.correct += progress?.correct ?? 0;
      subject.independent += progress?.independentAnswers ?? 0;
      if (progress?.questionsPresented) {
        subject.readinessTotal += progress.readinessScore;
        subject.readinessCount += 1;
      }
      const chapter = (subject.chapters[row.concept.chapterId] ??= { id: row.concept.chapterId, name: row.concept.chapterName, presented: 0, concepts: [] });
      chapter.presented += progress?.questionsPresented ?? 0;
      chapter.concepts.push({ id: row.concept.id, name: row.concept.name, topic: row.concept.topicName, state: progress?.currentState ?? "not_presented", readiness: progress?.readinessScore ?? 0, priority: row.concept.priority });
      return acc;
    }, {})
  ).map(subject => ({
    ...subject,
    coverage: Math.round((subject.readinessCount / Math.max(1, Object.values(subject.chapters).flatMap(chapter => chapter.concepts).length)) * 100),
    accuracy: subject.independent ? Math.round((subject.correct / subject.independent) * 100) : null,
    readiness: subject.readinessCount ? Math.round(subject.readinessTotal / subject.readinessCount) : 0,
    chapters: Object.values(subject.chapters),
  }));
  const gaps = rows
    .map(row => ({
      id: row.concept.id,
      name: row.concept.name,
      matter: row.concept.matterName,
      priority: row.concept.priority,
      readiness: row.progress?.readinessScore ?? 0,
      evidence: row.progress?.questionsPresented ?? 0,
    }))
    .sort((a, b) => priorityRank[a.priority as keyof typeof priorityRank] - priorityRank[b.priority as keyof typeof priorityRank] || a.readiness - b.readiness || a.evidence - b.evidence)
    .slice(0, 5);
  const latestAssessment = await db.select().from(progressAssessments).where(eq(progressAssessments.userId, userId)).orderBy(desc(progressAssessments.createdAt)).limit(1);
  const activeSession = await db.select().from(studySessions).where(and(eq(studySessions.userId, userId), eq(studySessions.status, "active"))).orderBy(desc(studySessions.updatedAt)).limit(1);
  const pendingQuestion = await getOpenQuestion(userId);
  return {
    mapVersion: map.currentVersion,
    counters: parsed.global_counters,
    dueReviews: due,
    subjects,
    gaps,
    latestAssessment: latestAssessment[0] ?? null,
    resumption: {
      active: Boolean(activeSession[0]),
      pendingQuestionNumber: pendingQuestion?.questionNumber ?? null,
      lastActivityAt: activeSession[0]?.updatedAt ?? null,
    },
  };
}

export async function createNotificationsForDueReviews(userId: number) {
  const db = await requireDb();
  const due = await db
    .select({ id: studentConceptReadiness.id, conceptName: canonicalConcepts.name })
    .from(studentConceptReadiness)
    .innerJoin(canonicalConcepts, eq(studentConceptReadiness.conceptId, canonicalConcepts.id))
    .where(and(eq(studentConceptReadiness.userId, userId), lte(studentConceptReadiness.reviewDueAt, new Date())))
    .limit(10);
  for (const review of due) {
    await db.insert(inAppNotifications).values({
      id: nanoid(), userId, kind: "review_due", title: "Revisão disponível", detail: `Há uma revisão disponível para retomar ${review.conceptName}.`, referenceType: "concept", referenceId: review.id, dedupeKey: `review-due:${review.id}`,
    }).onDuplicateKeyUpdate({ set: { detail: `Há uma revisão disponível para retomar ${review.conceptName}.` } });
  }
}

export async function listNotifications(userId: number) {
  const db = await requireDb();
  return db.select().from(inAppNotifications).where(eq(inAppNotifications.userId, userId)).orderBy(desc(inAppNotifications.createdAt)).limit(20);
}

export async function markNotificationRead(userId: number, id: string) {
  const db = await requireDb();
  await db.update(inAppNotifications).set({ readAt: new Date() }).where(and(eq(inAppNotifications.id, id), eq(inAppNotifications.userId, userId)));
}

export async function saveAssessment(input: { userId: number; type: "partial_20" | "diagnostic_100"; questionNumber: number; mapVersion: number; contentMarkdown: string }) {
  const db = await requireDb();
  const id = nanoid();
  await db.insert(progressAssessments).values({
    id,
    userId: input.userId,
    assessmentType: input.type,
    startQuestionNumber: input.questionNumber - (input.type === "diagnostic_100" ? 99 : 19),
    endQuestionNumber: input.questionNumber,
    mapVersion: input.mapVersion,
    contentMarkdown: input.contentMarkdown,
    auditReference: `map-v${input.mapVersion}`,
  });
  await db.insert(inAppNotifications).values({
    id: nanoid(), userId: input.userId, kind: "assessment_ready", title: "Avaliação disponível", detail: "Uma nova avaliação de progresso foi disponibilizada no seu painel.", referenceType: "assessment", referenceId: id, dedupeKey: `assessment:${input.questionNumber}`,
  }).onDuplicateKeyUpdate({ set: { detail: "Uma nova avaliação de progresso foi disponibilizada no seu painel." } });
  return id;
}

export async function saveStudyPlan(input: { userId: number; mapVersion: number; contentMarkdown: string }) {
  const db = await requireDb();
  const latest = await db.select({ version: max(studyPlans.version) }).from(studyPlans).where(eq(studyPlans.userId, input.userId));
  const version = Number(latest[0]?.version ?? 0) + 1;
  await db.insert(studyPlans).values({
    id: nanoid(),
    userId: input.userId,
    version,
    sourceMapVersion: input.mapVersion,
    contentMarkdown: input.contentMarkdown,
    auditReference: `map-v${input.mapVersion}`,
  });
  return version;
}

export type { User };
