import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import {
  chooseMatrixQuestionCandidate,
  chooseQuestionCandidate,
  createPasswordUser,
  getDb,
  getOrCreateReadinessMap,
  getSelectedModeSession,
  getStudyProgramStatus,
  persistQuestion,
  recordAnswer,
  selectStudyMode,
  startDiagnosticSession,
} from "./db";
import type { AssessmentMatrixSlot } from "./domain/assessmentMatrix";

const createdEmails: string[] = [];

afterEach(async () => {
  const db = await getDb();
  if (db) {
    for (const email of createdEmails.splice(0)) {
      await db.delete(users).where(eq(users.email, email));
    }
  }
});

async function createIntegrationStudent(label: string) {
  const email = `integration-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  createdEmails.push(email);
  const student = await createPasswordUser({ openId: `integration_${label}_${Date.now()}`, name: `Integração ${label}`, email, passwordHash: "test-only-not-a-real-password", loginMethod: "password" });
  if (!student) throw new Error("Não foi possível criar estudante temporário.");
  await getOrCreateReadinessMap(student.id);
  return student;
}

async function completeDiagnostic(userId: number) {
  const started = await startDiagnosticSession(userId);
  if (!started.session) throw new Error("A sessão diagnóstica não foi criada.");
  const matrix = JSON.parse(started.program.diagnosticPlanJson) as AssessmentMatrixSlot[];
  for (const slot of matrix) {
    const questionId = await persistQuestion({
      userId,
      sessionId: started.session.id,
      questionNumber: slot.slot,
      conceptId: slot.conceptIds[0],
      conceptIds: slot.conceptIds,
      studyMode: "diagnostic",
      matrixSlot: slot.slot,
      action: "new",
      prompt: `Questão de integração ${slot.slot}`,
      optionA: "Alternativa correta",
      optionB: "Alternativa incorreta B",
      optionC: "Alternativa incorreta C",
      correctOption: "A",
      validationNote: "Teste de integração sem geração externa.",
    });
    await recordAnswer({ userId, questionId, answer: "A", feedbackMarkdown: "**correct:** retorno de teste." });
  }
  return { sessionId: started.session.id, matrix };
}

describe.runIf(Boolean(process.env.DATABASE_URL))("integração persistida do programa de estudo", () => {
  it("bloqueia a escolha antes do diagnóstico e a libera somente após 100 respostas", async () => {
    const student = await createIntegrationStudent("gate");
    await startDiagnosticSession(student.id);
    await expect(selectStudyMode({ userId: student.id, mode: "tutor" })).rejects.toThrow("Conclua o diagnóstico");

    await completeDiagnostic(student.id);
    const status = await getStudyProgramStatus(student.id);
    expect(status.diagnosticStatus).toBe("mode_selection");
    expect(status.diagnostic.completedQuestions).toBe(100);
  }, 90_000);

  it("executa entrega, resposta e retomada do simulado no mesmo programa", async () => {
    const student = await createIntegrationStudent("simulado");
    await completeDiagnostic(student.id);
    await selectStudyMode({ userId: student.id, mode: "simulado" });
    const first = await getSelectedModeSession(student.id);
    expect(first.session.mode).toBe("simulado");
    const matrix = JSON.parse(first.program.diagnosticPlanJson) as AssessmentMatrixSlot[];
    const candidate = await chooseMatrixQuestionCandidate({ userId: student.id, sessionId: first.session.id, matrix });
    expect(candidate?.slot.slot).toBe(1);
    const questionId = await persistQuestion({
      userId: student.id,
      sessionId: first.session.id,
      questionNumber: 1,
      conceptId: candidate!.concepts[0].id,
      conceptIds: candidate!.concepts.map(concept => concept.id),
      studyMode: "simulado",
      matrixSlot: 1,
      action: "new",
      prompt: "Questão de retomada de simulado",
      optionA: "Alternativa correta",
      optionB: "Alternativa incorreta B",
      optionC: "Alternativa incorreta C",
      correctOption: "A",
      validationNote: "Teste de retomada de simulado.",
    });
    await recordAnswer({ userId: student.id, questionId, answer: "A", feedbackMarkdown: "**correct:** retorno de teste." });
    const resumed = await getSelectedModeSession(student.id);
    const next = await chooseMatrixQuestionCandidate({ userId: student.id, sessionId: resumed.session.id, matrix });
    expect(resumed.session.id).toBe(first.session.id);
    expect(next?.slot.slot).toBe(2);
  }, 90_000);

  it("executa entrega, resposta e continuidade do modo Tutor após a escolha", async () => {
    const student = await createIntegrationStudent("tutor");
    await completeDiagnostic(student.id);
    await selectStudyMode({ userId: student.id, mode: "tutor" });
    const selected = await getSelectedModeSession(student.id);
    expect(selected.session.mode).toBe("tutor");
    const first = await chooseQuestionCandidate(student.id);
    const questionId = await persistQuestion({
      userId: student.id,
      sessionId: selected.session.id,
      questionNumber: 101,
      conceptId: first.concept.id,
      studyMode: "tutor",
      action: first.action,
      prompt: "Questão de continuidade do tutor",
      optionA: "Alternativa correta",
      optionB: "Alternativa incorreta B",
      optionC: "Alternativa incorreta C",
      correctOption: "A",
      validationNote: "Teste de continuidade do tutor.",
    });
    const recorded = await recordAnswer({ userId: student.id, questionId, answer: "A", feedbackMarkdown: "**correct:** retorno de teste." });
    const continued = await chooseQuestionCandidate(student.id);
    expect(recorded.idempotent).toBe(false);
    expect(continued).toMatchObject({ action: expect.any(String), concept: { id: expect.any(String) } });
  }, 90_000);
});
