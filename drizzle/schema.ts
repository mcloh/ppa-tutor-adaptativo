import {
  boolean,
  date,
  foreignKey,
  index,
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const learningStates = [
  "not_presented",
  "presented",
  "taught",
  "independent_correct",
  "partial_consolidation",
  "partial_adequate",
  "partial_strong",
  "partial_confirmed",
  "confirmed",
  "relearning",
] as const;

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    googleSubject: varchar("googleSubject", { length: 255 }),
    passwordChangeRequired: boolean("passwordChangeRequired").default(false).notNull(),
    temporaryPasswordIssuedAt: timestamp("temporaryPasswordIssuedAt"),
    temporaryPasswordExpiresAt: timestamp("temporaryPasswordExpiresAt"),
    loginMethod: varchar("loginMethod", { length: 64 }).default("password").notNull(),
    role: mysqlEnum("role", ["user", "admin", "homologation"]).default("user").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_google_subject_unique").on(table.googleSubject),
  ]
);

/** Dados cadastrais do aluno. Nome e e-mail permanecem na conta; e-mail nunca é editável por este domínio. */
export const studentProfiles = mysqlTable(
  "student_profiles",
  {
    userId: int("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    dateOfBirth: date("dateOfBirth", { mode: "string" }),
    gender: mysqlEnum("gender", ["M", "F", "NB"]),
    city: varchar("city", { length: 120 }),
    stateUf: varchar("stateUf", { length: 2 }),
    theoreticalCourseProvider: varchar("theoreticalCourseProvider", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

/** Histórico declarado pelo próprio aluno. Todas as consultas e escritas são delimitadas por userId. */
export const anacExamAttempts = mysqlTable(
  "anac_exam_attempts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    examDate: date("examDate", { mode: "string" }).notNull(),
    metScore: int("metScore").notNull(),
    regScore: int("regScore").notNull(),
    navScore: int("navScore").notNull(),
    mecScore: int("mecScore").notNull(),
    tvoScore: int("tvoScore").notNull(),
    approved: boolean("approved").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("anac_attempts_user_exam_date_idx").on(table.userId, table.examDate)]
);

export const authSessions = mysqlTable(
  "auth_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  table => [
    uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    index("auth_sessions_user_active_idx").on(table.userId, table.expiresAt),
  ]
);

export const authLoginAttempts = mysqlTable(
  "auth_login_attempts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    emailHash: varchar("emailHash", { length: 64 }).notNull(),
    ipHash: varchar("ipHash", { length: 64 }).notNull(),
    succeeded: boolean("succeeded").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("auth_attempts_lookup_idx").on(table.emailHash, table.createdAt)]
);

/** Auditoria de emissões de senha temporária. A senha em si nunca é registrada. */
export const authPasswordDeliveries = mysqlTable(
  "auth_password_deliveries",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: mysqlEnum("purpose", ["activation", "password_reset"]).notNull(),
    recipientHash: varchar("recipientHash", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["issued", "sent", "failed"]).default("issued").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    smtpAcceptedAt: timestamp("smtpAcceptedAt"),
    smtpMessageIdHash: varchar("smtpMessageIdHash", { length: 64 }),
    dispatchedAt: timestamp("dispatchedAt"),
    failureCode: varchar("failureCode", { length: 48 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("auth_password_delivery_user_created_idx").on(table.userId, table.createdAt),
    index("auth_password_delivery_status_idx").on(table.status, table.expiresAt),
  ],
);

/** Sessões agregadas de uso da própria plataforma; não armazenam IP, user-agent ou conteúdo de tela. */
export const platformAccessSessions = mysqlTable(
  "platform_access_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    activeSeconds: int("activeSeconds").default(0).notNull(),
    lastView: varchar("lastView", { length: 32 }).notNull(),
  },
  table => [
    index("platform_access_user_last_seen_idx").on(table.userId, table.lastSeenAt),
    index("platform_access_started_idx").on(table.startedAt),
  ]
);

/** Metadados mínimos de operações; não recebe payload, stack trace, URL, token ou dados pedagógicos. */
export const operationMetricEvents = mysqlTable(
  "operation_metric_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
    component: varchar("component", { length: 32 }).notNull(),
    operation: varchar("operation", { length: 64 }).notNull(),
    outcome: mysqlEnum("outcome", ["succeeded", "failed", "fallback"]).notNull(),
    durationMs: int("durationMs"),
    errorCode: varchar("errorCode", { length: 64 }),
    metadataJson: longtext("metadataJson"),
  },
  table => [
    index("operation_metrics_time_idx").on(table.occurredAt),
    index("operation_metrics_component_time_idx").on(table.component, table.occurredAt),
    index("operation_metrics_outcome_time_idx").on(table.outcome, table.occurredAt),
  ]
);

/** Regras explícitas de preço para custos de LLM; ausência de regra mantém o custo nulo. */
export const llmPricingRules = mysqlTable(
  "llm_pricing_rules",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    provider: varchar("provider", { length: 64 }).notNull(),
    model: varchar("model", { length: 128 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    inputCentsPerMillion: int("inputCentsPerMillion").notNull(),
    outputCentsPerMillion: int("outputCentsPerMillion").notNull(),
    effectiveFrom: timestamp("effectiveFrom").notNull(),
    effectiveTo: timestamp("effectiveTo"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("llm_pricing_model_effective_idx").on(table.provider, table.model, table.effectiveFrom)]
);

/** Uso técnico de LLM sem mensagens, prompts, contexto RAG, alternativas ou respostas. */
export const llmUsageEvents = mysqlTable(
  "llm_usage_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
    operation: varchar("operation", { length: 64 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    model: varchar("model", { length: 128 }).notNull(),
    status: mysqlEnum("status", ["succeeded", "failed"]).notNull(),
    promptTokens: int("promptTokens"),
    completionTokens: int("completionTokens"),
    totalTokens: int("totalTokens"),
    latencyMs: int("latencyMs"),
    estimatedCostCents: int("estimatedCostCents"),
    pricingRuleId: varchar("pricingRuleId", { length: 64 }),
    errorCode: varchar("errorCode", { length: 64 }),
  },
  table => [
    index("llm_usage_time_idx").on(table.occurredAt),
    index("llm_usage_operation_time_idx").on(table.operation, table.occurredAt),
    foreignKey({ columns: [table.pricingRuleId], foreignColumns: [llmPricingRules.id], name: "llm_usage_pricing_rule_fk" }).onDelete("set null"),
  ]
);

/** Leituras locais do processo Node; não representam a infraestrutura gerenciada como um todo. */
export const runtimeMetricSnapshots = mysqlTable(
  "runtime_metric_snapshots",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
    metricName: varchar("metricName", { length: 64 }).notNull(),
    value: int("value").notNull(),
    unit: varchar("unit", { length: 16 }).notNull(),
    source: varchar("source", { length: 64 }).notNull(),
  },
  table => [index("runtime_metric_name_time_idx").on(table.metricName, table.capturedAt)]
);

/** A disponibilidade só é calculada quando uma sonda externa independente registra observações aqui. */
export const externalHealthChecks = mysqlTable(
  "external_health_checks",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    checkedAt: timestamp("checkedAt").defaultNow().notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["succeeded", "failed"]).notNull(),
    durationMs: int("durationMs"),
  },
  table => [index("external_health_time_idx").on(table.checkedAt)]
);

/** Despesas reais e opcionais registradas por administrador, separadas de estimativas de LLM. */
export const operationalCostEntries = mysqlTable(
  "operational_cost_entries",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    occurredAt: timestamp("occurredAt").notNull(),
    category: varchar("category", { length: 48 }).notNull(),
    provider: varchar("provider", { length: 96 }).notNull(),
    amountCents: int("amountCents").notNull(),
    currency: varchar("currency", { length: 3 }).default("BRL").notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("operational_cost_time_idx").on(table.occurredAt, table.category)]
);

export const courseCatalogVersions = mysqlTable("course_catalog_versions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  version: varchar("version", { length: 32 }).notNull().unique(),
  sourceChecksum: varchar("sourceChecksum", { length: 64 }).notNull(),
  sourceMapJson: longtext("sourceMapJson").notNull(),
  sourcePlanMarkdown: longtext("sourcePlanMarkdown").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const canonicalConcepts = mysqlTable(
  "canonical_concepts",
  {
    id: varchar("id", { length: 48 }).primaryKey(),
    catalogVersionId: varchar("catalogVersionId", { length: 64 }).notNull(),
    canonicalIndex: int("canonicalIndex").notNull(),
    matterId: varchar("matterId", { length: 20 }).notNull(),
    matterName: varchar("matterName", { length: 180 }).notNull(),
    chapterId: varchar("chapterId", { length: 24 }).notNull(),
    chapterName: varchar("chapterName", { length: 180 }).notNull(),
    topicId: varchar("topicId", { length: 32 }).notNull(),
    topicName: varchar("topicName", { length: 180 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    priority: mysqlEnum("priority", ["P1", "P2", "P3", "P4"]).notNull(),
    gapScore: int("gapScore").notNull(),
    referenceQuestionCount: int("referenceQuestionCount").default(0).notNull(),
    recentIncidence: varchar("recentIncidence", { length: 32 }).default("none").notNull(),
  },
  table => [
    uniqueIndex("canonical_concepts_catalog_index_unique").on(table.catalogVersionId, table.canonicalIndex),
    index("canonical_concepts_priority_idx").on(table.catalogVersionId, table.priority, table.matterId),
    foreignKey({
      columns: [table.catalogVersionId],
      foreignColumns: [courseCatalogVersions.id],
      name: "canonical_catalog_fk",
    }).onDelete("restrict"),
  ]
);

export const knowledgeSources = mysqlTable(
  "knowledge_sources",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    catalogVersionId: varchar("catalogVersionId", { length: 64 }).notNull(),
    logicalName: varchar("logicalName", { length: 160 }).notNull(),
    originalFilename: varchar("originalFilename", { length: 255 }).notNull(),
    sourceChecksum: varchar("sourceChecksum", { length: 64 }).notNull(),
    extractionChecksum: varchar("extractionChecksum", { length: 64 }).notNull(),
    extractionVersion: varchar("extractionVersion", { length: 32 }).notNull(),
    status: mysqlEnum("status", ["indexing", "ready", "failed"]).default("indexing").notNull(),
    chunkCount: int("chunkCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    indexedAt: timestamp("indexedAt"),
  },
  table => [
    uniqueIndex("knowledge_source_version_unique").on(table.catalogVersionId, table.sourceChecksum),
    foreignKey({
      columns: [table.catalogVersionId],
      foreignColumns: [courseCatalogVersions.id],
      name: "knowledge_source_catalog_fk",
    }).onDelete("restrict"),
  ]
);

export const knowledgeChunks = mysqlTable(
  "knowledge_chunks",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    sourceId: varchar("sourceId", { length: 64 }).notNull(),
    module: varchar("module", { length: 120 }).notNull(),
    sourcePath: varchar("sourcePath", { length: 512 }).notNull(),
    ordinal: int("ordinal").notNull(),
    contentChecksum: varchar("contentChecksum", { length: 64 }).notNull(),
    content: longtext("content").notNull(),
    charCount: int("charCount").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("knowledge_chunks_source_path_unique").on(table.sourceId, table.sourcePath),
    index("knowledge_chunks_source_module_idx").on(table.sourceId, table.module, table.ordinal),
    foreignKey({
      columns: [table.sourceId],
      foreignColumns: [knowledgeSources.id],
      name: "knowledge_chunk_source_fk",
    }).onDelete("cascade"),
  ]
);

export const knowledgeChunkTerms = mysqlTable(
  "knowledge_chunk_terms",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    sourceId: varchar("sourceId", { length: 64 }).notNull(),
    chunkId: varchar("chunkId", { length: 64 }).notNull(),
    token: varchar("token", { length: 64 }).notNull(),
    weight: int("weight").default(1).notNull(),
  },
  table => [
    uniqueIndex("knowledge_terms_chunk_token_unique").on(table.chunkId, table.token),
    index("knowledge_terms_source_token_idx").on(table.sourceId, table.token),
    foreignKey({
      columns: [table.sourceId],
      foreignColumns: [knowledgeSources.id],
      name: "knowledge_term_source_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.chunkId],
      foreignColumns: [knowledgeChunks.id],
      name: "knowledge_term_chunk_fk",
    }).onDelete("cascade"),
  ]
);

export const sharedQuestionCache = mysqlTable(
  "shared_question_cache",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    catalogVersionId: varchar("catalogVersionId", { length: 64 }).notNull(),
    conceptId: varchar("conceptId", { length: 48 }).notNull(),
    conceptIdsJson: longtext("conceptIdsJson"),
    ragSourceId: varchar("ragSourceId", { length: 64 }).notNull(),
    ragSourceChecksum: varchar("ragSourceChecksum", { length: 64 }).notNull(),
    ragChunkIdsJson: longtext("ragChunkIdsJson").notNull(),
    questionSignature: varchar("questionSignature", { length: 64 }).notNull(),
    prompt: longtext("prompt").notNull(),
    optionA: longtext("optionA").notNull(),
    optionB: longtext("optionB").notNull(),
    optionC: longtext("optionC").notNull(),
    correctOption: mysqlEnum("correctOption", ["A", "B", "C"]).notNull(),
    validationJson: longtext("validationJson").notNull(),
    feedbackCorrectMarkdown: longtext("feedbackCorrectMarkdown"),
    feedbackIncorrectMarkdown: longtext("feedbackIncorrectMarkdown"),
    feedbackTeachMarkdown: longtext("feedbackTeachMarkdown"),
    status: mysqlEnum("status", ["approved", "retired"]).default("approved").notNull(),
    deliveryCount: int("deliveryCount").default(0).notNull(),
    feedbackGenerationCount: int("feedbackGenerationCount").default(0).notNull(),
    correctDeliveries: int("correctDeliveries").default(0).notNull(),
    incorrectDeliveries: int("incorrectDeliveries").default(0).notNull(),
    teachDeliveries: int("teachDeliveries").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    lastUsedAt: timestamp("lastUsedAt"),
    retiredAt: timestamp("retiredAt"),
    retiredReason: varchar("retiredReason", { length: 500 }),
  },
  table => [
    uniqueIndex("cache_question_signature_unique").on(table.questionSignature),
    index("cache_question_reuse_idx").on(table.catalogVersionId, table.conceptId, table.ragSourceId, table.status),
    foreignKey({ columns: [table.catalogVersionId], foreignColumns: [courseCatalogVersions.id], name: "cache_catalog_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.conceptId], foreignColumns: [canonicalConcepts.id], name: "cache_concept_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.ragSourceId], foreignColumns: [knowledgeSources.id], name: "cache_rag_source_fk" }).onDelete("restrict"),
  ]
);

export const studentReadinessMaps = mysqlTable(
  "student_readiness_maps",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    catalogVersionId: varchar("catalogVersionId", { length: 64 }).notNull(),
    currentVersion: int("currentVersion").default(0).notNull(),
    mapJson: longtext("mapJson").notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    integrityStatus: mysqlEnum("integrityStatus", ["valid", "recoverable", "blocked"])
      .default("valid")
      .notNull(),
    lastEventId: varchar("lastEventId", { length: 64 }),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("student_maps_user_unique").on(table.userId),
    foreignKey({
      columns: [table.catalogVersionId],
      foreignColumns: [courseCatalogVersions.id],
      name: "student_map_catalog_fk",
    }).onDelete("restrict"),
  ]
);

export const readinessMapVersions = mysqlTable(
  "readiness_map_versions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    mapId: varchar("mapId", { length: 64 }).notNull().references(() => studentReadinessMaps.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    version: int("version").notNull(),
    eventId: varchar("eventId", { length: 64 }).notNull(),
    patchJson: longtext("patchJson").notNull(),
    snapshotJson: longtext("snapshotJson"),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("readiness_versions_map_version_unique").on(table.mapId, table.version),
    uniqueIndex("readiness_versions_event_unique").on(table.eventId),
    index("readiness_versions_user_idx").on(table.userId, table.createdAt),
  ]
);

export const studentConceptReadiness = mysqlTable(
  "student_concept_readiness",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    conceptId: varchar("conceptId", { length: 48 }).notNull(),
    currentState: mysqlEnum("currentState", learningStates).default("not_presented").notNull(),
    readinessScore: int("readinessScore").default(0).notNull(),
    confidence: int("confidence").default(0).notNull(),
    questionsPresented: int("questionsPresented").default(0).notNull(),
    independentAnswers: int("independentAnswers").default(0).notNull(),
    correct: int("correct").default(0).notNull(),
    incorrect: int("incorrect").default(0).notNull(),
    teachRequests: int("teachRequests").default(0).notNull(),
    immediateReviewQuestions: int("immediateReviewQuestions").default(0).notNull(),
    immediateCorrect: int("immediateCorrect").default(0).notNull(),
    immediateIncorrect: int("immediateIncorrect").default(0).notNull(),
    spacedReviewQuestions: int("spacedReviewQuestions").default(0).notNull(),
    spacedCorrect: int("spacedCorrect").default(0).notNull(),
    spacedIncorrect: int("spacedIncorrect").default(0).notNull(),
    firstPresentedAt: timestamp("firstPresentedAt"),
    lastPresentedAt: timestamp("lastPresentedAt"),
    lastIndependentAnswerAt: timestamp("lastIndependentAnswerAt"),
    lastTeachAt: timestamp("lastTeachAt"),
    lastReviewAt: timestamp("lastReviewAt"),
    reviewDueAt: timestamp("reviewDueAt"),
    reviewEligibleAfterQuestion: int("reviewEligibleAfterQuestion").default(0).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("student_concept_readiness_user_concept_unique").on(table.userId, table.conceptId),
    index("student_concept_due_idx").on(table.userId, table.reviewDueAt),
    index("student_concept_state_idx").on(table.userId, table.currentState),
    foreignKey({
      columns: [table.conceptId],
      foreignColumns: [canonicalConcepts.id],
      name: "readiness_concept_fk",
    }).onDelete("restrict"),
  ]
);

export const studySessions = mysqlTable(
  "study_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    mode: mysqlEnum("mode", ["diagnostic", "simulado", "tutor"]).default("tutor").notNull(),
    programId: varchar("programId", { length: 64 }),
    matrixJson: longtext("matrixJson"),
    status: mysqlEnum("status", ["active", "paused", "completed"]).default("active").notNull(),
    currentQuestionId: varchar("currentQuestionId", { length: 64 }),
    lastMatterId: varchar("lastMatterId", { length: 20 }),
    consecutiveMatterQuestions: int("consecutiveMatterQuestions").default(0).notNull(),
    questionsSinceLastReview: int("questionsSinceLastReview").default(0).notNull(),
    resumedAt: timestamp("resumedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("study_sessions_user_status_idx").on(table.userId, table.status),
    index("study_sessions_user_mode_idx").on(table.userId, table.mode, table.status),
  ]
);

export const studyQuestions = mysqlTable(
  "study_questions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    sessionId: varchar("sessionId", { length: 64 }).notNull().references(() => studySessions.id, { onDelete: "cascade" }),
    questionNumber: int("questionNumber").notNull(),
    studyMode: mysqlEnum("studyMode", ["diagnostic", "simulado", "tutor"]).default("tutor").notNull(),
    matrixSlot: int("matrixSlot"),
    prompt: longtext("prompt").notNull(),
    optionA: longtext("optionA").notNull(),
    optionB: longtext("optionB").notNull(),
    optionC: longtext("optionC").notNull(),
    correctOption: mysqlEnum("correctOption", ["A", "B", "C"]).notNull(),
    conceptIdsJson: longtext("conceptIdsJson").notNull(),
    pedagogicalAction: mysqlEnum("pedagogicalAction", ["new", "immediate_review", "spaced_review"]).notNull(),
    validationJson: longtext("validationJson").notNull(),
    cacheQuestionId: varchar("cacheQuestionId", { length: 64 }),
    feedbackMarkdown: longtext("feedbackMarkdown"),
    status: mysqlEnum("status", ["presented", "answered", "retired"]).default("presented").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    answeredAt: timestamp("answeredAt"),
  },
  table => [
    uniqueIndex("study_questions_session_number_unique").on(table.sessionId, table.questionNumber),
    index("study_questions_user_status_idx").on(table.userId, table.status),
    index("study_questions_user_mode_idx").on(table.userId, table.studyMode, table.createdAt),
    index("study_questions_user_cache_idx").on(table.userId, table.cacheQuestionId),
    foreignKey({ columns: [table.cacheQuestionId], foreignColumns: [sharedQuestionCache.id], name: "study_question_cache_fk" }).onDelete("restrict"),
  ]
);

/** Estado durável da porta de entrada diagnóstica e da modalidade escolhida pelo aluno. */
export const studentStudyPrograms = mysqlTable(
  "student_study_programs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    catalogVersionId: varchar("catalogVersionId", { length: 64 }).notNull(),
    diagnosticStatus: mysqlEnum("diagnosticStatus", ["active", "mode_selection", "completed"]).default("active").notNull(),
    selectedMode: mysqlEnum("selectedMode", ["simulado", "tutor"]),
    diagnosticPlanJson: longtext("diagnosticPlanJson").notNull(),
    diagnosticSessionId: varchar("diagnosticSessionId", { length: 64 }),
    completedAt: timestamp("completedAt"),
    selectedAt: timestamp("selectedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("study_program_user_unique").on(table.userId),
    index("study_program_status_idx").on(table.userId, table.diagnosticStatus),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "program_user_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.catalogVersionId], foreignColumns: [courseCatalogVersions.id], name: "program_catalog_fk" }).onDelete("restrict"),
  ]
);

export const learningEvents = mysqlTable(
  "learning_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    questionId: varchar("questionId", { length: 64 }).notNull().references(() => studyQuestions.id, { onDelete: "restrict" }),
    mapVersion: int("mapVersion").notNull(),
    eventType: mysqlEnum("eventType", [
      "independent_correct",
      "independent_incorrect",
      "teach_requested",
      "immediate_review_correct",
      "immediate_review_incorrect",
      "spaced_review_correct",
      "spaced_review_incorrect",
    ]).notNull(),
    classification: mysqlEnum("classification", ["correct", "incorrect", "me_ensine"]).notNull(),
    answer: varchar("answer", { length: 24 }).notNull(),
    correctAnswer: varchar("correctAnswer", { length: 1 }).notNull(),
    conceptIdsJson: longtext("conceptIdsJson").notNull(),
    source: varchar("source", { length: 32 }).default("tutor").notNull(),
    auditNote: longtext("auditNote"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("learning_events_question_unique").on(table.questionId),
    index("learning_events_user_created_idx").on(table.userId, table.createdAt),
  ]
);

export const studyPlans = mysqlTable(
  "study_plans",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    version: int("version").notNull(),
    sourceMapVersion: int("sourceMapVersion").notNull(),
    contentMarkdown: longtext("contentMarkdown").notNull(),
    auditReference: varchar("auditReference", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("study_plans_user_version_unique").on(table.userId, table.version)]
);

export const progressAssessments = mysqlTable(
  "progress_assessments",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    assessmentType: mysqlEnum("assessmentType", ["partial_20", "diagnostic_100"]).notNull(),
    startQuestionNumber: int("startQuestionNumber").notNull(),
    endQuestionNumber: int("endQuestionNumber").notNull(),
    mapVersion: int("mapVersion").notNull(),
    contentMarkdown: longtext("contentMarkdown").notNull(),
    auditReference: varchar("auditReference", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("assessments_user_end_question_unique").on(table.userId, table.endQuestionNumber),
    index("assessments_user_created_idx").on(table.userId, table.createdAt),
  ]
);

export const inAppNotifications = mysqlTable(
  "in_app_notifications",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", ["review_due", "assessment_ready", "integrity_attention"]).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    detail: longtext("detail").notNull(),
    referenceType: varchar("referenceType", { length: 48 }),
    referenceId: varchar("referenceId", { length: 64 }),
    dedupeKey: varchar("dedupeKey", { length: 128 }).notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("notifications_user_dedupe_unique").on(table.userId, table.dedupeKey),
    index("notifications_user_read_idx").on(table.userId, table.readAt, table.createdAt),
  ]
);

/** Saldo materializado; o histórico em creditLedger permanece a trilha imutável de auditoria. */
export const creditBalances = mysqlTable(
  "credit_balances",
  {
    userId: int("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    availableCredits: int("availableCredits").default(0).notNull(),
    lifetimeGranted: int("lifetimeGranted").default(0).notNull(),
    lifetimeConsumed: int("lifetimeConsumed").default(0).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

/** Pedido comercial interno. Valores monetários usam sempre centavos e nunca vêm do cliente. */
export const billingOrders = mysqlTable(
  "billing_orders",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    productKey: varchar("productKey", { length: 48 }).notNull(),
    status: mysqlEnum("status", ["draft", "pending", "paid", "failed", "cancelled", "expired"]).default("draft").notNull(),
    amountCents: int("amountCents").notNull(),
    currency: varchar("currency", { length: 3 }).default("BRL").notNull(),
    creditQuantity: int("creditQuantity").notNull(),
    provider: varchar("provider", { length: 32 }).default("pagbank").notNull(),
    environment: mysqlEnum("environment", ["sandbox", "production"]).default("sandbox").notNull(),
    referenceId: varchar("referenceId", { length: 96 }).notNull(),
    externalOrderId: varchar("externalOrderId", { length: 160 }),
    idempotencyKey: varchar("idempotencyKey", { length: 96 }).notNull(),
    checkoutUrl: varchar("checkoutUrl", { length: 2048 }),
    metadataJson: longtext("metadataJson"),
    expiresAt: timestamp("expiresAt"),
    paidAt: timestamp("paidAt"),
    cancelledAt: timestamp("cancelledAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("orders_reference_unique").on(table.referenceId),
    uniqueIndex("orders_user_idem_unique").on(table.userId, table.idempotencyKey),
    index("orders_user_status_idx").on(table.userId, table.status, table.createdAt),
    index("orders_environment_status_idx").on(table.environment, table.status, table.createdAt),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "order_user_fk" }).onDelete("cascade"),
  ]
);

/** Tentativas para criação/consulta de cobrança no provedor, sem armazenar credenciais ou dados de cartão. */
export const paymentAttempts = mysqlTable(
  "payment_attempts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    orderId: varchar("orderId", { length: 64 }).notNull(),
    userId: int("userId").notNull(),
    provider: varchar("provider", { length: 32 }).default("pagbank").notNull(),
    environment: mysqlEnum("environment", ["sandbox", "production"]).default("sandbox").notNull(),
    status: mysqlEnum("status", ["created", "waiting", "in_analysis", "paid", "declined", "canceled", "failed", "expired"]).default("created").notNull(),
    externalPaymentId: varchar("externalPaymentId", { length: 160 }),
    externalReference: varchar("externalReference", { length: 160 }),
    idempotencyKey: varchar("idempotencyKey", { length: 96 }).notNull(),
    requestPayloadHash: varchar("requestPayloadHash", { length: 64 }),
    responsePayloadHash: varchar("responsePayloadHash", { length: 64 }),
    failureCode: varchar("failureCode", { length: 96 }),
    failureDetail: varchar("failureDetail", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("pay_attempt_idem_unique").on(table.idempotencyKey),
    uniqueIndex("pay_attempt_external_unique").on(table.provider, table.externalPaymentId),
    index("pay_attempt_order_idx").on(table.orderId, table.createdAt),
    index("pay_attempt_user_idx").on(table.userId, table.createdAt),
    foreignKey({ columns: [table.orderId], foreignColumns: [billingOrders.id], name: "attempt_order_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "attempt_user_fk" }).onDelete("cascade"),
  ]
);

/** Registro deduplicado de eventos de provedor; a implementação futura poderá reprocessar falhas sem duplicar créditos. */
export const paymentWebhookEvents = mysqlTable(
  "payment_webhook_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    provider: varchar("provider", { length: 32 }).default("pagbank").notNull(),
    environment: mysqlEnum("environment", ["sandbox", "production"]).default("sandbox").notNull(),
    dedupeKey: varchar("dedupeKey", { length: 160 }).notNull(),
    externalEventId: varchar("externalEventId", { length: 160 }),
    externalPaymentId: varchar("externalPaymentId", { length: 160 }),
    orderId: varchar("orderId", { length: 64 }),
    payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
    signatureHash: varchar("signatureHash", { length: 64 }),
    processingStatus: mysqlEnum("processingStatus", ["received", "processed", "ignored", "rejected", "failed"]).default("received").notNull(),
    occurredAt: timestamp("occurredAt"),
    processedAt: timestamp("processedAt"),
    receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("webhook_dedupe_unique").on(table.provider, table.dedupeKey),
    index("webhook_payment_idx").on(table.provider, table.externalPaymentId, table.receivedAt),
    index("webhook_order_idx").on(table.orderId, table.receivedAt),
    foreignKey({ columns: [table.orderId], foreignColumns: [billingOrders.id], name: "webhook_order_fk" }).onDelete("set null"),
  ]
);

/** Evidência técnica sanitizada para homologações. Nenhuma credencial, dado de cartão ou conteúdo pedagógico é persistido. */
export const homologationAuditEvents = mysqlTable(
  "homologation_audit_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    actorUserId: int("actorUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    orderId: varchar("orderId", { length: 64 }).references(() => billingOrders.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 32 }).default("pagbank").notNull(),
    environment: mysqlEnum("environment", ["sandbox", "production"]).default("sandbox").notNull(),
    operation: mysqlEnum("operation", ["checkout_create", "checkout_opened", "checkout_return", "order_reconcile", "webhook_received", "credit_settlement"]).notNull(),
    outcome: mysqlEnum("outcome", ["started", "succeeded", "failed", "ignored"]).notNull(),
    requestEvidenceJson: longtext("requestEvidenceJson").notNull(),
    responseEvidenceJson: longtext("responseEvidenceJson").notNull(),
    requestHash: varchar("requestHash", { length: 64 }).notNull(),
    responseHash: varchar("responseHash", { length: 64 }).notNull(),
    exportedAt: timestamp("exportedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("homologation_audit_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("homologation_audit_order_created_idx").on(table.orderId, table.createdAt),
    index("homologation_audit_provider_operation_idx").on(table.provider, table.environment, table.operation, table.createdAt),
  ]
);

/** Livro-caixa de créditos. Não há caminho de atualização ou exclusão na aplicação: cada ajuste cria uma nova linha. */
export const creditLedger = mysqlTable(
  "credit_ledger",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    entryType: mysqlEnum("entryType", ["trial_grant", "purchase_grant", "question_debit", "adjustment_grant", "adjustment_debit", "refund_debit"]).notNull(),
    deltaCredits: int("deltaCredits").notNull(),
    balanceAfter: int("balanceAfter").notNull(),
    referenceType: varchar("referenceType", { length: 32 }).notNull(),
    referenceId: varchar("referenceId", { length: 96 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    metadataJson: longtext("metadataJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("ledger_user_ref_unique").on(table.userId, table.referenceType, table.referenceId),
    uniqueIndex("ledger_idem_unique").on(table.idempotencyKey),
    index("ledger_user_created_idx").on(table.userId, table.createdAt),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "ledger_user_fk" }).onDelete("cascade"),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
