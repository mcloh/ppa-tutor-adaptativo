import { createHash, timingSafeEqual } from "node:crypto";

export const PAGBANK_SANDBOX_API_URL = "https://sandbox.api.pagseguro.com";
export const PAGBANK_PRODUCTION_API_URL = "https://api.pagseguro.com";

export type PagBankCheckoutProduct = {
  referenceId: string;
  productKey: string;
  name: string;
  credits: number;
  amountCents: number;
};

export type PagBankCheckoutPayload = {
  reference_id: string;
  expiration_date: string;
  customer_modifiable: true;
  items: Array<{ reference_id: string; name: string; description: string; quantity: 1; unit_amount: number }>;
  payment_methods: Array<{ type: "CREDIT_CARD" | "PIX" | "BOLETO" }>;
  redirect_url: string;
  return_url: string;
  notification_urls: string[];
  payment_notification_urls: string[];
};

export function buildPagBankCheckoutPayload(input: {
  product: PagBankCheckoutProduct;
  returnUrl: string;
  webhookUrl: string;
  paymentMethods?: PagBankCheckoutPayload["payment_methods"];
  now?: Date;
}): PagBankCheckoutPayload {
  const expiresAt = new Date((input.now ?? new Date()).getTime() + 2 * 60 * 60 * 1000).toISOString();
  return {
    reference_id: input.product.referenceId,
    expiration_date: expiresAt,
    customer_modifiable: true,
    items: [{
      reference_id: input.product.productKey,
      name: `PPA Teórico — ${input.product.name}`,
      description: `${input.product.credits} créditos pré-pagos para questões PPA`,
      quantity: 1,
      unit_amount: input.product.amountCents,
    }],
    payment_methods: input.paymentMethods ?? [{ type: "CREDIT_CARD" }, { type: "PIX" }, { type: "BOLETO" }],
    redirect_url: input.returnUrl,
    return_url: input.returnUrl,
    notification_urls: [input.webhookUrl],
    payment_notification_urls: [input.webhookUrl],
  };
}

export function extractPayUrl(response: unknown) {
  const value = response as { id?: unknown; links?: Array<{ rel?: unknown; href?: unknown }> };
  const checkoutId = typeof value.id === "string" ? value.id : null;
  const payUrlCandidate = value.links?.find(link => link.rel === "PAY" && typeof link.href === "string")?.href;
  const payUrl = typeof payUrlCandidate === "string" ? payUrlCandidate : null;
  if (!checkoutId || !payUrl || !payUrl.startsWith("https://")) throw new Error("O PagBank não retornou um checkout hospedado válido.");
  return { checkoutId, payUrl };
}

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

type PagBankFetch = typeof fetch;

export type PagBankSandboxOrderSnapshot = {
  externalOrderId: string;
  referenceId: string;
  itemReferenceId: string;
  amountCents: number;
  externalPaymentId: string | null;
  status: "waiting" | "in_analysis" | "paid" | "declined" | "canceled" | "expired" | "unknown";
  occurredAt: Date | null;
};

const statusMap: Record<string, PagBankSandboxOrderSnapshot["status"]> = {
  WAITING: "waiting", IN_ANALYSIS: "in_analysis", PAID: "paid", DECLINED: "declined", CANCELED: "canceled", EXPIRED: "expired",
};

function readPagBankOrderSnapshot(payload: unknown, requestedOrderId: string): PagBankSandboxOrderSnapshot {
  const value = payload as {
    id?: unknown;
    reference_id?: unknown;
    items?: Array<{ reference_id?: unknown; unit_amount?: unknown }>;
    charges?: Array<{ id?: unknown; status?: unknown; paid_at?: unknown; created_at?: unknown; amount?: { value?: unknown } }>;
  };
  if (value.id !== requestedOrderId || !requestedOrderId.startsWith("ORDE_")) throw new Error("O PagBank retornou um pedido diferente do solicitado.");
  if (typeof value.reference_id !== "string" || !value.reference_id) throw new Error("O PagBank não retornou a referência interna do pedido.");
  const item = value.items?.[0];
  if (!item || typeof item.reference_id !== "string" || typeof item.unit_amount !== "number") throw new Error("O PagBank retornou itens de pedido inválidos.");
  const charge = value.charges?.[0];
  const rawStatus = typeof charge?.status === "string" ? charge.status : "";
  const timestamp = typeof charge?.paid_at === "string" ? charge.paid_at : typeof charge?.created_at === "string" ? charge.created_at : "";
  const occurredAt = timestamp && !Number.isNaN(new Date(timestamp).getTime()) ? new Date(timestamp) : null;
  return {
    externalOrderId: requestedOrderId,
    referenceId: value.reference_id,
    itemReferenceId: item.reference_id,
    amountCents: typeof charge?.amount?.value === "number" ? charge.amount.value : item.unit_amount,
    externalPaymentId: typeof charge?.id === "string" ? charge.id : null,
    status: statusMap[rawStatus] ?? "unknown",
    occurredAt,
  };
}

/** Consulta autenticada usada para reconciliação quando o provedor omite uma assinatura confiável do webhook. */
export async function fetchPagBankOrder(input: { token: string; externalOrderId: string; apiUrl: string; fetchImpl?: PagBankFetch }) {
  if (!/^ORDE_[A-Za-z0-9-]+$/.test(input.externalOrderId)) throw new Error("Identificador externo de pedido inválido.");
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${input.apiUrl}/orders/${encodeURIComponent(input.externalOrderId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.token}`, Accept: "application/json" },
  });
  const rawBody = await response.text();
  if (!response.ok) throw new Error(`Não foi possível consultar o pedido PagBank (${response.status}).`);
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new Error("O PagBank retornou um pedido inválido.");
  }
  return { snapshot: readPagBankOrderSnapshot(payload, input.externalOrderId), rawBody };
}

/** Compatibilidade com o fluxo Sandbox já homologado. */
export async function fetchPagBankSandboxOrder(input: { token: string; externalOrderId: string; fetchImpl?: PagBankFetch }) {
  return fetchPagBankOrder({ ...input, apiUrl: PAGBANK_SANDBOX_API_URL });
}

export function verifyPagBankWebhookSignature(input: { token: string; rawBody: Buffer; signature: string | undefined }) {
  if (!input.signature || !/^[a-f0-9]{64}$/i.test(input.signature)) return false;
  const expected = Buffer.from(sha256(`${input.token}-${input.rawBody.toString("utf8")}`), "hex");
  const received = Buffer.from(input.signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Um evento não confiável só pode ser usado como gatilho para consultar, por TLS autenticado, um pedido PagBank explicitamente identificado. */
export function shouldReconcileUntrustedPagBankWebhook(input: { productOrigin: string | undefined; productId: string | undefined }) {
  return input.productOrigin?.toUpperCase() === "ORDER" && /^ORDE_[A-Za-z0-9-]+$/.test(input.productId ?? "");
}

/** Extrai somente um identificador ORDE_ como pista de roteamento. O payload não confiável jamais é usado como estado financeiro. */
export function extractUntrustedPagBankOrderId(input: { rawBody: Buffer; productOrigin: string | undefined; productId: string | undefined }) {
  if (shouldReconcileUntrustedPagBankWebhook(input)) return input.productId!;
  try {
    const parsed = JSON.parse(input.rawBody.toString("utf8")) as { id?: unknown; order?: { id?: unknown } };
    const candidate = typeof parsed.id === "string" ? parsed.id : typeof parsed.order?.id === "string" ? parsed.order.id : null;
    return candidate && /^ORDE_[A-Za-z0-9-]+$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export type PagBankWebhookData = {
  referenceId: string | null;
  externalPaymentId: string | null;
  externalEventId: string | null;
  status: "waiting" | "in_analysis" | "paid" | "declined" | "canceled" | "expired" | "unknown";
  occurredAt: Date | null;
};

export function parsePagBankWebhook(payload: unknown): PagBankWebhookData {
  const value = payload as { id?: unknown; reference_id?: unknown; status?: unknown; created_at?: unknown; charges?: Array<{ id?: unknown; status?: unknown; paid_at?: unknown; created_at?: unknown }> };
  const charge = value.charges?.[0];
  const rawStatus = typeof charge?.status === "string" ? charge.status : typeof value.status === "string" ? value.status : "";
  const timestamp = typeof charge?.paid_at === "string" ? charge.paid_at : typeof charge?.created_at === "string" ? charge.created_at : typeof value.created_at === "string" ? value.created_at : "";
  const occurredAt = timestamp && !Number.isNaN(new Date(timestamp).getTime()) ? new Date(timestamp) : null;
  return {
    referenceId: typeof value.reference_id === "string" ? value.reference_id : null,
    externalPaymentId: typeof charge?.id === "string" ? charge.id : typeof value.id === "string" ? value.id : null,
    externalEventId: typeof value.id === "string" ? value.id : null,
    status: statusMap[rawStatus] ?? "unknown",
    occurredAt,
  };
}
