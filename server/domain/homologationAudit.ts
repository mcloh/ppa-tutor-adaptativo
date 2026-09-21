import { createHash } from "node:crypto";

const OMITTED = "[OMITTED_UNSTRUCTURED_CONTENT]";
const MAX_EVIDENCE_CHARS = 32_000;
const credentialKey = /^(authorization|token|access[_-]?token|secret|password|card[_-]?(number|security|cvv)|cvv|authorization_code|nsu|raw_data)$/i;
const partialMaskKey = /^(name|email|phone|tax_id|document|cpf|cnpj|address|street|number|complement|postal_code|zip|barcode|formatted_barcode|first_digits|last_digits|exp_month|exp_year|soft_descriptor)$/i;

export type HomologationAuditOperation =
  | "checkout_create"
  | "checkout_opened"
  | "checkout_return"
  | "order_reconcile"
  | "webhook_received"
  | "credit_settlement";
export type HomologationAuditOutcome = "started" | "succeeded" | "failed" | "ignored";

function removedValueSummary(key: string, value: unknown) {
  return {
    removed: true,
    field: key,
    type: Array.isArray(value) ? "array" : typeof value,
    keys: value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value as Record<string, unknown>).slice(0, 40) : undefined,
  };
}

function partialMask(value: string, key: string) {
  const compact = value.trim();
  if (!compact) return compact;
  if (key === "email") {
    const [local, domain] = compact.split("@");
    return domain ? `${local.slice(0, 2)}***@${domain}` : `${compact.slice(0, 2)}***`;
  }
  const digits = compact.replace(/\D/g, "");
  if (["phone", "tax_id", "document", "cpf", "cnpj", "barcode", "formatted_barcode", "first_digits", "last_digits", "number", "postal_code", "zip"].includes(key) && digits) {
    return `${digits.slice(0, 2)}${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-2)}`;
  }
  return `${compact.slice(0, 1)}${"*".repeat(Math.min(8, Math.max(3, compact.length - 2)))}${compact.slice(-1)}`;
}

function sanitize(value: unknown, key = ""): unknown {
  const normalizedKey = key.toLowerCase();
  if (credentialKey.test(normalizedKey)) return removedValueSummary(key, value);
  if (partialMaskKey.test(normalizedKey) && typeof value === "string") return partialMask(value, normalizedKey);
  if (typeof value === "string") return value.slice(0, MAX_EVIDENCE_CHARS);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 40).map(item => sanitize(item));
  if (typeof value !== "object") return OMITTED;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 80).map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey)]));
}

/** Converte JSON estruturado em evidência de homologação com URLs preservadas e dados sensíveis mascarados/removidos. */
export function sanitizeHomologationEvidence(value: unknown) {
  const structured = typeof value === "object" && value !== null ? sanitize(value) : OMITTED;
  const json = JSON.stringify(structured);
  if (json.length > MAX_EVIDENCE_CHARS) return JSON.stringify({ truncated: true, digest: createHash("sha256").update(json).digest("hex") });
  return json;
}

export function evidenceHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

type AuditExportEvent = { id: string; orderId: string | null; operation: HomologationAuditOperation; outcome: HomologationAuditOutcome; requestEvidenceJson: string; responseEvidenceJson: string; requestHash: string; responseHash: string; createdAt: Date };

export function buildPagBankHomologationExport(input: {
  environment: "sandbox" | "production";
  events: AuditExportEvent[];
} | AuditExportEvent[]) {
  const normalized = Array.isArray(input) ? { environment: "sandbox" as const, events: input } : input;
  return JSON.stringify({
    schema: "ppa-pagbank-homologation-evidence/v1",
    provider: "pagbank",
    environment: normalized.environment,
    generatedAt: new Date().toISOString(),
    notice: "Evidência técnica integral por ciclo destinada exclusivamente à homologação. URLs de checkout, inclusive PAY, são literais para reprodução do fluxo. Identidades e dados de cartão são mascarados parcialmente; tokens, credenciais, CVV e códigos de autorização são removidos.",
    events: normalized.events.map(event => ({
      id: event.id,
      cycleId: event.orderId,
      operation: event.operation,
      outcome: event.outcome,
      createdAt: event.createdAt.toISOString(),
      request: JSON.parse(event.requestEvidenceJson),
      response: JSON.parse(event.responseEvidenceJson),
      requestHash: event.requestHash,
      responseHash: event.responseHash,
    })),
  }, null, 2);
}
