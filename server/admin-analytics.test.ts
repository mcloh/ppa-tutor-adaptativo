import { describe, expect, it } from "vitest";
import { analyticsWindow, calculateEstimatedLlmCostCents, nullableAverage, nullablePercent, sanitizeOperationErrorCode } from "./domain/adminAnalytics";

describe("definições do console gerencial", () => {
  it("preserva nulo quando percentuais e médias não possuem denominador", () => {
    expect(nullablePercent(1, 0)).toBeNull();
    expect(nullablePercent(null, 10)).toBeNull();
    expect(nullableAverage(10, 0)).toBeNull();
    expect(nullableAverage(null, 2)).toBeNull();
  });

  it("calcula somente custo de LLM com regra explícita e uso conhecido", () => {
    expect(calculateEstimatedLlmCostCents({ promptTokens: 1_000_000, completionTokens: 500_000, inputCentsPerMillion: 25, outputCentsPerMillion: 100 })).toBe(75);
    expect(calculateEstimatedLlmCostCents({ promptTokens: null, completionTokens: 100, inputCentsPerMillion: 25, outputCentsPerMillion: 100 })).toBeNull();
  });

  it("normaliza janelas e códigos de erro sem conteúdo de exceção", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    expect(analyticsWindow("7d", now).start.toISOString()).toBe("2026-09-07T12:00:00.000Z");
    expect(sanitizeOperationErrorCode({ code: "bad code\nwith secret" })).toBe("bad_code_with_secret");
  });
});
