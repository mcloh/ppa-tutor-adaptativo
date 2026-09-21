import { describe, expect, it } from "vitest";

const RUN_PIX_KEY_VALIDATION = process.env.RUN_PAGBANK_PIX_KEY_VALIDATION === "true";

describe("PagBank produção — chave Pix", () => {
  it("mantém a chave Pix exclusivamente no servidor e no formato UUID", () => {
    const pixKey = process.env.PAGBANK_PRODUCTION_PIX_KEY;
    expect(pixKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it.skipIf(!RUN_PIX_KEY_VALIDATION)("consulta a chave Pix por GET sem criar operação financeira", async () => {
    const pixKey = process.env.PAGBANK_PRODUCTION_PIX_KEY;
    const token = process.env.PAGBANK_PRODUCTION_TOKEN;
    expect(pixKey).toBeTruthy();
    expect(token).toBeTruthy();

    const response = await fetch(`https://api.pagseguro.com/pix/keys/${encodeURIComponent(pixKey!)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });

    // A consulta nunca cria recurso financeiro. O endpoint precisa reconhecer a chave
    // da própria conta, sem expor o corpo na saída de testes.
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
  }, 15_000);
});
