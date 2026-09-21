import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { createPagBankSandboxWebhookHandler } from "./pagbankWebhook";
import { sha256 } from "./domain/pagbankSandbox";

function webhookRequest(headers: Record<string, string | undefined>) {
  return {
    body: Buffer.from('{"untrusted":true}', "utf8"),
    header: (name: string) => headers[name.toLowerCase()] ?? headers[name],
  } as unknown as Request;
}

function responseSpy() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  vi.mocked(response.status).mockReturnValue(response);
  return response;
}

describe("doutrina PagBank de dupla verificação", () => {
  it("reconcilia no provedor o evento sem assinatura quando há ORDER válido", async () => {
    const reconcile = vi.fn().mockResolvedValue({ idempotent: false, credited: true, orderId: "ord_1" });
    const handler = createPagBankSandboxWebhookHandler({ token: "sandbox-token", reconcile });
    const response = responseSpy();

    await handler(webhookRequest({ "x-product-origin": "ORDER", "x-product-id": "ORDE_123-ABC" }), response);

    expect(reconcile).toHaveBeenCalledWith({ token: "sandbox-token", externalOrderId: "ORDE_123-ABC" });
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ reconciled: true, signatureTrusted: false }));
  });

  it("não processa nem consulta um evento sem assinatura e sem ORDER válido", async () => {
    const reconcile = vi.fn();
    const handler = createPagBankSandboxWebhookHandler({ token: "sandbox-token", reconcile });
    const response = responseSpy();

    await handler(webhookRequest({ "x-product-origin": "CHECKOUT", "x-product-id": "CHEC_123" }), response);

    expect(reconcile).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ ignored: true }));
  });

  it("recupera o ORDE_ do corpo não confiável apenas para disparar a consulta autenticada", async () => {
    const reconcile = vi.fn().mockResolvedValue({ idempotent: false, credited: true, orderId: "ord_1" });
    const handler = createPagBankSandboxWebhookHandler({ token: "sandbox-token", reconcile });
    const response = responseSpy();
    const request = {
      body: Buffer.from('{"id":"ORDE_123-ABC"}', "utf8"),
      header: () => undefined,
    } as unknown as Request;

    await handler(request, response);

    expect(reconcile).toHaveBeenCalledWith({ token: "sandbox-token", externalOrderId: "ORDE_123-ABC" });
    expect(response.status).toHaveBeenCalledWith(202);
  });

  it("processa diretamente a notificação que possui assinatura válida", async () => {
    const rawBody = Buffer.from('{"id":"ORDE_123-ABC","reference_id":"ppa-1","charges":[{"id":"CHAR_123","status":"PAID","paid_at":"2026-09-08T12:00:00.000Z"}]}', "utf8");
    const token = "sandbox-token";
    const process = vi.fn().mockResolvedValue({ idempotent: false, credited: true, orderId: "ord_1" });
    const reconcile = vi.fn();
    const handler = createPagBankSandboxWebhookHandler({ token, process, reconcile });
    const response = responseSpy();
    const request = {
      body: rawBody,
      header: (name: string) => name === "x-authenticity-token" ? sha256(`${token}-${rawBody.toString("utf8")}`) : undefined,
    } as unknown as Request;

    await handler(request, response);

    expect(reconcile).not.toHaveBeenCalled();
    expect(process).toHaveBeenCalledWith(expect.objectContaining({ referenceId: "ppa-1", externalEventId: "ORDE_123-ABC", externalPaymentId: "CHAR_123", status: "paid" }));
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ signatureTrusted: true }));
  });

  it("delimita a notificação de produção e a dupla verificação ao ambiente de produção", async () => {
    const reconcile = vi.fn().mockResolvedValue({ idempotent: false, credited: false, orderId: "ord_production" });
    const process = vi.fn().mockResolvedValue({ idempotent: false, credited: false, orderId: "ord_production" });
    const handler = createPagBankSandboxWebhookHandler({ token: "production-token", environment: "production", reconcile, process });
    const response = responseSpy();

    await handler(webhookRequest({ "x-product-origin": "ORDER", "x-product-id": "ORDE_PRODUCTION-123" }), response);

    expect(reconcile).toHaveBeenCalledWith({ token: "production-token", externalOrderId: "ORDE_PRODUCTION-123" });
    expect(process).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(202);
  });
});
