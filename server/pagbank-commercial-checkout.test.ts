import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildPagBankCheckoutPayload } from "./domain/pagbankSandbox";

describe("Checkout comercial PagBank de produção", () => {
  it("restringe o payload comercial a cartão, Pix e boleto, com retorno e webhook de produção", () => {
    const payload = buildPagBankCheckoutPayload({
      product: { referenceId: "ppa-42-commercialtest", productKey: "essential", name: "Essencial", credits: 100, amountCents: 490 },
      returnUrl: "https://ppa.simulados.apia.app.br/planos?checkout=production&ref=ppa-42-commercialtest",
      webhookUrl: "https://ppa.simulados.apia.app.br/api/webhooks/pagbank/production",
      paymentMethods: [{ type: "CREDIT_CARD" }, { type: "PIX" }, { type: "BOLETO" }],
    });

    expect(payload.payment_methods).toEqual([{ type: "CREDIT_CARD" }, { type: "PIX" }, { type: "BOLETO" }]);
    expect(payload.notification_urls).toEqual(["https://ppa.simulados.apia.app.br/api/webhooks/pagbank/production"]);
    expect(payload.redirect_url).toContain("checkout=production");
    expect(payload).not.toHaveProperty("customer");
  });

  it("mantém criação comercial protegida, sem token ou PAY no cliente", async () => {
    const [routerSource, plansSource] = await Promise.all([
      readFile(new URL("./routers.ts", import.meta.url), "utf8"),
      readFile(new URL("../client/src/pages/PlansPage.tsx", import.meta.url), "utf8"),
    ]);

    expect(routerSource).toContain("createProductionCheckout: protectedProcedure");
    expect(routerSource).toContain("productionCommercialCheckoutEnabled");
    expect(routerSource).toContain('environment: "production"');
    expect(routerSource).toContain('paymentMethods: [{ type: "CREDIT_CARD" }, { type: "PIX" }, { type: "BOLETO" }]');
    expect(plansSource).toContain("createProductionCheckout.useMutation");
    expect(plansSource).toContain("Comprar pacote");
    expect(plansSource).not.toContain("PAGBANK_PRODUCTION_TOKEN");
    expect(plansSource).not.toContain("Authorization:");
    expect(plansSource).not.toContain("Bearer ");
  });
});
