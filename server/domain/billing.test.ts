import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import { BILLING_MODE, creditSummary, getPrepaidProduct, nextBalance, prepaidProducts, shouldEnableProductionCommercialCheckout, shouldEnableSandboxCheckout } from "./billing";

describe("domínio de créditos pré-pagos", () => {
  it("mantém no servidor o catálogo comercial aprovado", () => {
    expect(prepaidProducts.map(product => [product.key, product.credits, product.amountCents])).toEqual([
      ["essential", 100, 490],
      ["panoramic", 500, 1490],
      ["air_bridge", 1000, 2490],
      ["command", 3000, 4490],
    ]);
    expect(getPrepaidProduct("command")?.name).toBe("Comando");
    expect(getPrepaidProduct("manipulado")).toBeUndefined();
  });

  it("não permite que um débito reduza o saldo abaixo de zero", () => {
    expect(nextBalance(3, -1)).toBe(2);
    expect(() => nextBalance(0, -1)).toThrow("Saldo de créditos insuficiente.");
  });

  it("mantém créditos iniciais e deriva a política de consumo da habilitação comercial", () => {
    expect(BILLING_MODE).toMatchObject({ trialCredits: 100 });
    expect(process.env.PAGBANK_HOMOLOGATION_MODE).toBe("sandbox");
    expect(BILLING_MODE.checkoutEnabled).toBe(
      Boolean(process.env.PAGBANK_SANDBOX_TOKEN) && (
        process.env.NODE_ENV === "development" || process.env.PAGBANK_HOMOLOGATION_MODE === "sandbox"
      ),
    );
    expect(creditSummary({ availableCredits: 100, lifetimeGranted: 100, lifetimeConsumed: 0 })).toEqual({
      availableCredits: 100,
      lifetimeGranted: 100,
      lifetimeConsumed: 0,
      experimentalAccessActive: !BILLING_MODE.enforceStudyCredits,
      checkoutAvailable: BILLING_MODE.checkoutEnabled,
      productionCommercialCheckoutAvailable: BILLING_MODE.productionCommercialCheckoutEnabled,
    });
  });

  it("permite Sandbox publicado apenas com chave explícita e credencial Sandbox", () => {
    expect(shouldEnableSandboxCheckout({ NODE_ENV: "production", PAGBANK_SANDBOX_TOKEN: "test-token" })).toBe(false);
    expect(shouldEnableSandboxCheckout({ NODE_ENV: "production", PAGBANK_HOMOLOGATION_MODE: "sandbox" })).toBe(false);
    expect(shouldEnableSandboxCheckout({ NODE_ENV: "production", PAGBANK_HOMOLOGATION_MODE: "sandbox", PAGBANK_SANDBOX_TOKEN: "test-token" })).toBe(true);
    expect(shouldEnableSandboxCheckout({ NODE_ENV: "production", PAGBANK_HOMOLOGATION_MODE: "production", PAGBANK_SANDBOX_TOKEN: "test-token" })).toBe(false);
  });

  it("restringe checkout comercial ao runtime de produção com token e habilitação explícita", () => {
    expect(shouldEnableProductionCommercialCheckout({ NODE_ENV: "development", PAGBANK_PRODUCTION_TOKEN: "token", PAGBANK_PRODUCTION_COMMERCIAL_MODE: "enabled" })).toBe(false);
    expect(shouldEnableProductionCommercialCheckout({ NODE_ENV: "production", PAGBANK_PRODUCTION_COMMERCIAL_MODE: "enabled" })).toBe(false);
    expect(shouldEnableProductionCommercialCheckout({ NODE_ENV: "production", PAGBANK_PRODUCTION_TOKEN: "token", PAGBANK_PRODUCTION_COMMERCIAL_MODE: "disabled" })).toBe(false);
    expect(shouldEnableProductionCommercialCheckout({ NODE_ENV: "production", PAGBANK_PRODUCTION_TOKEN: "token", PAGBANK_PRODUCTION_COMMERCIAL_MODE: "enabled" })).toBe(true);
  });

  it("permite catálogo público, mas exige autenticação para saldo e histórico", async () => {
    const caller = appRouter.createCaller({ user: null } as any);
    const catalog = await caller.credits.catalog();
    expect(catalog.experimental).toMatchObject({ initialCredits: 100, checkoutAvailable: BILLING_MODE.checkoutEnabled });
    expect(catalog.products.some(product => product.key === "essential" && product.amountCents === 490)).toBe(true);
    expect(catalog.products.some(product => product.key === "command" && product.amountCents === 4490)).toBe(true);
    await expect(caller.credits.summary()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.credits.createSandboxCheckout({ productKey: "essential", idempotencyKey: "visitor-checkout-blocked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.credits.createProductionCheckout({ productKey: "essential", idempotencyKey: "visitor-production-checkout-blocked" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const studentCaller = appRouter.createCaller({ user: { id: 42, name: "Aluno", email: "aluno@example.test", role: "user" } } as any);
    await expect(studentCaller.credits.createSandboxCheckout({ productKey: "essential", idempotencyKey: "student-checkout-blocked" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const adminCaller = appRouter.createCaller({ user: { id: 43, name: "Administrador", email: "admin@example.test", role: "admin" } } as any);
    await expect(adminCaller.credits.createSandboxCheckout({ productKey: "essential", idempotencyKey: "admin-checkout-blocked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reserva o checkout Sandbox ao papel de homologação e preserva os guards administrativos", async () => {
    const [routerSource, trpcSource, plansSource] = await Promise.all([
      readFile(new URL("../routers.ts", import.meta.url), "utf8"),
      readFile(new URL("../_core/trpc.ts", import.meta.url), "utf8"),
      readFile(new URL("../../client/src/pages/PlansPage.tsx", import.meta.url), "utf8"),
    ]);

    expect(routerSource).toContain("createSandboxCheckout: homologationProcedure");
    expect(routerSource).toContain("createProductionCheckout: protectedProcedure");
    expect(routerSource).toContain('paymentMethods: [{ type: "CREDIT_CARD" }, { type: "PIX" }, { type: "BOLETO" }]');
    expect(routerSource).toContain("cacheAdmin: router({");
    expect(routerSource).toContain("metrics: adminProcedure.query");
    expect(trpcSource).toContain("ctx.user.role !== 'homologation'");
    expect(plansSource).toContain('user?.role === "homologation"');
  });

  it("mantém lançamentos imutáveis, isolados e idempotentes no repositório", async () => {
    const dbSource = await readFile(new URL("../db.ts", import.meta.url), "utf8");
    expect(dbSource).toContain('eq(creditLedger.referenceType, "trial")');
    expect(dbSource).toContain('eq(creditLedger.referenceType, "study_question")');
    expect(dbSource).toContain('idempotencyKey: `trial-initial:${userId}`');
    expect(dbSource).toContain('idempotencyKey: `study-question:${input.questionId}`');
    expect(dbSource).toContain('eq(billingOrders.userId, input.userId)');
    expect(dbSource).toContain("await db.transaction(async tx => {");
    expect(dbSource).toContain("await debitCreditInTransaction(tx");
    expect(dbSource).not.toContain("update(creditLedger)");
    expect(dbSource).not.toContain("delete(creditLedger)");
  });
});
