import { describe, expect, it } from "vitest";
import { shouldEnableProductionHomologationCheckout } from "./domain/billing";
import { buildPagBankCheckoutPayload, extractPayUrl, PAGBANK_PRODUCTION_API_URL } from "./domain/pagbankSandbox";

describe("Checkout PagBank de produção para homologação", () => {
  it("permanece desativado após o encerramento do ciclo técnico", () => {
    expect(shouldEnableProductionHomologationCheckout()).toBe(false);
  });

  it("permanece desativado sem chave explícita, mesmo com token configurado", () => {
    expect(shouldEnableProductionHomologationCheckout({ PAGBANK_PRODUCTION_TOKEN: "token" } as NodeJS.ProcessEnv)).toBe(false);
    expect(shouldEnableProductionHomologationCheckout({ PAGBANK_PRODUCTION_HOMOLOGATION_MODE: "enabled" } as NodeJS.ProcessEnv)).toBe(false);
    expect(shouldEnableProductionHomologationCheckout({ PAGBANK_PRODUCTION_TOKEN: "token", PAGBANK_PRODUCTION_HOMOLOGATION_MODE: "enabled" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("monta um checkout de produção por cartão com retorno e webhook próprios", () => {
    const payload = buildPagBankCheckoutPayload({
      product: { referenceId: "ppa-9-productionref000", productKey: "essential", name: "Essencial", credits: 100, amountCents: 490 },
      returnUrl: "https://ppa.simulados.apia.app.br/planos?checkout=production&ref=ppa-9-productionref000",
      webhookUrl: "https://ppa.simulados.apia.app.br/api/webhooks/pagbank/production",
      paymentMethods: [{ type: "CREDIT_CARD" }],
      now: new Date("2026-09-16T12:00:00.000Z"),
    });

    expect(PAGBANK_PRODUCTION_API_URL).toBe("https://api.pagseguro.com");
    expect(payload.payment_methods).toEqual([{ type: "CREDIT_CARD" }]);
    expect(payload.redirect_url).toContain("checkout=production");
    expect(payload.notification_urls).toEqual(["https://ppa.simulados.apia.app.br/api/webhooks/pagbank/production"]);
    expect(payload).not.toHaveProperty("customer");
  });

  it("aceita somente um PAY HTTPS devolvido pelo PagBank", () => {
    expect(extractPayUrl({ id: "CHEC_PRODUCTION", links: [{ rel: "PAY", href: "https://pagamento.pagbank.com.br/pagamento?code=production" }] })).toEqual({ checkoutId: "CHEC_PRODUCTION", payUrl: "https://pagamento.pagbank.com.br/pagamento?code=production" });
  });
});
