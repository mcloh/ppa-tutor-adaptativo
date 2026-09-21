import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { clearSessionCookie, createSession, revokeCurrentSession, setSessionCookie } from "./auth";
import {
  chooseQuestionCandidate,
  completePasswordChange,
  createAnacExamAttempt,
  createBillingOrder,
  getBillingCheckoutReturnStatus,
  ensureCreditBalance,
  getCreditBalance,
  listBillingOrders,
  listAnacExamAttempts,
  listCreditLedger,
  createNotificationsForDueReviews,
  createPasswordUser,
  discardUnactivatedPasswordUser,
  failedLoginCount,
  getDashboardData,
  getCacheMetrics,
  getCachedFeedback,
  getCanonicalConceptsByIds,
  getPublicCanonicalCatalog,
  getLatestReadyKnowledgeSource,
  getOpenQuestion,
  getOrCreateReadinessMap,
  getStudentProfile,
  getSelectedModeSession,
  getSessionForQuestion,
  getStudyProgramStatus,
  listNotifications,
  markNotificationRead,
  nextQuestionNumber,
  chooseMatrixQuestionCandidate,
  persistQuestion,
  findEligibleCachedQuestion,
  recordAnswer,
  recordLoginAttempt,
  recordHomologationAuditEvent,
  recordSandboxCheckoutLifecycle,
  saveAssessment,
  savePagBankSandboxCheckout,
  saveStudyPlan,
  storeCachedFeedback,
  storeSharedQuestion,
  retrieveRagEvidence,
  retireCachedQuestion,
  selectStudyMode,
  startDiagnosticSession,
  updateLastSignedIn,
  upsertStudentProfile,
  listHomologationAuditEvents,
  exportHomologationAuditEvents,
  getUserByEmail,
  issueTemporaryPassword,
  markPasswordDeliveryResult,
  restorePasswordAfterDeliveryFailure,
} from "./db";
import { BILLING_MODE, creditSummary, prepaidProducts } from "./domain/billing";
import { buildPagBankCheckoutPayload, extractPayUrl, PAGBANK_PRODUCTION_API_URL, PAGBANK_SANDBOX_API_URL, sha256 } from "./domain/pagbankSandbox";
import type { AssessmentMatrixSlot, StudyMode } from "./domain/assessmentMatrix";
import { assessmentAuditAppendix, classifyResponse, publicClassification, responseInputs } from "./domain/learning";
import { createTemporaryPassword, fingerprint, hashPassword, normalizeEmail, verifyPassword } from "./domain/password";
import { sendAccountPasswordEmail } from "./domain/email";
import { assertNoRagLeakage, buildAssessmentFallback, generateAssessment, generateCacheBundle, generateFeedback, generateQuestion } from "./domain/tutorLlm";
import { adminProcedure, homologationProcedure, passwordChangeProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { activityRouter, adminAnalyticsRouter } from "./routers/adminAnalytics";

const passwordSchema = z
  .string()
  .min(12, "A senha deve ter pelo menos 12 caracteres.")
  .max(128)
  .regex(/[A-Za-z]/, "A senha deve conter letras.")
  .regex(/[0-9]/, "A senha deve conter números.");

const registerSchema = z.object({ email: z.string().email().max(320) });

const brazilianUfs = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

function isValidPastCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && value >= "1900-01-01"
    && value <= new Date().toISOString().slice(0, 10);
}

const nullableTrimmedText = (max: number) => z.string().trim().max(max).transform(value => value || null);

const studentProfileSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome completo ou social.").max(120),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().refine(value => value === null || isValidPastCalendarDate(value), "Informe uma data de nascimento válida e não futura."),
  gender: z.enum(["M", "F", "NB"]).nullable(),
  city: nullableTrimmedText(120),
  stateUf: nullableTrimmedText(2).transform(value => value?.toUpperCase() ?? null).refine(value => value === null || brazilianUfs.includes(value as typeof brazilianUfs[number]), "Informe uma UF brasileira válida."),
  theoreticalCourseProvider: nullableTrimmedText(255),
});

const anacExamAttemptSchema = z.object({
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidPastCalendarDate, "Informe uma data de prova válida e não futura."),
  metScore: z.number().int().min(0).max(20),
  regScore: z.number().int().min(0).max(20),
  navScore: z.number().int().min(0).max(20),
  mecScore: z.number().int().min(0).max(20),
  tvoScore: z.number().int().min(0).max(20),
  approved: z.boolean(),
});

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
    passwordConfirmation: z.string().min(1).max(128),
  })
  .superRefine((input, context) => {
    if (input.newPassword !== input.passwordConfirmation) {
      context.addIssue({ code: "custom", path: ["passwordConfirmation"], message: "As novas senhas não coincidem." });
    }
    if (input.currentPassword === input.newPassword) {
      context.addIssue({ code: "custom", path: ["newPassword"], message: "Escolha uma senha diferente da atual." });
    }
  });

const hasLocalPassword = (loginMethod: string) => loginMethod === "password" || loginMethod === "password_google";

const toPublicUser = (user: { id: number; name: string; email: string; role: "user" | "admin" | "homologation"; passwordChangeRequired: boolean; loginMethod: string }) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  passwordChangeRequired: user.passwordChangeRequired,
  canChangePassword: hasLocalPassword(user.loginMethod),
});

function publicOriginFromRequest(request: { header(name: string): string | undefined; headers: { host?: string | undefined } }) {
  const originHeader = request.header("origin");
  const forwardedProto = request.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.header("x-forwarded-host")?.split(",")[0]?.trim();
  const candidate = originHeader ?? `${forwardedProto === "http" ? "http" : "https"}://${forwardedHost ?? request.headers.host ?? ""}`;
  const url = new URL(candidate);
  if (url.protocol !== "https:") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O checkout Sandbox exige uma URL HTTPS para receber a confirmação." });
  return url.origin;
}

function structuredProviderEvidence(raw: string, status: number) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { httpStatus: status, bodyFormat: "non_json", bodyBytes: Buffer.byteLength(raw) };
  }
}

function smtpFailureCategory(error: unknown) {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
  if (code === "ETIMEDOUT") return "smtp_connection_timeout";
  if (code === "ECONNREFUSED" || code === "ECONNRESET") return "smtp_connection_failed";
  if (code === "EAUTH") return "smtp_authentication_failed";
  return "smtp_delivery_failed";
}

async function dispatchTemporaryPassword(input: {
  user: { id: number; passwordHash: string };
  recipient: string;
  purpose: "activation" | "password_reset";
  applicationUrl: string;
}) {
  const temporaryPassword = createTemporaryPassword();
  const issued = await issueTemporaryPassword({ userId: input.user.id, passwordHash: await hashPassword(temporaryPassword), purpose: input.purpose });
  try {
    const delivery = await sendAccountPasswordEmail({ recipient: input.recipient, temporaryPassword, purpose: input.purpose, applicationUrl: input.applicationUrl });
    await markPasswordDeliveryResult({ deliveryId: issued.deliveryId, status: "sent", smtpMessageId: delivery.messageId });
  } catch (error) {
    await restorePasswordAfterDeliveryFailure({
      userId: input.user.id,
      deliveryId: issued.deliveryId,
      issuedAt: issued.issuedAt,
      previousPasswordHash: issued.previousPasswordHash,
      previousPasswordChangeRequired: issued.previousPasswordChangeRequired,
      previousTemporaryPasswordIssuedAt: issued.previousTemporaryPasswordIssuedAt,
      previousTemporaryPasswordExpiresAt: issued.previousTemporaryPasswordExpiresAt,
      failureCode: smtpFailureCategory(error),
    });
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível enviar o e-mail de acesso. Tente novamente mais tarde.", cause: error });
  }
}

export const toQuestionView = (question: { id: string; questionNumber: number; studyMode?: StudyMode; prompt: string; optionA: string; optionB: string; optionC: string }) => ({
  id: question.id,
  number: question.questionNumber,
  studyMode: question.studyMode ?? "tutor",
  prompt: question.prompt,
  alternatives: [
    { key: "A" as const, text: question.optionA },
    { key: "B" as const, text: question.optionB },
    { key: "C" as const, text: question.optionC },
    { key: "ME_ENSINE" as const, text: "Me ensine" },
  ],
});

async function deliverQuestion(userId: number) {
  const map = await getOrCreateReadinessMap(userId);
  const program = await getStudyProgramStatus(userId);
  const allowedModes: StudyMode[] = program.diagnosticStatus === "active"
    ? ["diagnostic"]
    : program.diagnosticStatus === "completed" && program.selectedMode
      ? [program.selectedMode]
      : [];
  const existing = allowedModes.length ? await getOpenQuestion(userId, allowedModes) : null;
  if (existing) return toQuestionView(existing);
  let session: Awaited<ReturnType<typeof startDiagnosticSession>>["session"] | Awaited<ReturnType<typeof getSelectedModeSession>>["session"];
  let concepts: Awaited<ReturnType<typeof getCanonicalConceptsByIds>>;
  let action: "new" | "immediate_review" | "spaced_review";
  let questionNumber: number;
  let matrixSlot: number | undefined;
  let mode: StudyMode;
  let avoidPrompt: string | undefined;

  if (program.diagnosticStatus === "active") {
    const diagnostic = await startDiagnosticSession(userId);
    if (!diagnostic.session) return null;
    session = diagnostic.session;
    const matrix = JSON.parse(session.matrixJson ?? diagnostic.program.diagnosticPlanJson) as AssessmentMatrixSlot[];
    const candidate = await chooseMatrixQuestionCandidate({ userId, sessionId: session.id, matrix });
    if (!candidate) return null;
    concepts = candidate.concepts;
    action = candidate.action;
    questionNumber = candidate.questionNumber;
    matrixSlot = candidate.slot.slot;
    mode = "diagnostic";
  } else if (program.diagnosticStatus === "mode_selection") {
    return null;
  } else {
    const selected = await getSelectedModeSession(userId);
    session = selected.session;
    mode = selected.session.mode;
    if (mode === "simulado") {
      const matrix = JSON.parse(session.matrixJson ?? selected.program.diagnosticPlanJson) as AssessmentMatrixSlot[];
      const candidate = await chooseMatrixQuestionCandidate({ userId, sessionId: session.id, matrix });
      if (!candidate) return null;
      concepts = candidate.concepts;
      action = candidate.action;
      questionNumber = candidate.questionNumber;
      matrixSlot = candidate.slot.slot;
    } else {
      const candidate = await chooseQuestionCandidate(userId);
      concepts = await getCanonicalConceptsByIds([candidate.concept.id]);
      if (!concepts[0]) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O conceito selecionado não está disponível no catálogo." });
      action = candidate.action;
      questionNumber = await nextQuestionNumber(userId);
      avoidPrompt = candidate.avoidPrompt;
    }
  }
  const source = await getLatestReadyKnowledgeSource();
  if (!source) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O material de referência não está disponível para validar uma nova questão. Tente novamente em instantes." });
  const cached = await findEligibleCachedQuestion({ userId, catalogVersionId: map.catalogVersionId, conceptId: concepts[0].id, conceptIds: concepts.map(concept => concept.id), ragSourceId: source.id });
  if (cached) {
    try {
      assertNoRagLeakage(`${cached.prompt}\n${cached.optionA}\n${cached.optionB}\n${cached.optionC}`, "");
      const id = await persistQuestion({
        userId, sessionId: session.id, questionNumber, conceptId: concepts[0].id, conceptIds: concepts.map(concept => concept.id), studyMode: mode, matrixSlot, action,
        prompt: cached.prompt, optionA: cached.optionA, optionB: cached.optionB, optionC: cached.optionC,
        correctOption: cached.correctOption, validationNote: "Questão aprovada recuperada do cache pedagógico interno.", cacheQuestionId: cached.id,
      });
      return toQuestionView({ id, questionNumber, studyMode: mode, prompt: cached.prompt, optionA: cached.optionA, optionB: cached.optionB, optionC: cached.optionC });
    } catch (error) {
      console.warn("[Tutor] Retiring cached question with prohibited provenance reference", error);
      await retireCachedQuestion(cached.id, "Referência direta ou indireta à fonte RAG bloqueada pela validação de saída.");
    }
  }

  let evidence;
  try {
    evidence = await retrieveRagEvidence(concepts);
  } catch (error) {
    console.error("[Tutor] RAG retrieval failed", error);
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O material de referência não está disponível para validar uma nova questão. Tente novamente em instantes.", cause: error });
  }
  let generated;
  let bundledFeedback: { correct: string; incorrect: string; meEnsine: string } | null = null;
  try {
    if (concepts.length === 2) {
      const bundle = await generateCacheBundle({ concepts, cacheVariant: 1, avoidPrompts: avoidPrompt ? [avoidPrompt] : [], sourceContext: evidence.context });
      generated = { prompt: bundle.prompt, optionA: bundle.optionA, optionB: bundle.optionB, optionC: bundle.optionC, correctOption: bundle.correctOption, validationNote: bundle.validationNote };
      bundledFeedback = { correct: bundle.feedbackCorrectMarkdown, incorrect: bundle.feedbackIncorrectMarkdown, meEnsine: bundle.feedbackTeachMarkdown };
    } else {
      generated = await generateQuestion({
        concept: concepts[0],
        concepts,
        action,
        questionNumber,
        avoidPrompt,
        sourceContext: evidence.context,
      });
    }
  } catch (error) {
    console.error("[Tutor] Question generation validation failed", error);
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível validar uma nova questão agora. Tente novamente em instantes.", cause: error });
  }

  const cachedQuestion = await storeSharedQuestion({
    catalogVersionId: map.catalogVersionId,
    conceptId: concepts[0].id,
    conceptIds: concepts.map(concept => concept.id),
    ragSourceId: evidence.sourceId,
    ragSourceChecksum: evidence.sourceChecksum,
    ragChunkIds: evidence.chunkIds,
    ...generated,
  });
  if (bundledFeedback && cachedQuestion) {
    await Promise.all([
      storeCachedFeedback(cachedQuestion.id, "correct", bundledFeedback.correct),
      storeCachedFeedback(cachedQuestion.id, "incorrect", bundledFeedback.incorrect),
      storeCachedFeedback(cachedQuestion.id, "me_ensine", bundledFeedback.meEnsine),
    ]);
  }

  const id = await persistQuestion({
    userId,
    sessionId: session.id,
    questionNumber,
    conceptId: concepts[0].id,
    conceptIds: concepts.map(concept => concept.id),
    studyMode: mode,
    matrixSlot,
    action,
    ...generated,
    cacheQuestionId: cachedQuestion?.id,
  });
  return toQuestionView({ id, questionNumber, studyMode: mode, prompt: generated.prompt, optionA: generated.optionA, optionB: generated.optionB, optionC: generated.optionC });
}

export const appRouter = router({
  activity: activityRouter,
  adminAnalytics: adminAnalyticsRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => (ctx.user ? toPublicUser(ctx.user) : null)),
    register: publicProcedure
      .input(registerSchema)
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const existing = await getUserByEmail(email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já possui uma conta. Use “Entrar” ou “Esqueci minha senha”." });
        }
        let user;
        try {
          user = await createPasswordUser({
            openId: `local_${nanoid(20)}`,
            name: "Novo aluno",
            email,
            passwordHash: await hashPassword(createTemporaryPassword()),
            passwordChangeRequired: true,
            loginMethod: "password",
          });
        } catch (error) {
          const concurrent = await getUserByEmail(email);
          if (concurrent) throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já possui uma conta. Use “Entrar” ou “Esqueci minha senha”." });
          throw error;
        }
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar a conta." });
        try {
          await dispatchTemporaryPassword({ user, recipient: email, purpose: "activation", applicationUrl: `${publicOriginFromRequest(ctx.req)}/` });
        } catch (error) {
          await discardUnactivatedPasswordUser(user.id);
          throw error;
        }
        return { activationSent: true } as const;
      }),
    login: publicProcedure
      .input(z.object({ email: z.string().email().max(320), password: z.string().min(1).max(128) }))
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const emailHash = fingerprint(email);
        const ipHash = fingerprint(ctx.req.ip || "unknown");
        if ((await failedLoginCount(emailHash, new Date(Date.now() - 15 * 60 * 1000))) >= 5) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Tente novamente em alguns minutos." });
        }
        const user = await getUserByEmail(email);
        const valid = Boolean(user && (await verifyPassword(input.password, user.passwordHash)));
        await recordLoginAttempt(emailHash, ipHash, valid);
        if (!valid || !user) throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." });
        if (user.passwordChangeRequired && (!user.temporaryPasswordExpiresAt || user.temporaryPasswordExpiresAt <= new Date())) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A senha temporária expirou. Solicite uma nova senha para continuar." });
        }
        await updateLastSignedIn(user.id);
        setSessionCookie(ctx.req, ctx.res, await createSession(user.id));
        return toPublicUser(user);
      }),
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email().max(320), confirmed: z.literal(true) }))
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const user = await getUserByEmail(email);
        if (!user) return { accepted: true } as const;
        if (!hasLocalPassword(user.loginMethod)) return { accepted: true } as const;
        await dispatchTemporaryPassword({ user, recipient: email, purpose: "password_reset", applicationUrl: `${publicOriginFromRequest(ctx.req)}/` });
        return { accepted: true } as const;
      }),
    changePassword: passwordChangeProcedure
      .input(passwordChangeSchema)
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user;
        if (!hasLocalPassword(user.loginMethod)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Esta conta usa somente a Conta Google e não possui senha local para alterar." });
        }
        if (user.passwordChangeRequired && (!user.temporaryPasswordExpiresAt || user.temporaryPasswordExpiresAt <= new Date())) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A senha temporária expirou. Solicite uma nova senha para continuar." });
        }
        if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "A senha atual não confere." });
        }
        await completePasswordChange({ userId: user.id, passwordHash: await hashPassword(input.newPassword) });
        setSessionCookie(ctx.req, ctx.res, await createSession(user.id));
        return toPublicUser({ ...user, passwordChangeRequired: false });
      }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await revokeCurrentSession(ctx.req);
      clearSessionCookie(ctx.req, ctx.res);
      return { success: true } as const;
    }),
  }),
  canonicalCatalog: router({
    /** A taxonomia pública não contém IDs, prioridades, progresso ou conteúdo pedagógico protegido. */
    publicMap: publicProcedure.query(() => getPublicCanonicalCatalog()),
  }),
  studentProfile: router({
    get: protectedProcedure.query(({ ctx }) => getStudentProfile(ctx.user.id)),
    update: protectedProcedure
      .input(studentProfileSchema)
      .mutation(({ ctx, input }) => upsertStudentProfile(ctx.user.id, input)),
    attempts: router({
      list: protectedProcedure.query(({ ctx }) => listAnacExamAttempts(ctx.user.id)),
      create: protectedProcedure
        .input(anacExamAttemptSchema)
        .mutation(async ({ ctx, input }) => {
          await createAnacExamAttempt(ctx.user.id, input);
          return listAnacExamAttempts(ctx.user.id);
        }),
    }),
  }),
  credits: router({
    catalog: publicProcedure.query(() => ({
      experimental: {
        initialCredits: BILLING_MODE.trialCredits,
        unlimitedAccessActive: !BILLING_MODE.enforceStudyCredits,
        checkoutAvailable: BILLING_MODE.checkoutEnabled,
        productionHomologationCheckoutAvailable: BILLING_MODE.productionHomologationCheckoutEnabled,
        productionCommercialCheckoutAvailable: BILLING_MODE.productionCommercialCheckoutEnabled,
      },
      products: prepaidProducts.map(product => ({
        key: product.key,
        name: product.name,
        credits: product.credits,
        amountCents: product.amountCents,
        featured: product.featured,
      })),
    })),
    summary: protectedProcedure.query(async ({ ctx }) => {
      const balance = await getCreditBalance(ctx.user.id);
      const [ledger, orders] = await Promise.all([
        listCreditLedger(ctx.user.id, 12),
        listBillingOrders(ctx.user.id, 8),
      ]);
      return {
        balance: creditSummary(balance),
        ledger,
        orders,
      };
    }),
    createSandboxCheckout: homologationProcedure
      .input(z.object({ productKey: z.enum(["essential", "panoramic", "air_bridge", "command"]), idempotencyKey: z.string().min(16).max(96) }))
      .mutation(async ({ ctx, input }) => {
        if (!BILLING_MODE.checkoutEnabled) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O checkout está disponível apenas no ambiente de homologação." });
        const created = await createBillingOrder({ userId: ctx.user.id, productKey: input.productKey, idempotencyKey: input.idempotencyKey });
        const existingCheckoutUrl = "checkoutUrl" in created.order ? created.order.checkoutUrl : null;
        if (existingCheckoutUrl) {
          await recordHomologationAuditEvent({ actorUserId: ctx.user.id, orderId: created.order.id, operation: "checkout_create", outcome: "ignored", request: { productKey: input.productKey, reuse: true }, response: { checkoutAlreadyPresent: true } });
          return { checkoutUrl: existingCheckoutUrl, orderId: created.order.id, referenceId: created.order.referenceId, idempotent: true };
        }
        const product = prepaidProducts.find(item => item.key === input.productKey);
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Pacote indisponível." });
        const origin = publicOriginFromRequest(ctx.req);
        const returnUrl = `${origin}/planos?checkout=sandbox&ref=${encodeURIComponent(created.order.referenceId)}`;
        const webhookUrl = `${origin}/api/webhooks/pagbank/sandbox`;
        const payload = buildPagBankCheckoutPayload({
          product: { referenceId: created.order.referenceId, productKey: product.key, name: product.name, credits: product.credits, amountCents: product.amountCents },
          returnUrl,
          webhookUrl,
        });
        let response: Response;
        try {
          response = await fetch(`${PAGBANK_SANDBOX_API_URL}/checkouts`, { method: "POST", headers: { Authorization: `Bearer ${process.env.PAGBANK_SANDBOX_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        } catch (error) {
          await recordHomologationAuditEvent({ actorUserId: ctx.user.id, orderId: created.order.id, operation: "checkout_create", outcome: "failed", request: payload, response: { failure: "provider_network_error" } });
          throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível iniciar o checkout Sandbox. Tente novamente.", cause: error });
        }
        const responseText = await response.text();
        if (!response.ok) {
          console.error("[PagBank Sandbox] Checkout creation rejected", response.status);
          await recordHomologationAuditEvent({ actorUserId: ctx.user.id, orderId: created.order.id, operation: "checkout_create", outcome: "failed", request: payload, response: structuredProviderEvidence(responseText, response.status) });
          throw new TRPCError({ code: "BAD_GATEWAY", message: "O PagBank Sandbox recusou a criação do checkout de teste." });
        }
        let providerResponse: unknown;
        try {
          providerResponse = JSON.parse(responseText);
        } catch {
          throw new TRPCError({ code: "BAD_GATEWAY", message: "O PagBank Sandbox retornou uma resposta inválida." });
        }
        const checkout = extractPayUrl(providerResponse);
        const saved = await savePagBankSandboxCheckout({ userId: ctx.user.id, orderId: created.order.id, checkoutId: checkout.checkoutId, checkoutUrl: checkout.payUrl, expiresAt: new Date(payload.expiration_date), requestPayloadHash: sha256(JSON.stringify(payload)), responsePayloadHash: sha256(responseText) });
        await recordHomologationAuditEvent({ actorUserId: ctx.user.id, orderId: created.order.id, operation: "checkout_create", outcome: "succeeded", request: payload, response: providerResponse });
        return { checkoutUrl: saved.order.checkoutUrl!, orderId: saved.order.id, referenceId: saved.order.referenceId, idempotent: created.idempotent };
      }),
    createProductionHomologationCheckout: homologationProcedure
      .input(z.object({ productKey: z.enum(["essential", "panoramic", "air_bridge", "command"]), idempotencyKey: z.string().min(16).max(96) }))
      .mutation(async ({ ctx, input }) => {
        if (!BILLING_MODE.productionHomologationCheckoutEnabled) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O checkout de produção está restrito à homologação autorizada." });
        }
        const created = await createBillingOrder({ userId: ctx.user.id, productKey: input.productKey, idempotencyKey: `production:${input.idempotencyKey}`, environment: "production" });
        const existingCheckoutUrl = "checkoutUrl" in created.order ? created.order.checkoutUrl : null;
        if (existingCheckoutUrl) {
          await recordHomologationAuditEvent({ actorUserId: ctx.user.id, orderId: created.order.id, operation: "checkout_create", outcome: "ignored", environment: "production", request: { productKey: input.productKey, reuse: true, environment: "production" }, response: { checkoutAlreadyPresent: true } });
          return { checkoutUrl: existingCheckoutUrl, orderId: created.order.id, referenceId: created.order.referenceId, idempotent: true };
        }
        const product = prepaidProducts.find(item => item.key === input.productKey);
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Pacote indisponível." });
        const origin = publicOriginFromRequest(ctx.req);
        const returnUrl = `${origin}/planos?checkout=production&ref=${encodeURIComponent(created.order.referenceId)}`;
        const webhookUrl = `${origin}/api/webhooks/pagbank/production`;
        const payload = buildPagBankCheckoutPayload({
          product: { referenceId: created.order.referenceId, productKey: product.key, name: product.name, credits: product.credits, amountCents: product.amountCents },
          returnUrl, webhookUrl, paymentMethods: [{ type: "CREDIT_CARD" }],
        });
        let response: Response;
        try {
          response = await fetch(`${PAGBANK_PRODUCTION_API_URL}/checkouts`, { method: "POST", headers: { Authorization: `Bearer ${process.env.PAGBANK_PRODUCTION_TOKEN}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
        } catch (error) {
          await recordHomologationAuditEvent({ actorUserId: ctx.user.id, orderId: created.order.id, operation: "checkout_create", outcome: "failed", environment: "production", request: payload, response: { failure: "provider_network_error" } });
          throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível iniciar o checkout de produção para homologação.", cause: error });
        }
        const responseText = await response.text();
        if (!response.ok) {
          await recordHomologationAuditEvent({ actorUserId: ctx.user.id, orderId: created.order.id, operation: "checkout_create", outcome: "failed", environment: "production", request: payload, response: structuredProviderEvidence(responseText, response.status) });
          throw new TRPCError({ code: "BAD_GATEWAY", message: "O PagBank recusou a criação do checkout de produção." });
        }
        let providerResponse: unknown;
        try { providerResponse = JSON.parse(responseText); } catch { throw new TRPCError({ code: "BAD_GATEWAY", message: "O PagBank retornou uma resposta inválida para o checkout de produção." }); }
        const checkout = extractPayUrl(providerResponse);
        const saved = await savePagBankSandboxCheckout({ userId: ctx.user.id, orderId: created.order.id, checkoutId: checkout.checkoutId, checkoutUrl: checkout.payUrl, expiresAt: new Date(payload.expiration_date), requestPayloadHash: sha256(JSON.stringify(payload)), responsePayloadHash: sha256(responseText), environment: "production" });
        await recordHomologationAuditEvent({ actorUserId: ctx.user.id, orderId: created.order.id, operation: "checkout_create", outcome: "succeeded", environment: "production", request: payload, response: providerResponse });
        return { checkoutUrl: saved.order.checkoutUrl!, orderId: saved.order.id, referenceId: saved.order.referenceId, idempotent: created.idempotent };
      }),
    createProductionCheckout: protectedProcedure
      .input(z.object({ productKey: z.enum(["essential", "panoramic", "air_bridge", "command"]), idempotencyKey: z.string().min(16).max(96) }))
      .mutation(async ({ ctx, input }) => {
        if (!BILLING_MODE.productionCommercialCheckoutEnabled) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "As compras ainda não estão disponíveis neste momento." });
        }
        const created = await createBillingOrder({ userId: ctx.user.id, productKey: input.productKey, idempotencyKey: `production-commercial:${input.idempotencyKey}`, environment: "production" });
        const existingCheckoutUrl = "checkoutUrl" in created.order ? created.order.checkoutUrl : null;
        if (existingCheckoutUrl) {
          return { checkoutUrl: existingCheckoutUrl, orderId: created.order.id, referenceId: created.order.referenceId, idempotent: true };
        }
        const product = prepaidProducts.find(item => item.key === input.productKey);
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Pacote indisponível." });
        const origin = publicOriginFromRequest(ctx.req);
        const returnUrl = `${origin}/planos?checkout=production&ref=${encodeURIComponent(created.order.referenceId)}`;
        const webhookUrl = `${origin}/api/webhooks/pagbank/production`;
        const payload = buildPagBankCheckoutPayload({
          product: { referenceId: created.order.referenceId, productKey: product.key, name: product.name, credits: product.credits, amountCents: product.amountCents },
          returnUrl,
          webhookUrl,
          paymentMethods: [{ type: "CREDIT_CARD" }, { type: "PIX" }, { type: "BOLETO" }],
        });
        let response: Response;
        try {
          response = await fetch(`${PAGBANK_PRODUCTION_API_URL}/checkouts`, { method: "POST", headers: { Authorization: `Bearer ${process.env.PAGBANK_PRODUCTION_TOKEN}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
        } catch (error) {
          throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível iniciar o checkout. Tente novamente.", cause: error });
        }
        const responseText = await response.text();
        if (!response.ok) {
          console.error("[PagBank Production] Checkout creation rejected", response.status);
          throw new TRPCError({ code: "BAD_GATEWAY", message: "O PagBank não pôde iniciar este checkout. Tente novamente." });
        }
        let providerResponse: unknown;
        try { providerResponse = JSON.parse(responseText); } catch { throw new TRPCError({ code: "BAD_GATEWAY", message: "O PagBank retornou uma resposta inválida para o checkout." }); }
        const checkout = extractPayUrl(providerResponse);
        const saved = await savePagBankSandboxCheckout({ userId: ctx.user.id, orderId: created.order.id, checkoutId: checkout.checkoutId, checkoutUrl: checkout.payUrl, expiresAt: new Date(payload.expiration_date), requestPayloadHash: sha256(JSON.stringify(payload)), responsePayloadHash: sha256(responseText), environment: "production" });
        return { checkoutUrl: saved.order.checkoutUrl!, orderId: saved.order.id, referenceId: saved.order.referenceId, idempotent: created.idempotent };
      }),
    recordSandboxCheckoutLifecycle: homologationProcedure
      .input(z.object({ referenceId: z.string().regex(/^ppa-\d+-[A-Za-z0-9_-]{16}$/, "Referência de checkout inválida."), operation: z.enum(["checkout_opened", "checkout_return"]) }))
      .mutation(({ ctx, input }) => recordSandboxCheckoutLifecycle({ userId: ctx.user.id, ...input })),
    recordProductionCheckoutLifecycle: homologationProcedure
      .input(z.object({ referenceId: z.string().regex(/^ppa-\d+-[A-Za-z0-9_-]{16}$/, "Referência de checkout inválida."), operation: z.enum(["checkout_opened", "checkout_return"]) }))
      .mutation(({ ctx, input }) => recordSandboxCheckoutLifecycle({ userId: ctx.user.id, ...input, environment: "production" })),
    checkoutReturnStatus: protectedProcedure
      .input(z.object({ referenceId: z.string().regex(/^ppa-\d+-[A-Za-z0-9_-]{16}$/, "Referência de checkout inválida.") }))
      .query(({ ctx, input }) => getBillingCheckoutReturnStatus(ctx.user.id, input.referenceId)),
  }),
  homologationAudit: router({
    list: homologationProcedure.input(z.object({ environment: z.enum(["sandbox", "production"]) }).optional()).query(({ ctx, input }) => listHomologationAuditEvents(ctx.user.id, 50, input?.environment)),
    export: homologationProcedure
      .input(z.object({ environment: z.enum(["sandbox", "production"]), eventIds: z.array(z.string().min(8).max(64)).min(1).max(100) }))
      .mutation(async ({ ctx, input }) => ({
        fileName: `pagbank-${input.environment}-homologation-${new Date().toISOString().slice(0, 10)}.json`,
        content: await exportHomologationAuditEvents(ctx.user.id, input.eventIds, input.environment),
      })),
  }),
  study: router({
    program: protectedProcedure.query(({ ctx }) => getStudyProgramStatus(ctx.user.id)),
    selectMode: protectedProcedure
      .input(z.object({ mode: z.enum(["simulado", "tutor"]) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await selectStudyMode({ userId: ctx.user.id, mode: input.mode });
        } catch (error) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Não foi possível selecionar a modalidade." });
        }
      }),
    current: protectedProcedure.query(async ({ ctx }) => {
      await createNotificationsForDueReviews(ctx.user.id);
      return deliverQuestion(ctx.user.id);
    }),
    answer: protectedProcedure
      .input(z.object({ questionId: z.string().min(8).max(64), answer: z.enum(responseInputs) }))
      .mutation(async ({ ctx, input }) => {
        const record = await getSessionForQuestion(ctx.user.id, input.questionId);
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Questão indisponível para esta conta." });
        const question = record.question;
        const classification = classifyResponse(input.answer, question.correctOption);
        let feedbackMarkdown = question.feedbackMarkdown ?? (await getCachedFeedback(question.cacheQuestionId, classification));
        if (feedbackMarkdown) {
          try {
            assertNoRagLeakage(feedbackMarkdown, "");
          } catch (error) {
            console.warn("[Tutor] Discarding cached feedback with prohibited provenance reference", error);
            feedbackMarkdown = null;
          }
        }
        if (!feedbackMarkdown) {
          try {
            const concepts = await getCanonicalConceptsByIds(JSON.parse(question.conceptIdsJson) as string[]);
            const evidence = await retrieveRagEvidence(concepts);
            feedbackMarkdown = await generateFeedback({
              prompt: question.prompt,
              options: { A: question.optionA, B: question.optionB, C: question.optionC },
              correctOption: question.correctOption,
              answer: input.answer,
              classification,
              sourceContext: evidence.context,
            });
            await storeCachedFeedback(question.cacheQuestionId, classification, feedbackMarkdown);
          } catch (error) {
            throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível preparar a explicação agora. A sua resposta ainda não foi registrada; tente novamente.", cause: error });
          }
        }
        const result = await recordAnswer({ userId: ctx.user.id, questionId: input.questionId, answer: input.answer, feedbackMarkdown });
        let assessment: { type: "partial_20" | "diagnostic_100"; contentMarkdown: string } | null = null;
        if (!result.idempotent && result.milestone && result.mapVersion) {
          const dashboard = await getDashboardData(ctx.user.id);
          try {
            let generated;
            try {
              generated = await generateAssessment({ type: result.milestone, context: dashboard });
            } catch (error) {
              console.error("[Assessment] Using deterministic fallback after generation failed", error);
              generated = buildAssessmentFallback({ type: result.milestone, context: dashboard });
            }
            const auditedContent = `${generated.assessmentMarkdown}\n\n${assessmentAuditAppendix({ type: result.milestone, questionNumber: result.questionNumber, mapVersion: result.mapVersion, counters: dashboard.counters, subjects: dashboard.subjects, gaps: dashboard.gaps })}`;
            await saveAssessment({ userId: ctx.user.id, type: result.milestone, questionNumber: result.questionNumber, mapVersion: result.mapVersion, contentMarkdown: auditedContent });
            if (result.milestone === "diagnostic_100" && generated.studyPlanMarkdown) {
              await saveStudyPlan({ userId: ctx.user.id, mapVersion: result.mapVersion, contentMarkdown: generated.studyPlanMarkdown });
            }
            assessment = { type: result.milestone, contentMarkdown: auditedContent };
          } catch (error) {
            console.error("[Assessment] Generation failed", error);
          }
        }
        return {
          classification: publicClassification(result.classification),
          feedbackMarkdown: result.feedbackMarkdown,
          assessment,
          modeSelectionRequired: result.modeSelectionRequired ?? false,
        };
      }),
  }),
  dashboard: router({
    overview: protectedProcedure.query(({ ctx }) => getDashboardData(ctx.user.id)),
  }),
  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await createNotificationsForDueReviews(ctx.user.id);
      return listNotifications(ctx.user.id);
    }),
    markRead: protectedProcedure.input(z.object({ id: z.string().min(8).max(64) })).mutation(async ({ ctx, input }) => {
      await markNotificationRead(ctx.user.id, input.id);
      return { success: true } as const;
    }),
  }),
  cacheAdmin: router({
    metrics: adminProcedure.query(() => getCacheMetrics()),
    retire: adminProcedure
      .input(z.object({ cacheQuestionId: z.string().min(8).max(64), reason: z.string().trim().min(10).max(500) }))
      .mutation(async ({ input }) => {
        await retireCachedQuestion(input.cacheQuestionId, input.reason);
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
