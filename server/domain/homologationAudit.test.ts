import { describe, expect, it } from "vitest";
import { buildPagBankHomologationExport, sanitizeHomologationEvidence } from "./homologationAudit";

describe("evidência de homologação sanitizada", () => {
  it("remove credenciais, mascara dados pessoais e preserva o URL PAY literal no export restrito", () => {
    const evidence = sanitizeHomologationEvidence({
      id: "ORDE_TEST",
      authorization: "Bearer hidden-token",
      customer: { name: "Pessoa", email: "person@example.test", document: "00000000000" },
      payment: { card: { number: "4111111111111111", cvv: "123" } },
      links: [{ rel: "PAY", href: "https://sandbox.example.test/pay?token=private" }],
      metadata: { product: "essential", amount: 490 },
    });
    expect(evidence).toContain('"id":"ORDE_TEST"');
    expect(evidence).toContain('"product":"essential"');
    expect(evidence).toContain('"removed":true');
    expect(evidence).toContain('"email":"pe***@example.test"');
    expect(evidence).toContain("https://sandbox.example.test/pay?token=private");
    expect(evidence).not.toContain("hidden-token");
    expect(evidence).not.toContain("person@example.test");
    expect(evidence).not.toContain("4111111111111111");
    expect(evidence).not.toContain('"number":"4111111111111111"');
    expect(evidence).not.toContain('"cvv":"123"');
  });

  it("mantém o exportador estruturado e repete a política de remoção", () => {
    const output = buildPagBankHomologationExport([{
      id: "hml_test",
      orderId: "ord_internal_test",
      operation: "checkout_create",
      outcome: "succeeded",
      requestEvidenceJson: sanitizeHomologationEvidence({ reference_id: "ppa-1-example", customer: { email: "hidden@example.test" } }),
      responseEvidenceJson: sanitizeHomologationEvidence({ id: "ORDE_TEST", links: [{ href: "https://private.example.test" }] }),
      requestHash: "a".repeat(64),
      responseHash: "b".repeat(64),
      createdAt: new Date("2026-09-08T12:00:00.000Z"),
    }]);
    expect(output).toContain('"schema": "ppa-pagbank-homologation-evidence/v1"');
    expect(output).toContain("Evidência técnica integral por ciclo");
    expect(output).not.toContain("hidden@example.test");
    expect(output).toContain("https://private.example.test");
  });
});
