import { afterEach, describe, expect, it, vi } from "vitest";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  vi.resetModules();
});

describe("ativação comercial PagBank", () => {
  it("expõe a disponibilidade comercial no catálogo tRPC com a flag de produção habilitada", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ user: null } as never);
    const catalog = await caller.credits.catalog();

    expect(catalog.experimental.productionCommercialCheckoutAvailable).toBe(true);
  });
});
