import { describe, expect, it } from "vitest";
import { sendAuthorizedTransactionalTestEmail } from "./domain/email";

const runLiveDelivery = process.env.RUN_SMTP_LIVE_DELIVERY_TEST === "1";

describe.skipIf(!runLiveDelivery)("entrega SMTP transacional autorizada", () => {
  it("envia uma única mensagem de teste ao destinatário permitido", async () => {
    const result = await sendAuthorizedTransactionalTestEmail();
    expect(result.accepted).toBe("webmaster@apia.app.br");
    expect(result.messageId).toContain("@");
  }, 45_000);
});
