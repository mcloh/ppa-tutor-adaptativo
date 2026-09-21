import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { billingOrders, users } from "../drizzle/schema";
import { createBillingOrder, createPasswordUser, getBillingCheckoutReturnStatus, getCreditBalance, getDb, listCreditLedger, processPagBankWebhook, reconcilePagBankSandboxOrder } from "./db";
import { nanoid } from "nanoid";

const temporaryUserIds: number[] = [];

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  for (const userId of temporaryUserIds.splice(0)) await db.delete(users).where(eq(users.id, userId));
});

describe("webhook PagBank Sandbox", () => {
  it("confirma um pedido uma única vez e ignora a repetição idêntica", async () => {
    const user = await createPasswordUser({
      openId: `pagbank_webhook_${nanoid(16)}`,
      name: "Webhook Sandbox",
      email: `pagbank-webhook-${nanoid(12)}@test.invalid`,
      passwordHash: "not-used",
      loginMethod: "password",
    });
    temporaryUserIds.push(user.id);
    const created = await createBillingOrder({ userId: user.id, productKey: "essential", idempotencyKey: `webhook-order-${nanoid(16)}` });
    const event = {
      dedupeKey: `CHAR_${nanoid(16)}:paid`,
      payloadHash: "a".repeat(64),
      signatureHash: "b".repeat(64),
      referenceId: created.order.referenceId,
      externalEventId: `ORDE_${nanoid(16)}`,
      externalPaymentId: `CHAR_${nanoid(16)}`,
      status: "paid" as const,
      occurredAt: new Date(),
    };

    const first = await processPagBankWebhook(event);
    const repeated = await processPagBankWebhook(event);
    const balance = await getCreditBalance(user.id);
    const ledger = await listCreditLedger(user.id, 20);
    const returnStatus = await getBillingCheckoutReturnStatus(user.id, created.order.referenceId);
    const db = await getDb();
    const persistedOrder = db ? (await db.select({ externalOrderId: billingOrders.externalOrderId }).from(billingOrders).where(eq(billingOrders.id, created.order.id)).limit(1))[0] : null;

    expect(first).toMatchObject({ idempotent: false, credited: true, orderId: created.order.id });
    expect(repeated).toMatchObject({ idempotent: true, credited: false, orderId: created.order.id });
    expect(balance.availableCredits).toBe(200);
    expect(ledger.filter(entry => entry.entryType === "purchase_grant")).toHaveLength(1);
    expect(persistedOrder?.externalOrderId).toBe(event.externalEventId);
    expect(returnStatus).toMatchObject({ status: "paid", creditQuantity: 100, productKey: "essential" });
  }, 20_000);

  it("reconcilia um pedido Sandbox pago pela consulta autenticada, sem confiar no corpo do webhook", async () => {
    const user = await createPasswordUser({
      openId: `pagbank_reconcile_${nanoid(16)}`,
      name: "Reconciliação Sandbox",
      email: `pagbank-reconcile-${nanoid(12)}@test.invalid`,
      passwordHash: "not-used",
      loginMethod: "password",
    });
    temporaryUserIds.push(user.id);
    const created = await createBillingOrder({ userId: user.id, productKey: "essential", idempotencyKey: `reconcile-order-${nanoid(16)}` });
    const externalOrderId = `ORDE_${nanoid(16).replace(/_/g, "A")}`;
    const fetchImpl = (async () => new Response(JSON.stringify({
      id: externalOrderId,
      reference_id: created.order.referenceId,
      items: [{ reference_id: "essential", unit_amount: 490 }],
      charges: [{ id: `CHAR_${nanoid(16)}`, status: "PAID", paid_at: "2026-09-08T12:00:00.000Z", amount: { value: 490 } }],
    }), { status: 200 })) as typeof fetch;

    const first = await reconcilePagBankSandboxOrder({ token: "sandbox-token", externalOrderId, fetchImpl });
    const repeated = await reconcilePagBankSandboxOrder({ token: "sandbox-token", externalOrderId, fetchImpl });
    const balance = await getCreditBalance(user.id);
    const ledger = await listCreditLedger(user.id, 20);

    expect(first).toMatchObject({ idempotent: false, credited: true, orderId: created.order.id });
    expect(repeated).toMatchObject({ idempotent: true, credited: false, orderId: created.order.id });
    expect(balance.availableCredits).toBe(200);
    expect(ledger.filter(entry => entry.entryType === "purchase_grant")).toHaveLength(1);
  }, 20_000);

  it("rejeita a reconciliação quando o valor consultado diverge do pedido interno", async () => {
    const user = await createPasswordUser({
      openId: `pagbank_mismatch_${nanoid(16)}`,
      name: "Divergência Sandbox",
      email: `pagbank-mismatch-${nanoid(12)}@test.invalid`,
      passwordHash: "not-used",
      loginMethod: "password",
    });
    temporaryUserIds.push(user.id);
    const created = await createBillingOrder({ userId: user.id, productKey: "essential", idempotencyKey: `mismatch-order-${nanoid(16)}` });
    const externalOrderId = `ORDE_${nanoid(16).replace(/_/g, "A")}`;
    const fetchImpl = (async () => new Response(JSON.stringify({
      id: externalOrderId,
      reference_id: created.order.referenceId,
      items: [{ reference_id: "essential", unit_amount: 490 }],
      charges: [{ id: `CHAR_${nanoid(16)}`, status: "PAID", amount: { value: 999 } }],
    }), { status: 200 })) as typeof fetch;

    await expect(reconcilePagBankSandboxOrder({ token: "sandbox-token", externalOrderId, fetchImpl })).rejects.toThrow(/dados financeiros/);
    const balance = await getCreditBalance(user.id);
    const ledger = await listCreditLedger(user.id, 20);

    expect(balance.availableCredits).toBe(100);
    expect(ledger.filter(entry => entry.entryType === "purchase_grant")).toHaveLength(0);
  }, 20_000);
});
