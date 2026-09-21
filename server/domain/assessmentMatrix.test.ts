import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_QUESTION_COUNT,
  ASSESSMENT_MATTERS,
  QUESTIONS_PER_MATTER,
  assessmentMatrixSummary,
  buildAssessmentMatrix,
  nextMatrixSlot,
  type MatrixConcept,
} from "./assessmentMatrix";

const chapterCounts = { CTA: 13, MET: 16, NAV: 12, TV: 10, REG: 21 } as const;

function sampleConcepts(): MatrixConcept[] {
  let index = 1;
  const concepts: MatrixConcept[] = [];
  for (const matterId of ASSESSMENT_MATTERS) {
    for (let chapter = 1; chapter <= chapterCounts[matterId]; chapter += 1) {
      const chapterId = `${matterId}-C${String(chapter).padStart(2, "0")}`;
      const specialId = chapterId === "REG-C07"
        ? "REG-C07-T01-K02"
        : chapterId === "REG-C08"
          ? "REG-C08-T01-K02"
          : `${chapterId}-T01-K01`;
      for (let variant = 0; variant < 3; variant += 1) {
        concepts.push({
          id: variant === 0 ? specialId : `${chapterId}-T01-K${String(variant + 1).padStart(2, "0")}`,
          canonicalIndex: index++,
          matterId,
          matterName: matterId,
          chapterId,
          chapterName: chapterId,
          topicId: `${chapterId}-T01`,
          topicName: "Tópico",
          name: `Conceito ${chapterId}-${variant + 1}`,
          priority: variant === 0 ? "P1" : "P2",
          gapScore: 6 - variant,
        });
      }
    }
  }
  return concepts;
}

describe("matriz diagnóstica e de simulado", () => {
  it("cria 100 posições com 20 por matéria e cobertura de todos os capítulos", () => {
    const matrix = buildAssessmentMatrix(sampleConcepts());
    const summary = assessmentMatrixSummary(matrix);
    expect(matrix).toHaveLength(ASSESSMENT_QUESTION_COUNT);
    expect(summary.chapterCoverageCount).toBe(72);
    expect(summary.matterCounts).toEqual({ CTA: QUESTIONS_PER_MATTER, MET: QUESTIONS_PER_MATTER, NAV: QUESTIONS_PER_MATTER, TV: QUESTIONS_PER_MATTER, REG: QUESTIONS_PER_MATTER });
    expect(new Set(matrix.flatMap(slot => slot.conceptIds)).size).toBe(101);
  });

  it("mantém somente a questão transversal escolhida entre Regras do Ar e VFR", () => {
    const matrix = buildAssessmentMatrix(sampleConcepts());
    const crossSlots = matrix.filter(slot => slot.kind === "cross_chapter");
    expect(crossSlots).toEqual([
      expect.objectContaining({
        matterId: "REG",
        chapterIds: ["REG-C07", "REG-C08"],
        conceptIds: ["REG-C07-T01-K02", "REG-C08-T01-K02"],
      }),
    ]);
  });

  it("retoma exatamente a próxima posição não entregue", () => {
    const matrix = buildAssessmentMatrix(sampleConcepts());
    expect(nextMatrixSlot(matrix, [])?.slot).toBe(1);
    expect(nextMatrixSlot(matrix, [1, 2, 3])?.slot).toBe(4);
    expect(nextMatrixSlot(matrix, matrix.map(slot => slot.slot))).toBeNull();
  });
});
