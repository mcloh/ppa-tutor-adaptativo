import { describe, expect, it } from "vitest";
import { buildRagQuery, composeRagContext, tokenizeForRetrieval } from "./rag";

describe("recuperação RAG", () => {
  it("normaliza termos técnicos sem palavras funcionais", () => {
    expect(tokenizeForRetrieval("A sustentação da aeronave e o ângulo de ataque")).toEqual(expect.arrayContaining(["sustentacao", "aeronave", "angulo", "ataque"]));
    expect(tokenizeForRetrieval("A sustentação da aeronave e o ângulo de ataque")).not.toContain("da");
  });

  it("delimita o contexto e preserva a proveniência dos trechos", () => {
    const query = buildRagQuery([{ id: "K1", matterName: "Teoria de voo", chapterName: "Aerodinâmica", topicName: "Forças", name: "Sustentação" }]);
    const context = composeRagContext([{ id: "c1", sourcePath: "teoria/pagina-01.png", content: "Sustentação é a força aerodinâmica produzida pela asa." }]);
    expect(query).toContain("Sustentação");
    expect(context?.chunkIds).toEqual(["c1"]);
    expect(context?.context).toContain("origem: teoria/pagina-01.png");
  });
});
