import type { Request, Response } from "express";
import { processPagBankWebhook, reconcilePagBankProductionOrder, reconcilePagBankSandboxOrder } from "./db";
import { extractUntrustedPagBankOrderId, parsePagBankWebhook, sha256, verifyPagBankWebhookSignature } from "./domain/pagbankSandbox";

type WebhookDependencies = {
  token?: string;
  environment?: "sandbox" | "production";
  reconcile?: (input: { token: string; externalOrderId: string }) => ReturnType<typeof reconcilePagBankSandboxOrder>;
  process?: typeof processPagBankWebhook;
};

export function createPagBankSandboxWebhookHandler(dependencies: WebhookDependencies = {}) {
  return async function handlePagBankSandboxWebhook(req: Request, res: Response) {
    const environment = dependencies.environment ?? "sandbox";
    const token = dependencies.token ?? (environment === "production" ? process.env.PAGBANK_PRODUCTION_TOKEN : process.env.PAGBANK_SANDBOX_TOKEN);
    if (!token) return res.status(503).json({ received: false });
    const reconcile = dependencies.reconcile ?? (environment === "production" ? reconcilePagBankProductionOrder : reconcilePagBankSandboxOrder);
    const processWebhook = dependencies.process ?? processPagBankWebhook;
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const signature = req.header("x-authenticity-token") ?? undefined;

    if (!verifyPagBankWebhookSignature({ token, rawBody, signature })) {
      const productOrigin = req.header("x-product-origin") ?? undefined;
      const productId = req.header("x-product-id") ?? undefined;
      const externalOrderId = extractUntrustedPagBankOrderId({ rawBody, productOrigin, productId });
      console.warn("[PagBank] Webhook signature rejected", {
        hasSignature: Boolean(signature),
        signatureLength: signature?.length ?? 0,
        rawBodyLength: rawBody.length,
        contentType: req.header("content-type") ?? null,
        productOrigin: productOrigin?.toUpperCase() ?? null,
        hasProductOrderId: /^ORDE_[A-Za-z0-9-]+$/.test(productId ?? ""),
        recoveredOrderIdFromBody: Boolean(externalOrderId) && !/^ORDE_[A-Za-z0-9-]+$/.test(productId ?? ""),
      });
      if (!externalOrderId) {
        return res.status(202).json({ received: false, ignored: true, reason: "untrusted_event_without_order_identifier" });
      }
      try {
        const result = await reconcile({ token, externalOrderId });
        return res.status(202).json({ received: false, reconciled: true, idempotent: result.idempotent, signatureTrusted: false });
      } catch (error) {
        console.error("[PagBank] Authenticated order reconciliation failed", error instanceof Error ? error.message : "unknown");
        return res.status(503).json({ received: false, reconciled: false });
      }
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ received: false });
    }

    const event = parsePagBankWebhook(payload);
    const dedupeKey = `${environment}:${event.externalPaymentId ?? sha256(rawBody)}:${event.status}`;
    try {
      const result = await processWebhook({
        dedupeKey,
        payloadHash: sha256(rawBody),
        signatureHash: sha256(signature!),
        environment,
        ...event,
      });
      return res.status(200).json({ received: true, idempotent: result.idempotent, signatureTrusted: true });
    } catch (error) {
      console.error("[PagBank] Signed webhook processing failed", error);
      return res.status(500).json({ received: false });
    }
  };
}

export const handlePagBankSandboxWebhook = createPagBankSandboxWebhookHandler();
export const handlePagBankProductionWebhook = createPagBankSandboxWebhookHandler({ environment: "production" });
