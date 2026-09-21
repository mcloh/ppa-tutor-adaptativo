export const analyticsPeriods = ["7d", "30d", "90d"] as const;
export type AnalyticsPeriod = (typeof analyticsPeriods)[number];

const periodDays: Record<AnalyticsPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const platformViews = ["study", "dashboard", "plans", "profile", "management"] as const;
export type PlatformView = (typeof platformViews)[number];

export function analyticsWindow(period: AnalyticsPeriod, now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - periodDays[period]);
  return { start, end, days: periodDays[period] };
}

export function nullablePercent(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (numerator === null || numerator === undefined || denominator === null || denominator === undefined || denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

export function nullableAverage(total: number | null | undefined, count: number | null | undefined) {
  if (total === null || total === undefined || count === null || count === undefined || count <= 0) return null;
  return Number((total / count).toFixed(2));
}

export function normalizedMetricNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function calculateEstimatedLlmCostCents(input: {
  promptTokens: number | null;
  completionTokens: number | null;
  inputCentsPerMillion: number;
  outputCentsPerMillion: number;
}) {
  if (input.promptTokens === null || input.completionTokens === null) return null;
  const total = (input.promptTokens * input.inputCentsPerMillion + input.completionTokens * input.outputCentsPerMillion) / 1_000_000;
  return Math.round(total);
}

export function sanitizeOperationErrorCode(error: unknown) {
  const candidate = typeof (error as { code?: unknown })?.code === "string"
    ? (error as { code: string }).code
    : error instanceof Error && error.name
      ? error.name
      : "operation_failed";
  return candidate.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64) || "operation_failed";
}

export function isPlatformView(value: string): value is PlatformView {
  return (platformViews as readonly string[]).includes(value);
}
