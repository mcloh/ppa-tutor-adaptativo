import { createHash } from "node:crypto";

export const responseInputs = ["A", "B", "C", "ME_ENSINE"] as const;
export type ResponseInput = (typeof responseInputs)[number];
export type ResponseClassification = "correct" | "incorrect" | "me_ensine";
export type PedagogicalAction = "new" | "immediate_review" | "spaced_review";
export type AssessmentMilestone = "partial_20" | "diagnostic_100";
export type LearningState =
  | "not_presented"
  | "presented"
  | "taught"
  | "independent_correct"
  | "partial_consolidation"
  | "partial_adequate"
  | "partial_strong"
  | "partial_confirmed"
  | "confirmed"
  | "relearning";

export type ProgressSnapshot = {
  currentState: LearningState;
  readinessScore: number;
  confidence: number;
  questionsPresented: number;
  independentAnswers: number;
  correct: number;
  incorrect: number;
  teachRequests: number;
  immediateReviewQuestions: number;
  immediateCorrect: number;
  immediateIncorrect: number;
  spacedReviewQuestions: number;
  spacedCorrect: number;
  spacedIncorrect: number;
  reviewEligibleAfterQuestion: number;
};

export type Transition = {
  classification: ResponseClassification;
  eventType:
    | "independent_correct"
    | "independent_incorrect"
    | "teach_requested"
    | "immediate_review_correct"
    | "immediate_review_incorrect"
    | "spaced_review_correct"
    | "spaced_review_incorrect";
  next: ProgressSnapshot;
  reviewDueAt: Date | null;
};

export const publicClassification = (classification: ResponseClassification) =>
  classification === "me_ensine" ? "Me ensine" : classification;

export function assessmentMilestoneForQuestion(questionNumber: number): AssessmentMilestone | null {
  if (questionNumber > 0 && questionNumber % 100 === 0) return "diagnostic_100";
  if (questionNumber > 0 && questionNumber % 20 === 0) return "partial_20";
  return null;
}

export function classifyResponse(answer: ResponseInput, correctOption: "A" | "B" | "C"): ResponseClassification {
  if (answer === "ME_ENSINE") return "me_ensine";
  return answer === correctOption ? "correct" : "incorrect";
}

export function zeroProgress(): ProgressSnapshot {
  return {
    currentState: "not_presented",
    readinessScore: 0,
    confidence: 0,
    questionsPresented: 0,
    independentAnswers: 0,
    correct: 0,
    incorrect: 0,
    teachRequests: 0,
    immediateReviewQuestions: 0,
    immediateCorrect: 0,
    immediateIncorrect: 0,
    spacedReviewQuestions: 0,
    spacedCorrect: 0,
    spacedIncorrect: 0,
    reviewEligibleAfterQuestion: 0,
  };
}

function scoreFor(next: ProgressSnapshot) {
  if (next.currentState === "confirmed") return 100;
  if (next.currentState === "relearning") return Math.max(15, Math.min(55, next.correct * 15));
  if (next.currentState === "taught") return 20;
  if (next.independentAnswers === 0) return 0;
  const accuracy = next.correct / next.independentAnswers;
  const evidence = Math.min(next.independentAnswers * 10, 25);
  const spaced = Math.min(next.spacedCorrect * 18, 18);
  return Math.max(0, Math.min(95, Math.round(accuracy * 52 + evidence + spaced)));
}

function confidenceFor(next: ProgressSnapshot) {
  const independent = Math.min(next.independentAnswers * 13, 55);
  const spaced = Math.min(next.spacedReviewQuestions * 20, 35);
  const penalty = Math.min(next.incorrect * 8, 28);
  return Math.max(0, Math.min(100, independent + spaced - penalty));
}

function deriveState(next: ProgressSnapshot, classification: ResponseClassification, action: PedagogicalAction): LearningState {
  if (classification === "me_ensine") return "taught";
  if (classification === "incorrect") return "relearning";
  if (action === "spaced_review") return "confirmed";
  if (action === "immediate_review") return "partial_consolidation";
  if (next.correct >= 3) return "partial_strong";
  if (next.correct >= 2) return "partial_adequate";
  return "independent_correct";
}

export function transitionProgress(
  existing: ProgressSnapshot | undefined,
  answer: ResponseInput,
  correctOption: "A" | "B" | "C",
  action: PedagogicalAction,
  questionNumber: number,
  now: Date
): Transition {
  const classification = classifyResponse(answer, correctOption);
  const next = { ...(existing ?? zeroProgress()) };
  next.questionsPresented += 1;

  if (classification === "me_ensine") {
    next.teachRequests += 1;
    next.reviewEligibleAfterQuestion = questionNumber + 1;
    next.currentState = deriveState(next, classification, action);
    next.readinessScore = scoreFor(next);
    next.confidence = confidenceFor(next);
    return { classification, eventType: "teach_requested", next, reviewDueAt: now };
  }

  next.independentAnswers += 1;
  if (classification === "correct") next.correct += 1;
  else next.incorrect += 1;

  if (action === "immediate_review") {
    next.immediateReviewQuestions += 1;
    if (classification === "correct") next.immediateCorrect += 1;
    else next.immediateIncorrect += 1;
  }

  if (action === "spaced_review") {
    next.spacedReviewQuestions += 1;
    if (classification === "correct") next.spacedCorrect += 1;
    else next.spacedIncorrect += 1;
  }

  next.currentState = deriveState(next, classification, action);
  next.readinessScore = scoreFor(next);
  next.confidence = confidenceFor(next);

  if (classification === "incorrect") {
    next.reviewEligibleAfterQuestion = questionNumber + 1;
    return {
      classification,
      eventType: action === "spaced_review" ? "spaced_review_incorrect" : action === "immediate_review" ? "immediate_review_incorrect" : "independent_incorrect",
      next,
      reviewDueAt: now,
    };
  }

  if (action === "immediate_review") {
    next.reviewEligibleAfterQuestion = questionNumber + 5;
    return { classification, eventType: "immediate_review_correct", next, reviewDueAt: now };
  }

  if (action === "spaced_review") {
    next.reviewEligibleAfterQuestion = questionNumber + 100;
    return {
      classification,
      eventType: "spaced_review_correct",
      next,
      reviewDueAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    };
  }

  next.reviewEligibleAfterQuestion = questionNumber + (next.correct >= 2 ? 20 : 5);
  return {
    classification,
    eventType: "independent_correct",
    next,
    reviewDueAt: new Date(now.getTime() + (next.correct >= 2 ? 24 : 4) * 60 * 60 * 1000),
  };
}

export type ReadinessMap = {
  schema_version: "2.0.0";
  catalog_version: string;
  current_version: number;
  global_counters: {
    questions_presented: number;
    independent_answers: number;
    correct: number;
    incorrect: number;
    teach_requests: number;
  };
  concepts: Record<string, { state: LearningState; readiness: number; confidence: number; last_event_id: string }>;
  event_log_reference: { storage: "learning_events"; last_event_id: string | null };
  integrity: { status: "valid" | "recoverable" | "blocked"; updated_at: string };
};

export function initialReadinessMap(catalogVersion: string): ReadinessMap {
  return {
    schema_version: "2.0.0",
    catalog_version: catalogVersion,
    current_version: 0,
    global_counters: { questions_presented: 0, independent_answers: 0, correct: 0, incorrect: 0, teach_requests: 0 },
    concepts: {},
    event_log_reference: { storage: "learning_events", last_event_id: null },
    integrity: { status: "valid", updated_at: new Date(0).toISOString() },
  };
}

export function parseReadinessMap(raw: string): ReadinessMap {
  const parsed = JSON.parse(raw) as ReadinessMap;
  if (parsed.schema_version !== "2.0.0" || !parsed.global_counters || !parsed.concepts) {
    throw new Error("Mapa de prontidão inválido ou incompatível.");
  }
  return parsed;
}

export function appendMapEvent(
  map: ReadinessMap,
  input: { eventId: string; conceptIds: string[]; progressByConcept: Record<string, ProgressSnapshot>; transition: Transition; at: Date }
) {
  const next = structuredClone(map);
  next.current_version += 1;
  next.global_counters.questions_presented += 1;
  if (input.transition.classification === "me_ensine") next.global_counters.teach_requests += 1;
  else {
    next.global_counters.independent_answers += 1;
    if (input.transition.classification === "correct") next.global_counters.correct += 1;
    else next.global_counters.incorrect += 1;
  }
  for (const conceptId of input.conceptIds) {
    const progress = input.progressByConcept[conceptId];
    if (!progress) throw new Error(`Transição ausente para o conceito ${conceptId}.`);
    next.concepts[conceptId] = {
      state: progress.currentState,
      readiness: progress.readinessScore,
      confidence: progress.confidence,
      last_event_id: input.eventId,
    };
  }
  next.event_log_reference.last_event_id = input.eventId;
  next.integrity = { status: "valid", updated_at: input.at.toISOString() };
  return next;
}

export const readinessChecksum = (map: ReadinessMap) =>
  createHash("sha256").update(JSON.stringify(map)).digest("hex");

export function assessmentAuditAppendix(input: {
  type: "partial_20" | "diagnostic_100";
  questionNumber: number;
  mapVersion: number;
  counters: { questions_presented: number; independent_answers: number; correct: number; incorrect: number; teach_requests: number };
  subjects: Array<{ name: string; coverage: number; accuracy: number | null; readiness: number }>;
  gaps: Array<{ name: string; matter: string; priority: string; readiness: number; evidence: number }>;
}) {
  const start = input.questionNumber - (input.type === "diagnostic_100" ? 99 : 19);
  const accuracy = input.counters.independent_answers
    ? ((input.counters.correct / input.counters.independent_answers) * 100).toFixed(1)
    : "Sem evidência";
  const subjectRows = input.subjects.map(subject => `| ${subject.name} | ${subject.coverage}% | ${subject.accuracy === null ? "—" : `${subject.accuracy}%`} | ${subject.readiness} |`).join("\n");
  const gapRows = input.gaps.map(gap => `| ${gap.priority} | ${gap.matter} | ${gap.name} | ${gap.readiness} | ${gap.evidence} |`).join("\n");
  return `## Registro auditável do marco

**Intervalo:** Questões ${String(start).padStart(3, "0")}–${String(input.questionNumber).padStart(3, "0")}  
**Mapa de prontidão:** versão ${input.mapVersion} — integridade validada antes da gravação.

| Métrica | Valor |
|---|---:|
| Questões apresentadas (acumulado) | ${input.counters.questions_presented} |
| Respostas independentes | ${input.counters.independent_answers} |
| Acertos / erros | ${input.counters.correct} / ${input.counters.incorrect} |
| Precisão independente | ${accuracy}${accuracy === "Sem evidência" ? "" : "%"} |
| Pedidos “Me ensine” | ${input.counters.teach_requests} |

### Cobertura e prontidão por matéria

| Matéria | Cobertura | Precisão independente | Prontidão |
|---|---:|---:|---:|
${subjectRows}

### Matriz de lacunas prioritárias

| Prioridade | Matéria | Conceito | Prontidão | Evidências |
|---|---|---|---:|---:|
${gapRows}

### Integridade e continuidade

O evento da questão de marco foi persistido de forma atômica antes deste relatório. Os contadores derivam do mapa versionado e o histórico de respostas permanece imutável. Ausência de evidência representa incerteza, não domínio ou fracasso.${input.type === "diagnostic_100" ? " O próximo plano de estudo é salvo em versão própria e referencia este mesmo mapa." : " A próxima rodada adapta a seleção a partir dessas evidências."}`;
}
