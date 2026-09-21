import { describe, expect, it } from "vitest";
import { assertNoRagLeakage, buildAssessmentFallback } from "./tutorLlm";

describe("proteção de saída RAG", () => {
  const source = "[Trecho técnico 1; origem: meteorologia/pagina-02.png]\nA visibilidade horizontal é a maior distância em que um objeto pode ser visto e identificado contra o horizonte durante condições atmosféricas específicas.";

  it("aceita explicação parafraseada sem proveniência interna", () => {
    expect(() => assertNoRagLeakage("**correct:** A alternativa B descreve adequadamente como as condições atmosféricas podem limitar o alcance visual.", source)).not.toThrow();
  });

  it("bloqueia caminho, marcador e reprodução literal de material RAG", () => {
    expect(() => assertNoRagLeakage("Consulte a origem: meteorologia/pagina-02.png", source)).toThrow(/metadado interno/);
    expect(() => assertNoRagLeakage("A visibilidade horizontal é a maior distância em que um objeto pode ser visto e identificado contra o horizonte durante condições atmosféricas específicas.", source)).toThrow(/trecho literal/);
  });

  it("bloqueia referências diretas e indiretas à fonte EAD", () => {
    const prohibited = [
      "Segundo o material EAD, a alternativa B está correta.",
      "Conforme o conteúdo fornecido, revise este ponto.",
      "Neste módulo, você estudou a visibilidade horizontal.",
      "A apostila apresenta esta orientação.",
      "De acordo com o material, a resposta é B.",
      "Segundo a rotina adotada nos materiais de estudo, a resposta é B.",
      "O material do curso apresenta esta regra de navegação.",
    ];
    prohibited.forEach(text => expect(() => assertNoRagLeakage(text, source)).toThrow(/metadado interno/));
  });

  it("fornece avaliação e plano determinísticos seguros se a geração externa falhar", () => {
    const fallback = buildAssessmentFallback({
      type: "diagnostic_100",
      context: { gaps: [{ matterName: "Meteorologia Aeronáutica", name: "visibilidade horizontal" }] },
    });
    expect(fallback.assessmentMarkdown).toContain("Avaliação de progresso");
    expect(fallback.studyPlanMarkdown.length).toBeGreaterThanOrEqual(80);
    expect(() => assertNoRagLeakage(`${fallback.assessmentMarkdown}\n${fallback.studyPlanMarkdown}`, "")).not.toThrow();
  });
});
