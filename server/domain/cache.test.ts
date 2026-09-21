import { describe, expect, it } from "vitest";
import { canRetireCacheItem, isCacheReusable } from "./cache";

describe("governança do cache pedagógico", () => {
  it("não permite reutilizar item retirado", () => {
    expect(isCacheReusable("approved")).toBe(true);
    expect(isCacheReusable("retired")).toBe(false);
  });

  it("exige justificativa substantiva para retirada", () => {
    expect(canRetireCacheItem("approved", "Alternativas ambíguas na revisão técnica.")).toBe(true);
    expect(canRetireCacheItem("approved", "curta")).toBe(false);
    expect(canRetireCacheItem("retired", "Alternativas ambíguas na revisão técnica.")).toBe(false);
  });
});
