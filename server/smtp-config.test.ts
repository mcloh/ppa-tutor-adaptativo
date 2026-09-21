import { describe, it } from "vitest";
import { verifySmtpConfiguration } from "./domain/email";

describe("configuração SMTP transacional", () => {
  it.runIf(process.env.RUN_SMTP_LIVE === "1")("autentica em TLS sem enviar e-mail", async () => {
    await verifySmtpConfiguration();
  }, 45_000);
});
