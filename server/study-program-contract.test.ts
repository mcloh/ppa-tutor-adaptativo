import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const serverSource = (file: string) => readFile(new URL(`./${file}`, import.meta.url), "utf8");

describe("contrato do programa diagnóstico", () => {
  it("isola programas, sessões e posições de matriz pelo usuário", async () => {
    const db = await serverSource("db.ts");
    expect(db).toContain('eq(studentStudyPrograms.userId, userId)');
    expect(db).toContain('eq(studyQuestions.userId, input.userId)');
    expect(db).toContain('eq(studySessions.programId, input.programId)');
    expect(db).toContain('eq(studyQuestions.studyMode, "diagnostic")');
  });

  it("libera escolha somente após a posição 100 diagnóstica e conclui a sessão", async () => {
    const db = await serverSource("db.ts");
    expect(db).toContain('diagnosticStatusAfterAnswer({ currentStatus: "active", mode: record.session.mode, matrixSlot: record.question.matrixSlot }) === "mode_selection"');
    expect(db).toContain('diagnosticStatus: "mode_selection"');
    expect(db).toContain('status: "completed" as const');
    expect(db).toContain('Conclua o diagnóstico antes de escolher uma modalidade.');
  });

  it("mantém a escolha de modalidade em procedimento protegido e sem matriz no payload", async () => {
    const router = await serverSource("routers.ts");
    expect(router).toContain('program: protectedProcedure.query');
    expect(router).toContain('selectMode: protectedProcedure');
    expect(router).toContain('z.enum(["simulado", "tutor"])');
    expect(router).toContain('classification: publicClassification(result.classification)');
  });
});
