import { describe, expect, it } from "vitest";

const sandboxToken = process.env.PAGBANK_SANDBOX_TOKEN;
const sandboxUrl = "https://sandbox.api.pagseguro.com/checkouts/CHEC_PPA_AUTH_PROBE";

describe("PagBank Sandbox", () => {
  it.skipIf(!sandboxToken)("aceita o token Sandbox em uma consulta sem efeito colateral", async () => {
    const response = await fetch(sandboxUrl, {
      headers: { Authorization: `Bearer ${sandboxToken}` },
    });

    expect(response.status, "o token não deve ser rejeitado pela API").not.toBe(401);
    expect(response.status, "o token não deve ser rejeitado pela API").not.toBe(403);
    expect(response.status, "a consulta de um checkout inexistente deve retornar resposta da API").toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(500);
  }, 20_000);
});
