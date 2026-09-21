export const CACHE_WARMUP_TARGET_PER_CONCEPT = 4;

export function missingCacheItems(approvedCount: number, target = CACHE_WARMUP_TARGET_PER_CONCEPT) {
  return Math.max(0, target - Math.max(0, approvedCount));
}

export function warmupRoundPlan(conceptCount: number, target = CACHE_WARMUP_TARGET_PER_CONCEPT) {
  if (!Number.isInteger(conceptCount) || conceptCount < 1) throw new Error("A cobertura requer ao menos um conceito.");
  if (!Number.isInteger(target) || target < 1) throw new Error("A meta por conceito deve ser positiva.");
  return Array.from({ length: target }, (_, index) => ({ round: index + 1, plannedItems: conceptCount }));
}

export function isWarmupComplete(approvedCount: number, target = CACHE_WARMUP_TARGET_PER_CONCEPT) {
  return missingCacheItems(approvedCount, target) === 0;
}
