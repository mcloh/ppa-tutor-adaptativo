import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  authLoginAttempts,
  authPasswordDeliveries,
  billingOrders,
  externalHealthChecks,
  knowledgeSources,
  learningEvents,
  llmPricingRules,
  llmUsageEvents,
  operationMetricEvents,
  operationalCostEntries,
  paymentAttempts,
  platformAccessSessions,
  runtimeMetricSnapshots,
  sharedQuestionCache,
  studentReadinessMaps,
  studyQuestions,
  studySessions,
  users,
} from "../drizzle/schema";
import { analyticsWindow, calculateEstimatedLlmCostCents, normalizedMetricNumber, nullableAverage, nullablePercent, type AnalyticsPeriod, type PlatformView } from "./domain/adminAnalytics";
import { getDb } from "./db";

type MetricRange = { min: number | null; average: number | null; max: number | null };

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para métricas administrativas.");
  return db;
}

function numberOf(value: unknown) {
  return normalizedMetricNumber(value) ?? 0;
}

function nullableNumber(value: unknown) {
  return normalizedMetricNumber(value);
}

function dayString(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function dailySeries(period: AnalyticsPeriod, rows: Array<{ day: unknown; value: unknown; secondary?: unknown }>, now = new Date()) {
  const { start, days } = analyticsWindow(period, now);
  const indexed = new Map(rows.map(row => [dayString(row.day), row]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index + 1);
    const key = date.toISOString().slice(0, 10);
    const row = indexed.get(key);
    return { day: key, value: row ? numberOf(row.value) : 0, secondary: row?.secondary === undefined ? undefined : numberOf(row.secondary) };
  });
}

function rangeFromRow(row: { min?: unknown; average?: unknown; max?: unknown } | undefined): MetricRange {
  return {
    min: nullableNumber(row?.min),
    average: nullableNumber(row?.average),
    max: nullableNumber(row?.max),
  };
}

function providerForModel(model: string) {
  if (model.startsWith("gpt-")) return "openai";
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  return "unknown";
}

export async function trackPlatformActivity(input: { userId: number; sessionId: string; view: PlatformView; now?: Date }) {
  const db = await requireDb();
  const now = input.now ?? new Date();
  const existing = (await db
    .select({ id: platformAccessSessions.id, lastSeenAt: platformAccessSessions.lastSeenAt, activeSeconds: platformAccessSessions.activeSeconds })
    .from(platformAccessSessions)
    .where(eq(platformAccessSessions.id, input.sessionId))
    .limit(1))[0];

  if (existing) {
    const owned = (await db
      .select({ id: platformAccessSessions.id })
      .from(platformAccessSessions)
      .where(and(eq(platformAccessSessions.id, input.sessionId), eq(platformAccessSessions.userId, input.userId)))
      .limit(1))[0];
    if (!owned) return { accepted: false, activeSecondsAdded: 0 };
    const elapsed = Math.max(0, Math.min(90, Math.floor((now.getTime() - existing.lastSeenAt.getTime()) / 1000)));
    await db.update(platformAccessSessions).set({
      lastSeenAt: now,
      lastView: input.view,
      activeSeconds: existing.activeSeconds + elapsed,
    }).where(and(eq(platformAccessSessions.id, input.sessionId), eq(platformAccessSessions.userId, input.userId)));
    return { accepted: true, activeSecondsAdded: elapsed };
  }

  await db.insert(platformAccessSessions).values({
    id: input.sessionId,
    userId: input.userId,
    startedAt: now,
    lastSeenAt: now,
    activeSeconds: 0,
    lastView: input.view,
  });
  return { accepted: true, activeSecondsAdded: 0 };
}

export async function recordOperationMetric(input: {
  component: "auth" | "payment" | "email" | "rag" | "llm" | "database" | "cache" | "assessment";
  operation: string;
  outcome: "succeeded" | "failed" | "fallback";
  durationMs?: number | null;
  errorCode?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
}) {
  try {
    const db = await requireDb();
    await db.insert(operationMetricEvents).values({
      id: `opm_${nanoid(20)}`,
      component: input.component,
      operation: input.operation.slice(0, 64),
      outcome: input.outcome,
      durationMs: input.durationMs === null || input.durationMs === undefined ? null : Math.max(0, Math.min(Math.round(input.durationMs), 2_147_483_647)),
      errorCode: input.errorCode?.slice(0, 64) ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    });
  } catch {
    // Telemetria é melhor esforço e jamais deve interromper a operação principal.
  }
}

export async function recordLlmUsage(input: {
  operation: string;
  model: string;
  status: "succeeded" | "failed";
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  latencyMs: number;
  errorCode?: string | null;
}) {
  try {
    const db = await requireDb();
    const provider = providerForModel(input.model);
    const now = new Date();
    const rule = (await db
      .select()
      .from(llmPricingRules)
      .where(and(
        eq(llmPricingRules.provider, provider),
        eq(llmPricingRules.model, input.model),
        lte(llmPricingRules.effectiveFrom, now),
        sql`(${llmPricingRules.effectiveTo} IS NULL OR ${llmPricingRules.effectiveTo} > ${now})`,
      ))
      .orderBy(desc(llmPricingRules.effectiveFrom))
      .limit(1))[0];
    const promptTokens = input.usage?.prompt_tokens ?? null;
    const completionTokens = input.usage?.completion_tokens ?? null;
    const estimatedCostCents = rule
      ? calculateEstimatedLlmCostCents({ promptTokens, completionTokens, inputCentsPerMillion: rule.inputCentsPerMillion, outputCentsPerMillion: rule.outputCentsPerMillion })
      : null;
    await db.insert(llmUsageEvents).values({
      id: `llm_${nanoid(20)}`,
      operation: input.operation.slice(0, 64),
      provider,
      model: input.model.slice(0, 128),
      status: input.status,
      promptTokens,
      completionTokens,
      totalTokens: input.usage?.total_tokens ?? null,
      latencyMs: Math.max(0, Math.min(Math.round(input.latencyMs), 2_147_483_647)),
      estimatedCostCents,
      pricingRuleId: rule?.id ?? null,
      errorCode: input.errorCode?.slice(0, 64) ?? null,
    });
    await recordOperationMetric({ component: "llm", operation: input.operation, outcome: input.status === "succeeded" ? "succeeded" : "failed", durationMs: input.latencyMs, errorCode: input.errorCode ?? null });
  } catch {
    // A persistência de telemetria não altera a resposta pedagógica.
  }
}

export async function captureRuntimeMetrics(source: string) {
  try {
    const db = await requireDb();
    const usage = process.memoryUsage();
    const now = new Date();
    await db.insert(runtimeMetricSnapshots).values([
      { id: `rtm_${nanoid(20)}`, capturedAt: now, metricName: "rss", value: Math.round(usage.rss / 1024 / 1024), unit: "MB", source: source.slice(0, 64) },
      { id: `rtm_${nanoid(20)}`, capturedAt: now, metricName: "heapUsed", value: Math.round(usage.heapUsed / 1024 / 1024), unit: "MB", source: source.slice(0, 64) },
    ]);
  } catch {
    // Observabilidade de recursos é melhor esforço.
  }
}

export async function createOperationalCostEntry(input: {
  occurredAt: Date;
  category: string;
  provider: string;
  amountCents: number;
  currency: string;
  source: string;
  note: string | null;
}) {
  const db = await requireDb();
  const entry = {
    id: `cost_${nanoid(20)}`,
    occurredAt: input.occurredAt,
    category: input.category.slice(0, 48),
    provider: input.provider.slice(0, 96),
    amountCents: input.amountCents,
    currency: input.currency.toUpperCase().slice(0, 3),
    source: input.source.slice(0, 64),
    note: input.note?.slice(0, 500) ?? null,
  };
  await db.insert(operationalCostEntries).values(entry);
  return { id: entry.id, occurredAt: entry.occurredAt, category: entry.category, provider: entry.provider, amountCents: entry.amountCents, currency: entry.currency, source: entry.source };
}

export async function listOperationalCostEntries(period: AnalyticsPeriod) {
  const db = await requireDb();
  const { start } = analyticsWindow(period);
  return db
    .select({
      id: operationalCostEntries.id,
      occurredAt: operationalCostEntries.occurredAt,
      category: operationalCostEntries.category,
      provider: operationalCostEntries.provider,
      amountCents: operationalCostEntries.amountCents,
      currency: operationalCostEntries.currency,
      source: operationalCostEntries.source,
      createdAt: operationalCostEntries.createdAt,
    })
    .from(operationalCostEntries)
    .where(gte(operationalCostEntries.occurredAt, start))
    .orderBy(desc(operationalCostEntries.occurredAt))
    .limit(50);
}

export async function getAdminAnalyticsOverview(period: AnalyticsPeriod) {
  const db = await requireDb();
  const { start } = analyticsWindow(period);
  // Estas consultas abrangem uma única tabela; manter a expressão sem qualificador
  // faz SELECT/GROUP BY idênticos também sob o modo only_full_group_by do TiDB/MySQL.
  const registrationDay = sql<string>`date(createdAt)`;
  const paidOrderDay = sql<string>`date(paidAt)`;
  const [
    userTotals,
    newUsers,
    registrationsByDay,
    accessAggregate,
    accessRange,
    studySessionTotal,
    questionMetrics,
    learningMetrics,
    studyModes,
    loginMethods,
    orderStatuses,
    paidCommerce,
    commerceByDay,
    cacheMetrics,
    accessUsers,
    studyUsers,
    learningUsers,
  ] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(users),
    db.select({ total: sql<number>`count(*)` }).from(users).where(gte(users.createdAt, start)),
    db.select({ day: registrationDay, value: sql<number>`count(*)` }).from(users).where(gte(users.createdAt, start)).groupBy(registrationDay).orderBy(asc(registrationDay)),
    db.select({ sessions: sql<number>`count(*)`, totalSeconds: sql<number>`sum(${platformAccessSessions.activeSeconds})`, firstSeen: sql<Date | null>`min(${platformAccessSessions.startedAt})` }).from(platformAccessSessions).where(gte(platformAccessSessions.startedAt, start)),
    db.select({ min: sql<number>`min(${platformAccessSessions.activeSeconds})`, average: sql<number>`avg(${platformAccessSessions.activeSeconds})`, max: sql<number>`max(${platformAccessSessions.activeSeconds})` }).from(platformAccessSessions).where(gte(platformAccessSessions.startedAt, start)),
    db.select({ total: sql<number>`count(*)` }).from(studySessions).where(gte(studySessions.createdAt, start)),
    db.select({ presented: sql<number>`count(*)`, answered: sql<number>`sum(case when ${studyQuestions.status} = 'answered' then 1 else 0 end)` }).from(studyQuestions).where(gte(studyQuestions.createdAt, start)),
    db.select({ correct: sql<number>`sum(case when ${learningEvents.classification} = 'correct' then 1 else 0 end)`, incorrect: sql<number>`sum(case when ${learningEvents.classification} = 'incorrect' then 1 else 0 end)`, teach: sql<number>`sum(case when ${learningEvents.classification} = 'me_ensine' then 1 else 0 end)`, immediate: sql<number>`sum(case when ${learningEvents.eventType} in ('immediate_review_correct','immediate_review_incorrect') then 1 else 0 end)`, spaced: sql<number>`sum(case when ${learningEvents.eventType} in ('spaced_review_correct','spaced_review_incorrect') then 1 else 0 end)` }).from(learningEvents).where(gte(learningEvents.createdAt, start)),
    db.select({ mode: studyQuestions.studyMode, value: sql<number>`count(*)` }).from(studyQuestions).where(gte(studyQuestions.createdAt, start)).groupBy(studyQuestions.studyMode),
    db.select({ method: users.loginMethod, value: sql<number>`count(*)` }).from(users).groupBy(users.loginMethod),
    db.select({ status: billingOrders.status, value: sql<number>`count(*)` }).from(billingOrders).where(gte(billingOrders.createdAt, start)).groupBy(billingOrders.status),
    db.select({ orders: sql<number>`count(*)`, revenue: sql<number>`sum(${billingOrders.amountCents})`, buyers: sql<number>`count(distinct ${billingOrders.userId})` }).from(billingOrders).where(and(eq(billingOrders.status, "paid"), gte(billingOrders.paidAt, start))),
    db.select({ day: paidOrderDay, value: sql<number>`sum(${billingOrders.amountCents})`, secondary: sql<number>`count(*)` }).from(billingOrders).where(and(eq(billingOrders.status, "paid"), gte(billingOrders.paidAt, start))).groupBy(paidOrderDay).orderBy(asc(paidOrderDay)),
    db.select({ total: sql<number>`count(*)`, deliveries: sql<number>`sum(${sharedQuestionCache.deliveryCount})`, feedbackGenerations: sql<number>`sum(${sharedQuestionCache.feedbackGenerationCount})`, retired: sql<number>`sum(case when ${sharedQuestionCache.status} = 'retired' then 1 else 0 end)` }).from(sharedQuestionCache),
    db.select({ userId: platformAccessSessions.userId }).from(platformAccessSessions).where(gte(platformAccessSessions.lastSeenAt, start)).groupBy(platformAccessSessions.userId),
    db.select({ userId: studySessions.userId }).from(studySessions).where(gte(studySessions.updatedAt, start)).groupBy(studySessions.userId),
    db.select({ userId: learningEvents.userId }).from(learningEvents).where(gte(learningEvents.createdAt, start)).groupBy(learningEvents.userId),
  ]);

  const activeUsers = new Set([...accessUsers, ...studyUsers, ...learningUsers].map(row => row.userId)).size;
  const access = accessAggregate[0];
  const questions = questionMetrics[0];
  const learning = learningMetrics[0];
  const commerce = paidCommerce[0];
  const accessSessionCount = numberOf(access?.sessions);
  const paidOrders = numberOf(commerce?.orders);

  return {
    period,
    queriedAt: new Date(),
    coverage: {
      accessTelemetryStartedAt: access?.firstSeen ?? null,
      access: accessSessionCount > 0 ? "partial" as const : "unavailable" as const,
      historicalNotice: accessSessionCount > 0 ? "Coleta de atividade iniciada após a instrumentação do console." : "Sem telemetria de atividade no período selecionado.",
    },
    cards: {
      totalStudents: numberOf(userTotals[0]?.total),
      activeStudents: activeUsers || null,
      answeredQuestions: numberOf(questions?.answered),
      settledRevenueCents: paidOrders > 0 ? numberOf(commerce?.revenue) : null,
    },
    registrations: { total: numberOf(newUsers[0]?.total), daily: dailySeries(period, registrationsByDay) },
    access: {
      visits: accessSessionCount || null,
      activeUsers: activeUsers || null,
      studySessions: numberOf(studySessionTotal[0]?.total),
      activeSeconds: accessSessionCount > 0 ? numberOf(access?.totalSeconds) : null,
      activeSecondsPerSession: accessSessionCount > 0 ? rangeFromRow(accessRange[0]) : { min: null, average: null, max: null },
    },
    learning: {
      presented: numberOf(questions?.presented),
      answered: numberOf(questions?.answered),
      correct: numberOf(learning?.correct),
      incorrect: numberOf(learning?.incorrect),
      teachRequests: numberOf(learning?.teach),
      immediateReviews: numberOf(learning?.immediate),
      spacedReviews: numberOf(learning?.spaced),
      accuracyPercent: nullablePercent(numberOf(learning?.correct), numberOf(learning?.correct) + numberOf(learning?.incorrect)),
      questionsPerActiveStudentDay: activeUsers > 0 ? Number((numberOf(questions?.answered) / activeUsers / analyticsWindow(period).days).toFixed(2)) : null,
      byMode: studyModes.map(row => ({ mode: row.mode, value: numberOf(row.value) })),
    },
    loginMethods: loginMethods.map(row => ({ method: row.method, value: numberOf(row.value) })),
    commerce: {
      statuses: orderStatuses.map(row => ({ status: row.status, value: numberOf(row.value) })),
      paidOrders,
      pendingOrders: numberOf(orderStatuses.find(row => row.status === "pending")?.value),
      failedOrCancelledOrders: numberOf(orderStatuses.find(row => row.status === "failed")?.value) + numberOf(orderStatuses.find(row => row.status === "cancelled")?.value),
      uniqueBuyers: paidOrders > 0 ? numberOf(commerce?.buyers) : null,
      settledRevenueCents: paidOrders > 0 ? numberOf(commerce?.revenue) : null,
      averageTicketCents: nullableAverage(numberOf(commerce?.revenue), paidOrders),
      daily: dailySeries(period, commerceByDay),
    },
    cache: {
      questions: numberOf(cacheMetrics[0]?.total),
      deliveries: numberOf(cacheMetrics[0]?.deliveries),
      feedbackGenerations: numberOf(cacheMetrics[0]?.feedbackGenerations),
      retired: numberOf(cacheMetrics[0]?.retired),
    },
  };
}

export async function getAdminAnalyticsOperations(period: AnalyticsPeriod) {
  const db = await requireDb();
  const { start } = analyticsWindow(period);
  await captureRuntimeMetrics("admin_console");
  const [
    loginAttempts,
    paymentStatusRows,
    emailStatusRows,
    integrity,
    operationRows,
    llmRows,
    llmByOperation,
    runtimeRows,
    externalRows,
    activeSessions,
  ] = await Promise.all([
    db.select({ total: sql<number>`count(*)`, failed: sql<number>`sum(case when ${authLoginAttempts.succeeded} = false then 1 else 0 end)` }).from(authLoginAttempts).where(gte(authLoginAttempts.createdAt, start)),
    db.select({ status: paymentAttempts.status, value: sql<number>`count(*)` }).from(paymentAttempts).where(gte(paymentAttempts.createdAt, start)).groupBy(paymentAttempts.status),
    db.select({ status: authPasswordDeliveries.status, value: sql<number>`count(*)` }).from(authPasswordDeliveries).where(gte(authPasswordDeliveries.createdAt, start)).groupBy(authPasswordDeliveries.status),
    Promise.all([
      db.select({ value: sql<number>`count(*)` }).from(studentReadinessMaps).where(eq(studentReadinessMaps.integrityStatus, "blocked")),
      db.select({ value: sql<number>`count(*)` }).from(knowledgeSources).where(eq(knowledgeSources.status, "failed")),
      db.select({ value: sql<number>`count(*)` }).from(sharedQuestionCache).where(eq(sharedQuestionCache.status, "retired")),
    ]),
    db.select({ component: operationMetricEvents.component, outcome: operationMetricEvents.outcome, value: sql<number>`count(*)`, min: sql<number>`min(${operationMetricEvents.durationMs})`, average: sql<number>`avg(${operationMetricEvents.durationMs})`, max: sql<number>`max(${operationMetricEvents.durationMs})` }).from(operationMetricEvents).where(gte(operationMetricEvents.occurredAt, start)).groupBy(operationMetricEvents.component, operationMetricEvents.outcome),
    db.select({ total: sql<number>`count(*)`, succeeded: sql<number>`sum(case when ${llmUsageEvents.status} = 'succeeded' then 1 else 0 end)`, failed: sql<number>`sum(case when ${llmUsageEvents.status} = 'failed' then 1 else 0 end)`, promptTokens: sql<number>`sum(${llmUsageEvents.promptTokens})`, completionTokens: sql<number>`sum(${llmUsageEvents.completionTokens})`, totalTokens: sql<number>`sum(${llmUsageEvents.totalTokens})`, cost: sql<number>`sum(${llmUsageEvents.estimatedCostCents})`, pricedEvents: sql<number>`sum(case when ${llmUsageEvents.estimatedCostCents} is not null then 1 else 0 end)`, min: sql<number>`min(${llmUsageEvents.latencyMs})`, average: sql<number>`avg(${llmUsageEvents.latencyMs})`, max: sql<number>`max(${llmUsageEvents.latencyMs})` }).from(llmUsageEvents).where(gte(llmUsageEvents.occurredAt, start)),
    db.select({ operation: llmUsageEvents.operation, model: llmUsageEvents.model, value: sql<number>`count(*)` }).from(llmUsageEvents).where(gte(llmUsageEvents.occurredAt, start)).groupBy(llmUsageEvents.operation, llmUsageEvents.model),
    db.select({ metricName: runtimeMetricSnapshots.metricName, min: sql<number>`min(${runtimeMetricSnapshots.value})`, average: sql<number>`avg(${runtimeMetricSnapshots.value})`, max: sql<number>`max(${runtimeMetricSnapshots.value})` }).from(runtimeMetricSnapshots).where(gte(runtimeMetricSnapshots.capturedAt, start)).groupBy(runtimeMetricSnapshots.metricName),
    db.select({ total: sql<number>`count(*)`, succeeded: sql<number>`sum(case when ${externalHealthChecks.status} = 'succeeded' then 1 else 0 end)` }).from(externalHealthChecks).where(gte(externalHealthChecks.checkedAt, start)),
    db.select({ value: sql<number>`count(*)` }).from(platformAccessSessions).where(gte(platformAccessSessions.lastSeenAt, new Date(Date.now() - 5 * 60 * 1000))),
  ]);
  const auth = loginAttempts[0];
  const paymentTotal = paymentStatusRows.reduce((total, row) => total + numberOf(row.value), 0);
  const paymentFailures = paymentStatusRows.filter(row => row.status === "failed" || row.status === "declined").reduce((total, row) => total + numberOf(row.value), 0);
  const emailTotal = emailStatusRows.reduce((total, row) => total + numberOf(row.value), 0);
  const emailFailures = numberOf(emailStatusRows.find(row => row.status === "failed")?.value);
  const llm = llmRows[0];
  const health = externalRows[0];
  const operationTotal = operationRows.reduce((total, row) => total + numberOf(row.value), 0);
  const operationFailures = operationRows.filter(row => row.outcome === "failed").reduce((total, row) => total + numberOf(row.value), 0);
  const activeTelemetry = (await db.select({ total: sql<number>`count(*)` }).from(platformAccessSessions))[0];

  return {
    period,
    queriedAt: new Date(),
    coverage: {
      operationTelemetry: operationTotal > 0 ? "partial" as const : "unavailable" as const,
      llmTelemetry: numberOf(llm?.total) > 0 ? "partial" as const : "unavailable" as const,
      runtimeMetrics: runtimeRows.length > 0 ? "partial" as const : "unavailable" as const,
      externalAvailability: numberOf(health?.total) > 0 ? "available" as const : "unavailable" as const,
    },
    cards: {
      transactionalFailurePercent: nullablePercent(operationFailures + paymentFailures + emailFailures, operationTotal + paymentTotal + emailTotal),
      availabilityPercent: nullablePercent(numberOf(health?.succeeded), numberOf(health?.total)),
      estimatedLlmCostCents: numberOf(llm?.pricedEvents) > 0 ? numberOf(llm?.cost) : null,
      activeSessionsRecent: numberOf(activeTelemetry?.total) > 0 ? numberOf(activeSessions[0]?.value) : null,
    },
    transactionalFailures: {
      authentication: { total: numberOf(auth?.total), failed: numberOf(auth?.failed), percent: nullablePercent(numberOf(auth?.failed), numberOf(auth?.total)) },
      payment: { total: paymentTotal, failed: paymentFailures, percent: nullablePercent(paymentFailures, paymentTotal) },
      email: { total: emailTotal, failed: emailFailures, percent: nullablePercent(emailFailures, emailTotal) },
    },
    integrity: {
      blockedReadinessMaps: numberOf(integrity[0][0]?.value),
      failedKnowledgeSources: numberOf(integrity[1][0]?.value),
      retiredQuestions: numberOf(integrity[2][0]?.value),
    },
    middleware: operationRows.map(row => ({ component: row.component, outcome: row.outcome, count: numberOf(row.value), latencyMs: rangeFromRow(row) })),
    llm: {
      events: numberOf(llm?.total) || null,
      succeeded: numberOf(llm?.succeeded),
      failed: numberOf(llm?.failed),
      promptTokens: nullableNumber(llm?.promptTokens),
      completionTokens: nullableNumber(llm?.completionTokens),
      totalTokens: nullableNumber(llm?.totalTokens),
      estimatedCostCents: numberOf(llm?.pricedEvents) > 0 ? numberOf(llm?.cost) : null,
      latencyMs: numberOf(llm?.total) > 0 ? rangeFromRow(llm) : { min: null, average: null, max: null },
      byOperation: llmByOperation.map(row => ({ operation: row.operation, model: row.model, count: numberOf(row.value) })),
    },
    runtime: runtimeRows.map(row => ({ metricName: row.metricName, unit: "MB", values: rangeFromRow(row), note: "Métrica do processo Node observado; não representa toda a infraestrutura gerenciada." })),
    availability: numberOf(health?.total) > 0
      ? { percent: nullablePercent(numberOf(health?.succeeded), numberOf(health?.total)), checks: numberOf(health?.total) }
      : { percent: null, checks: null, notice: "Não mensurável sem sonda externa independente." },
  };
}

export async function getAdminAnalyticsCosts(period: AnalyticsPeriod) {
  const db = await requireDb();
  const { start } = analyticsWindow(period);
  const [llm, operational] = await Promise.all([
    db.select({ events: sql<number>`count(*)`, pricedEvents: sql<number>`sum(case when ${llmUsageEvents.estimatedCostCents} is not null then 1 else 0 end)`, amount: sql<number>`sum(${llmUsageEvents.estimatedCostCents})` }).from(llmUsageEvents).where(gte(llmUsageEvents.occurredAt, start)),
    db.select({ entries: sql<number>`count(*)`, amount: sql<number>`sum(${operationalCostEntries.amountCents})`, currency: operationalCostEntries.currency }).from(operationalCostEntries).where(gte(operationalCostEntries.occurredAt, start)).groupBy(operationalCostEntries.currency),
  ]);
  const llmRow = llm[0];
  const llmCostCents = numberOf(llmRow?.pricedEvents) > 0 ? numberOf(llmRow?.amount) : null;
  const brlCost = operational.find(row => row.currency === "BRL");
  const operationalCostCents = brlCost && numberOf(brlCost.entries) > 0 ? numberOf(brlCost.amount) : null;
  return {
    period,
    llm: { events: numberOf(llmRow?.events) || null, estimatedCostCents: llmCostCents, currency: "USD", notice: llmCostCents === null ? "Consumo pode existir, mas não há regra de preço aplicável configurada." : null },
    operational: operational.map(row => ({ currency: row.currency, entries: numberOf(row.entries), amountCents: numberOf(row.amount) })),
    totalObservedBrlCents: operationalCostCents,
    totalNotice: llmCostCents !== null ? "Estimativas de LLM estão em USD e não são somadas a despesas em BRL sem uma taxa de câmbio explícita." : "Despesas operacionais reais só aparecem após lançamento administrativo; estimativas de LLM exigem uma regra de preço aplicável.",
  };
}
