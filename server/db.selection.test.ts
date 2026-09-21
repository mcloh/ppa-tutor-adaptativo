import { describe, expect, it } from "vitest";
import { adaptiveSelectionWeight } from "./db";

describe("priorização adaptativa", () => {
  it("prioriza lacuna P1 sem evidência sobre conceito P4 forte", () => {
    const urgent = adaptiveSelectionWeight({ priority: "P1", gapScore: 8, recentIncidence: "recurrent", referenceQuestionCount: 0, progress: null });
    const maintained = adaptiveSelectionWeight({ priority: "P4", gapScore: 2, recentIncidence: "none", referenceQuestionCount: 12, progress: { questionsPresented: 6, confidence: 95, incorrect: 0, lastIndependentAnswerAt: new Date() } });
    expect(urgent).toBeGreaterThan(maintained);
  });

  it("eleva o peso de conceitos com baixa confiança e erros recentes", () => {
    const weaker = adaptiveSelectionWeight({ priority: "P2", gapScore: 5, recentIncidence: "occasional", referenceQuestionCount: 4, progress: { questionsPresented: 2, confidence: 12, incorrect: 2, lastIndependentAnswerAt: new Date() } });
    const stronger = adaptiveSelectionWeight({ priority: "P2", gapScore: 5, recentIncidence: "occasional", referenceQuestionCount: 4, progress: { questionsPresented: 2, confidence: 82, incorrect: 0, lastIndependentAnswerAt: new Date() } });
    expect(weaker).toBeGreaterThan(stronger);
  });
});
