import { describe, expect, it } from "vitest";
import { buildPagBankCheckoutPayload, extractPayUrl, extractUntrustedPagBankOrderId, fetchPagBankSandboxOrder, parsePagBankWebhook, sha256, shouldReconcileUntrustedPagBankWebhook, verifyPagBankWebhookSignature } from "./pagbankSandbox";

describe("contrato PagBank Sandbox", () => {
  it("monta checkout hospedado com preço em centavos, retorno e notificações", () => {
    const payload = buildPagBankCheckoutPayload({
      product: { referenceId: "ppa-order-1", productKey: "essential", name: "Essencial", credits: 100, amountCents: 490 },
      returnUrl: "https://app.example/planos?checkout=sandbox",
      webhookUrl: "https://app.example/api/webhooks/pagbank/sandbox",
      now: new Date("2026-09-07T12:00:00.000Z"),
    });

    expect(payload.reference_id).toBe("ppa-order-1");
    expect(payload).not.toHaveProperty("customer");
    expect(payload.items).toEqual([expect.objectContaining({ reference_id: "essential", unit_amount: 490, quantity: 1 })]);
    expect(payload.payment_methods.map(method => method.type)).toEqual(["CREDIT_CARD", "PIX", "BOLETO"]);
    expect(payload.return_url).toBe("https://app.example/planos?checkout=sandbox");
    expect(payload.payment_notification_urls).toEqual(["https://app.example/api/webhooks/pagbank/sandbox"]);
    expect(payload.expiration_date).toBe("2026-09-07T14:00:00.000Z");
  });

  it("aceita somente a URL HTTPS identificada como PAY", () => {
    expect(extractPayUrl({ id: "CHEC_123", links: [{ rel: "PAY", href: "https://sandbox.pagbank.example/pay" }] })).toEqual({ checkoutId: "CHEC_123", payUrl: "https://sandbox.pagbank.example/pay" });
    expect(() => extractPayUrl({ id: "CHEC_123", links: [{ rel: "PAY", href: "http://invalid.example/pay" }] })).toThrow(/checkout hospedado válido/);
  });

  it("valida a assinatura SHA-256 do corpo bruto e rejeita qualquer alteração", () => {
    const token = "sandbox-token";
    const rawBody = Buffer.from('{"status":"PAID","reference_id":"ppa-1"}', "utf8");
    const signature = sha256(`${token}-${rawBody.toString("utf8")}`);

    expect(verifyPagBankWebhookSignature({ token, rawBody, signature })).toBe(true);
    expect(verifyPagBankWebhookSignature({ token, rawBody: Buffer.from('{ "status":"PAID","reference_id":"ppa-1" }', "utf8"), signature })).toBe(false);
    expect(verifyPagBankWebhookSignature({ token, rawBody, signature: "invalid" })).toBe(false);
  });

  it("só permite reconciliação de evento não confiável com identificador ORDER válido", () => {
    expect(shouldReconcileUntrustedPagBankWebhook({ productOrigin: "ORDER", productId: "ORDE_123-ABC" })).toBe(true);
    expect(shouldReconcileUntrustedPagBankWebhook({ productOrigin: "CHECKOUT", productId: "CHEC_123" })).toBe(false);
    expect(shouldReconcileUntrustedPagBankWebhook({ productOrigin: "ORDER", productId: "invalid" })).toBe(false);
  });

  it("usa o corpo não confiável somente como pista de um pedido quando o cabeçalho se perde", () => {
    const orderId = "ORDE_123-ABC";
    expect(extractUntrustedPagBankOrderId({ rawBody: Buffer.from(JSON.stringify({ id: orderId })), productOrigin: undefined, productId: undefined })).toBe(orderId);
    expect(extractUntrustedPagBankOrderId({ rawBody: Buffer.from(JSON.stringify({ order: { id: orderId } })), productOrigin: "CHECKOUT", productId: "CHEC_123" })).toBe(orderId);
    expect(extractUntrustedPagBankOrderId({ rawBody: Buffer.from('{"id":"invalid"}'), productOrigin: undefined, productId: undefined })).toBeNull();
  });

  it("mapeia pagamento compensado e preserva a referência interna", () => {
    expect(parsePagBankWebhook({ id: "CHEC_123", reference_id: "ppa-1", charges: [{ id: "CHAR_456", status: "PAID", paid_at: "2026-09-07T12:30:00.000Z" }] })).toEqual(expect.objectContaining({ referenceId: "ppa-1", externalPaymentId: "CHAR_456", externalEventId: "CHEC_123", status: "paid" }));
  });

  it("consulta e valida o pedido Sandbox por TLS autenticado antes de qualquer reconciliação", async () => {
    const orderId = "ORDE_123-ABC";
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`https://sandbox.api.pagseguro.com/orders/${orderId}`);
      expect(init?.headers).toMatchObject({ Authorization: "Bearer sandbox-token" });
      return new Response(JSON.stringify({
        id: orderId,
        reference_id: "ppa-1",
        items: [{ reference_id: "essential", unit_amount: 490 }],
        charges: [{ id: "CHAR_123", status: "PAID", paid_at: "2026-09-08T12:00:00.000Z", amount: { value: 490 } }],
      }), { status: 200 });
    }) as typeof fetch;
    const reconciled = await fetchPagBankSandboxOrder({ token: "sandbox-token", externalOrderId: orderId, fetchImpl });
    expect(reconciled.snapshot).toMatchObject({ externalOrderId: orderId, referenceId: "ppa-1", externalPaymentId: "CHAR_123", status: "paid", amountCents: 490 });
  });
});
