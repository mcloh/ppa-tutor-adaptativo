import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { users } from "../drizzle/schema";
import { createBillingOrder, createPasswordUser, exportHomologationAuditEvents, getDb, listHomologationAuditEvents, processPagBankWebhook, recordHomologationAuditEvent, recordSandboxCheckoutLifecycle } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const userIds: number[] = [];

afterEach(async () => {
  const db = await getDb();
  if (db) for (const id of userIds.splice(0)) await db.delete(users).where(eq(users.id, id));
});

function callerContext(user: NonNullable<TrpcContext["user"]>) {
  return { user, req: { headers: {}, header: () => undefined } as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;
}

describe("auditoria exclusiva de homologação", () => {
  it("registra, lista e exporta somente para o usuário de homologação", async () => {
    const homologation = await createPasswordUser({ openId: `hml_${nanoid(16)}`, name: "Homologação", email: `hml-${nanoid(12)}@example.test`, passwordHash: "not-used", loginMethod: "password", role: "homologation" });
    const admin = await createPasswordUser({ openId: `adm_${nanoid(16)}`, name: "Admin", email: `adm-${nanoid(12)}@example.test`, passwordHash: "not-used", loginMethod: "password", role: "admin" });
    userIds.push(homologation.id, admin.id);
    const eventId = await recordHomologationAuditEvent({ actorUserId: homologation.id, orderId: null, operation: "checkout_create", outcome: "succeeded", request: { authorization: "Bearer forbidden", reference_id: "ppa-test" }, response: { id: "ORDE_TEST", links: [{ href: "https://hidden.test" }] } });
    expect(eventId).toMatch(/^hml_/);
    const events = await listHomologationAuditEvents(homologation.id);
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty("requestEvidenceJson");
    const exported = await exportHomologationAuditEvents(homologation.id, [eventId!]);
    expect(exported).toContain("ppa-pagbank-homologation-evidence/v1");
    expect(exported).toContain("https://hidden.test");
    expect(exported).not.toContain("forbidden");
    await expect(appRouter.createCaller(callerContext(admin)).homologationAudit.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const listedForUi = await appRouter.createCaller(callerContext(homologation)).homologationAudit.list();
    expect(listedForUi).toHaveLength(1);
    expect(listedForUi[0]).not.toHaveProperty("requestEvidenceJson");
    expect(JSON.stringify(listedForUi)).not.toContain("https://hidden.test");

    const order = await createBillingOrder({ userId: homologation.id, productKey: "essential", idempotencyKey: `audit-webhook-${nanoid(12)}` });
    await recordSandboxCheckoutLifecycle({ userId: homologation.id, referenceId: order.order.referenceId, operation: "checkout_opened" });
    await recordSandboxCheckoutLifecycle({ userId: homologation.id, referenceId: order.order.referenceId, operation: "checkout_return" });
    await processPagBankWebhook({
      dedupeKey: `audit-webhook-${nanoid(12)}`,
      payloadHash: "a".repeat(64),
      signatureHash: "b".repeat(64),
      referenceId: order.order.referenceId,
      externalEventId: `ORDE_${nanoid(16)}`,
      externalPaymentId: `CHAR_${nanoid(16)}`,
      status: "waiting",
      occurredAt: new Date(),
    });
    const recorded = await listHomologationAuditEvents(homologation.id);
    expect(recorded.some(event => event.operation === "webhook_received")).toBe(true);
    expect(recorded.some(event => event.operation === "checkout_opened")).toBe(true);
    expect(recorded.some(event => event.operation === "checkout_return")).toBe(true);
    expect(recorded.some(event => event.operation === "credit_settlement")).toBe(true);
  }, 30_000);
});
