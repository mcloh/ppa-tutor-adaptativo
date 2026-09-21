import { describe, expect, it } from "vitest";
import {
  buildTransactionalEnvelope,
  getSmtpConfiguration,
  isAccountPasswordEmailEnabled,
  isAutomaticEmailDispatchEnabled,
  renderAccountPasswordEmail,
  sendAuthorizedTransactionalTestEmail,
} from "./email";

const validEnvironment = {
  SMTP_HOST: "mail.example.test",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_CLIENT_NAME: "ppa.simulados.apia.app.br",
  SMTP_USER: "noreply@example.test",
  SMTP_PASSWORD: "test-only-password",
  EMAIL_FROM: "PPA Teórico <noreply@example.test>",
};

describe("configuração do e-mail transacional", () => {
  it("exige TLS implícito e preserva o remetente configurado", () => {
    expect(getSmtpConfiguration(validEnvironment)).toMatchObject({
      host: "mail.example.test",
      port: 465,
      secure: true,
      clientName: "ppa.simulados.apia.app.br",
      username: "noreply@example.test",
      from: "PPA Teórico <noreply@example.test>",
    });
  });

  it("rejeita configurações sem TLS implícito", () => {
    expect(() => getSmtpConfiguration({ ...validEnvironment, SMTP_PORT: "587" })).toThrow(
      "porta TLS implícita 465",
    );
    expect(() => getSmtpConfiguration({ ...validEnvironment, SMTP_SECURE: "false" })).toThrow(
      "SMTP_SECURE=true",
    );
  });

  it("exige um nome HELO/EHLO público em vez do fallback localhost", () => {
    expect(() => getSmtpConfiguration({ ...validEnvironment, SMTP_CLIENT_NAME: "127.0.0.1" })).toThrow(
      "hostname público plenamente qualificado",
    );
    expect(() => getSmtpConfiguration({ ...validEnvironment, SMTP_CLIENT_NAME: "host\r\nRCPT TO:<x@example.test>" })).toThrow(
      "não pode conter quebras de linha",
    );
  });

  it("alinha envelope, remetente autenticado e Message-ID ao domínio da caixa", () => {
    const configuration = getSmtpConfiguration(validEnvironment);
    const envelope = buildTransactionalEnvelope(configuration, "aluno@example.test", "password_reset");
    expect(envelope).toMatchObject({
      envelope: { from: "noreply@example.test", to: "aluno@example.test" },
      sender: "noreply@example.test",
      headers: { "X-PPA-Transactional": "password_reset", "X-Mailer": "PPA-Teorico" },
    });
    expect(envelope.messageId).toMatch(/^<ppa-[a-f0-9-]+@example\.test>$/);
  });

  it("rejeita um remetente visual que não corresponda à caixa SMTP autenticada", () => {
    expect(() => getSmtpConfiguration({ ...validEnvironment, EMAIL_FROM: "PPA <outra@example.test>" })).toThrow(
      "mesma caixa autenticada",
    );
  });

  it("mantém automações desativadas e limita o teste a destinatário autorizado", async () => {
    expect(isAutomaticEmailDispatchEnabled()).toBe(false);
    await expect(sendAuthorizedTransactionalTestEmail("outro@example.test", validEnvironment)).rejects.toThrow(
      "lista permitida",
    );
  });

  it("renderiza e-mails de acesso no padrão PPA com texto alternativo e sem conteúdo de estudo", () => {
    const message = renderAccountPasswordEmail({ purpose: "activation", temporaryPassword: "PPA7AbcdEFghJKLMNopq", applicationUrl: "https://ppa.simulados.apia.app.br/" });
    expect(isAccountPasswordEmailEnabled("activation")).toBe(true);
    expect(isAccountPasswordEmailEnabled("password_reset")).toBe(true);
    expect(message.subject).toContain("Ative seu acesso");
    expect(message.html).toContain("PPA TEÓRICO / ACESSO INDIVIDUAL");
    expect(message.html).toContain("#061847");
    expect(message.text).toContain("Senha temporária");
    expect(message.html).not.toContain("conceito");
  });
});
