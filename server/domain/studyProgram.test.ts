import { describe, expect, it } from "vitest";
import { nextMatrixSlot, type AssessmentMatrixSlot } from "./assessmentMatrix";
import { canSelectStudyMode, diagnosticStatusAfterAnswer, nextModeAfterSelection, sessionCompletesAfterAnswer } from "./studyProgram";

const diagnosticMatrix = Array.from({ length: 100 }, (_, index) => ({
  slot: index + 1,
  matterId: (["CTA", "MET", "NAV", "TV", "REG"] as const)[Math.floor(index / 20)],
  chapterIds: [`C${index + 1}`],
  conceptIds: [`K${index + 1}`],
  kind: "chapter_baseline" as const,
})) satisfies AssessmentMatrixSlot[];

describe("integração determinística do programa de estudo", () => {
  it("bloqueia a escolha até a centésima resposta e a libera exatamente nessa transição", () => {
    let status = "active" as const;
    for (let slot = 1; slot < 100; slot += 1) {
      status = diagnosticStatusAfterAnswer({ currentStatus: status, mode: "diagnostic", matrixSlot: slot });
      expect(canSelectStudyMode(status)).toBe(false);
    }
    status = diagnosticStatusAfterAnswer({ currentStatus: status, mode: "diagnostic", matrixSlot: 100 });
    expect(status).toBe("mode_selection");
    expect(canSelectStudyMode(status)).toBe(true);
    expect(sessionCompletesAfterAnswer({ mode: "diagnostic", matrixSlot: 100 })).toBe(true);
  });

  it("retoma a matriz na primeira posição ainda não respondida", () => {
    const deliveredBeforePause = Array.from({ length: 47 }, (_, index) => index + 1);
    expect(nextMatrixSlot(diagnosticMatrix, deliveredBeforePause)?.slot).toBe(48);
    expect(nextMatrixSlot(diagnosticMatrix, Array.from({ length: 100 }, (_, index) => index + 1))).toBeNull();
  });

  it("permite Simulado e Tutor somente após o diagnóstico e conclui cada simulado em 100 posições", () => {
    expect(() => nextModeAfterSelection({ status: "active", mode: "tutor" })).toThrow("Conclua o diagnóstico");
    expect(nextModeAfterSelection({ status: "mode_selection", mode: "simulado" })).toEqual({ diagnosticStatus: "completed", selectedMode: "simulado" });
    expect(nextModeAfterSelection({ status: "mode_selection", mode: "tutor" })).toEqual({ diagnosticStatus: "completed", selectedMode: "tutor" });
    expect(sessionCompletesAfterAnswer({ mode: "simulado", matrixSlot: 100 })).toBe(true);
    expect(sessionCompletesAfterAnswer({ mode: "tutor", matrixSlot: 100 })).toBe(false);
  });
});
