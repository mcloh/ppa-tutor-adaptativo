import { describe, expect, it } from "vitest";
import { CACHE_WARMUP_TARGET_PER_CONCEPT, isWarmupComplete, missingCacheItems, warmupRoundPlan } from "./cacheWarmup";

describe("plano de aquecimento do cache", () => {
  it("planeja quatro rodadas completas para todos os conceitos", () => {
    const plan = warmupRoundPlan(872);
    expect(plan).toHaveLength(CACHE_WARMUP_TARGET_PER_CONCEPT);
    expect(plan.reduce((total, wave) => total + wave.plannedItems, 0)).toBe(3488);
    expect(plan.map(wave => wave.round)).toEqual([1, 2, 3, 4]);
  });

  it("mantém o alvo mínimo de quatro itens por conceito de forma idempotente", () => {
    expect(missingCacheItems(0)).toBe(4);
    expect(missingCacheItems(3)).toBe(1);
    expect(missingCacheItems(4)).toBe(0);
    expect(missingCacheItems(9)).toBe(0);
    expect(isWarmupComplete(4)).toBe(true);
  });
});
