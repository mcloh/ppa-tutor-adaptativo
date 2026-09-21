import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import nodemailer from "nodemailer";

/** O servidor cPanel pode demorar mais que 12 s em picos; o limite preserva falha controlada sem abortar autenticações legítimas. */
const SMTP_TIMEOUT_MS = 30_000;
const TEST_RECIPIENT = "webmaster@apia.app.br";
const MAILBOX_PATTERN = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;

export const EMAIL_AUTOMATIONS_ENABLED = false as const;

const ACCOUNT_EMAIL_AUTOMATIONS = {
  activation: true,
  password_reset: true,
} as const;

export type AccountPasswordEmailPurpose = keyof typeof ACCOUNT_EMAIL_AUTOMATIONS;

export type SmtpConfiguration = {
  host: string;
  port: number;
  secure: true;
  clientName: string;
  username: string;
  password: string;
  from: string;
};

type TransactionalMailKind = "account_activation" | "password_reset" | "smtp_test";

type EmailEnvironment = NodeJS.ProcessEnv;

function requiredEnvironmentValue(environment: EmailEnvironment, key: string) {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`A configuração SMTP ${key} é obrigatória.`);
  return value;
}

function extractMailboxAddress(value: string, label: string) {
  const match = value.match(/<([^<>]+)>$/);
  const mailbox = (match?.[1] ?? value).trim().toLowerCase();
  if (!MAILBOX_PATTERN.test(mailbox)) {
    throw new Error(`O endereço configurado em ${label} é inválido.`);
  }
  return mailbox;
}

function validateHeaderValue(value: string, label: string) {
  if (/\r|\n/.test(value)) {
    throw new Error(`${label} não pode conter quebras de linha.`);
  }
  return value;
}

function smtpClientName(value: string) {
  const normalized = validateHeaderValue(value.trim().toLowerCase(), "SMTP_CLIENT_NAME");
  const labels = normalized.split(".");
  const valid = isIP(normalized) === 0
    && normalized.length <= 253
    && labels.length >= 2
    && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  if (!valid) {
    throw new Error("SMTP_CLIENT_NAME deve ser um hostname público plenamente qualificado.");
  }
  return normalized;
}

export function getSmtpConfiguration(environment: EmailEnvironment = process.env): SmtpConfiguration {
  const host = requiredEnvironmentValue(environment, "SMTP_HOST");
  const clientName = smtpClientName(requiredEnvironmentValue(environment, "SMTP_CLIENT_NAME"));
  const username = extractMailboxAddress(requiredEnvironmentValue(environment, "SMTP_USER"), "SMTP_USER");
  const password = requiredEnvironmentValue(environment, "SMTP_PASSWORD");
  const from = validateHeaderValue(environment.EMAIL_FROM?.trim() || username, "O remetente");
  const fromMailbox = extractMailboxAddress(from, "EMAIL_FROM");
  if (fromMailbox !== username) {
    throw new Error("EMAIL_FROM deve usar a mesma caixa autenticada em SMTP_USER.");
  }
  const port = Number(requiredEnvironmentValue(environment, "SMTP_PORT"));

  if (!Number.isInteger(port) || port !== 465) {
    throw new Error("O SMTP transacional exige a porta TLS implícita 465.");
  }
  if (environment.SMTP_SECURE?.trim().toLowerCase() !== "true") {
    throw new Error("O SMTP transacional exige SMTP_SECURE=true.");
  }

  return { host, port, secure: true, clientName, username, password, from };
}

export function buildTransactionalEnvelope(
  configuration: SmtpConfiguration,
  recipient: string,
  kind: TransactionalMailKind,
) {
  const domain = configuration.username.split("@")[1];
  return {
    envelope: { from: configuration.username, to: recipient },
    sender: configuration.username,
    messageId: `<ppa-${randomUUID()}@${domain}>`,
    headers: {
      "X-PPA-Transactional": kind,
      "X-Mailer": "PPA-Teorico",
    },
  };
}

function createTransport(configuration: SmtpConfiguration) {
  return nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    name: configuration.clientName,
    auth: { user: configuration.username, pass: configuration.password },
    tls: { minVersion: "TLSv1.2", servername: configuration.host, rejectUnauthorized: true },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
}

export async function verifySmtpConfiguration(environment: EmailEnvironment = process.env) {
  const transport = createTransport(getSmtpConfiguration(environment));
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

export function isAutomaticEmailDispatchEnabled() {
  return EMAIL_AUTOMATIONS_ENABLED;
}

export function isAccountPasswordEmailEnabled(purpose: AccountPasswordEmailPurpose) {
  return ACCOUNT_EMAIL_AUTOMATIONS[purpose];
}

type AccountPasswordEmailInput = {
  recipient: string;
  temporaryPassword: string;
  purpose: AccountPasswordEmailPurpose;
  applicationUrl: string;
  environment?: EmailEnvironment;
};

function accountPasswordEmailCopy(purpose: AccountPasswordEmailPurpose) {
  return purpose === "activation"
    ? {
        subject: "Ative seu acesso — PPA Teórico",
        title: "Sua rota de estudo começa agora.",
        intro: "Recebemos o seu cadastro. Use a senha temporária abaixo para entrar e concluir a ativação da sua conta.",
        action: "Ativar e definir senha",
      }
    : {
        subject: "Redefinição de acesso — PPA Teórico",
        title: "Vamos restabelecer seu acesso.",
        intro: "Foi solicitada uma nova senha temporária para a sua conta. Use-a para entrar e definir uma nova senha segura.",
        action: "Entrar e redefinir senha",
      };
}

export function renderAccountPasswordEmail(input: Omit<AccountPasswordEmailInput, "recipient" | "environment">) {
  const copy = accountPasswordEmailCopy(input.purpose);
  const applicationUrl = new URL(input.applicationUrl);
  if (applicationUrl.protocol !== "https:") throw new Error("A mensagem de acesso exige URL HTTPS.");
  const password = validateHeaderValue(input.temporaryPassword, "A senha temporária");
  const text = [
    "PPA TEÓRICO — Tutor Adaptativo",
    "",
    copy.title,
    copy.intro,
    "",
    `Senha temporária: ${password}`,
    "Validade: 30 minutos.",
    "",
    `${copy.action}: ${applicationUrl.toString()}`,
    "",
    "Por segurança, a troca da senha temporária será obrigatória após o login. Se você não solicitou esta mensagem, desconsidere-a.",
  ].join("\n");
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#e7edf9;font-family:Arial,Helvetica,sans-serif;color:#071b4a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#e7edf9;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #b6c7e8"><tr><td style="padding:28px 34px;background:#061847;color:#ffffff;background-image:linear-gradient(90deg,rgba(68,180,255,.15) 1px,transparent 1px),linear-gradient(rgba(68,180,255,.12) 1px,transparent 1px);background-size:20px 20px"><p style="margin:0 0 12px;font:11px monospace;letter-spacing:2px;color:#9edcff">PPA TEÓRICO / ACESSO INDIVIDUAL</p><h1 style="margin:0;font-size:28px;line-height:1.2;color:#ffffff">${copy.title}</h1></td></tr><tr><td style="padding:32px 34px"><p style="margin:0 0 20px;font-size:16px;line-height:1.6">${copy.intro}</p><div style="margin:0 0 22px;padding:18px;background:#eff6ff;border-left:4px solid #1595d3"><p style="margin:0 0 8px;font:11px monospace;letter-spacing:1.2px;color:#386087">SENHA TEMPORÁRIA / VÁLIDA POR 30 MINUTOS</p><p style="margin:0;font:700 22px monospace;letter-spacing:2px;color:#061847">${password}</p></div><p style="margin:0 0 26px;font-size:14px;line-height:1.55;color:#395275">A troca desta senha por uma nova senha segura será obrigatória após o login.</p><a href="${applicationUrl.toString()}" style="display:inline-block;padding:14px 19px;background:#0d74b9;color:#ffffff;text-decoration:none;font:700 12px Arial,sans-serif;letter-spacing:1px;text-transform:uppercase">${copy.action} →</a></td></tr><tr><td style="padding:20px 34px;border-top:1px solid #d8e2f2"><p style="margin:0;font-size:12px;line-height:1.5;color:#617493">Se você não solicitou esta mensagem, desconsidere-a. Nenhum conteúdo de estudo ou dado de progresso foi incluído neste e-mail.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: copy.subject, text, html };
}

export async function sendAccountPasswordEmail({ recipient, temporaryPassword, purpose, applicationUrl, environment = process.env }: AccountPasswordEmailInput) {
  if (!isAccountPasswordEmailEnabled(purpose)) throw new Error("Este tipo de e-mail automático não está habilitado.");
  const normalizedRecipient = extractMailboxAddress(validateHeaderValue(recipient.trim(), "O destinatário"), "destinatário");
  const configuration = getSmtpConfiguration(environment);
  const message = renderAccountPasswordEmail({ temporaryPassword, purpose, applicationUrl });
  const transport = createTransport(configuration);
  try {
    const result = await transport.sendMail({
      from: configuration.from,
      to: normalizedRecipient,
      ...buildTransactionalEnvelope(configuration, normalizedRecipient, purpose === "activation" ? "account_activation" : "password_reset"),
      ...message,
    });
    const accepted = result.accepted.map(address => address.toLowerCase());
    if (!accepted.includes(normalizedRecipient) || result.rejected.length > 0) {
      throw new Error("O servidor SMTP não aceitou a entrega de acesso.");
    }
    return { messageId: result.messageId };
  } finally {
    transport.close();
  }
}

export async function sendAuthorizedTransactionalTestEmail(
  recipient: string = TEST_RECIPIENT,
  environment: EmailEnvironment = process.env,
) {
  const normalizedRecipient = extractMailboxAddress(validateHeaderValue(recipient.trim(), "O destinatário"), "destinatário");
  if (normalizedRecipient !== TEST_RECIPIENT) {
    throw new Error("O destinatário não integra a lista permitida para o teste SMTP autorizado.");
  }

  const configuration = getSmtpConfiguration(environment);
  const transport = createTransport(configuration);
  try {
    const result = await transport.sendMail({
      from: configuration.from,
      to: normalizedRecipient,
      ...buildTransactionalEnvelope(configuration, normalizedRecipient, "smtp_test"),
      subject: "Teste de e-mail transacional — PPA Teórico",
      text: "Esta é uma mensagem técnica de teste do serviço transacional do PPA Teórico. Nenhuma ação é necessária.",
    });

    const accepted = result.accepted.map(address => address.toLowerCase());
    if (!accepted.includes(normalizedRecipient) || result.rejected.length > 0) {
      throw new Error("O servidor SMTP não aceitou a entrega de teste.");
    }

    return { accepted: normalizedRecipient, messageId: result.messageId };
  } finally {
    transport.close();
  }
}
