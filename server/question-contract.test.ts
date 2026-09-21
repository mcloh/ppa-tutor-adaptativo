import { describe, expect, it } from "vitest";
import { toQuestionView } from "./routers";

describe("contrato público de questão", () => {
  it("entrega somente enunciado e alternativas para a camada visual", () => {
    const view = toQuestionView({
      id: "question_001",
      questionNumber: 12,
      prompt: "Qual alternativa é tecnicamente correta?",
      optionA: "Alternativa A",
      optionB: "Alternativa B",
      optionC: "Alternativa C",
    });
    expect(view).toEqual({
      id: "question_001",
      number: 12,
      studyMode: "tutor",
      prompt: "Qual alternativa é tecnicamente correta?",
      alternatives: [
        { key: "A", text: "Alternativa A" },
        { key: "B", text: "Alternativa B" },
        { key: "C", text: "Alternativa C" },
        { key: "ME_ENSINE", text: "Me ensine" },
      ],
    });
    expect(JSON.stringify(view)).not.toContain("correctOption");
    expect(JSON.stringify(view)).not.toContain("conceptIds");
    expect(JSON.stringify(view)).not.toContain("pedagogicalAction");
    expect(JSON.stringify(view)).not.toContain("matrixSlot");
    expect(JSON.stringify(view)).not.toMatch(/sourcePath|ragSource|chunkIds|checksum|cacheQuestion/i);
  });
});
