import { describe, expect, it } from "vitest";
import { questionSignature } from "./db";

describe("assinatura do cache pedagógico", () => {
  it("é estável para a mesma questão e muda quando o gabarito ou fonte mudam", () => {
    const base = { ragSourceChecksum: "fonte-v1", conceptId: "K1", prompt: "Qual é a força?", optionA: "A", optionB: "B", optionC: "C", correctOption: "A" as const };
    expect(questionSignature(base)).toBe(questionSignature({ ...base, prompt: "  qual é a força?  " }));
    expect(questionSignature(base)).not.toBe(questionSignature({ ...base, correctOption: "B" }));
    expect(questionSignature(base)).not.toBe(questionSignature({ ...base, ragSourceChecksum: "fonte-v2" }));
  });
});
