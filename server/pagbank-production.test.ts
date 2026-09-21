import { describe, expect, it } from "vitest";

const productionToken = process.env.PAGBANK_PRODUCTION_TOKEN;
const productionAuthProbeEnabled = process.env.PAGBANK_ENABLE_PRODUCTION_AUTH_PROBE === "true";
const productionProbeUrl = "https://api.pagseguro.com/checkouts/CHEC_PPA_AUTH_PROBE";

describe("PagBank Produção", () => {
  it.skipIf(!productionToken || !productionAuthProbeEnabled)("aceita o token de produção em uma consulta somente leitura e sem efeito financeiro", async () => {
    const response = await fetch(productionProbeUrl, {
      headers: { Authorization: `Bearer ${productionToken}`, Accept: "application/json" },
    });

    expect(response.status, "o token de produção não deve ser rejeitado pela API").not.toBe(401);
    expect(response.status, "o token de produção não deve ser rejeitado pela API").not.toBe(403);
    expect(response.status, "a consulta de um checkout inexistente deve receber resposta da API").toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(500);
  }, 20_000);
});
