import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authPasswordDeliveries, authSessions, users } from "../drizzle/schema";
import { createPasswordUser, getDb, getUserByEmail } from "./db";
import { hashPassword, verifyPassword } from "./domain/password";
import type { TrpcContext } from "./_core/context";

const emailMock = vi.hoisted(() => ({ sendAccountPasswordEmail: vi.fn().mockResolvedValue({ messageId: "test@example.test" }) }));
vi.mock("./domain/email", async importOriginal => ({ ...(await importOriginal<typeof import("./domain/email")>()), sendAccountPasswordEmail: emailMock.sendAccountPasswordEmail }));

const { appRouter } = await import("./routers");
const temporaryUserIds: number[] = [];

afterEach(async () => {
  const db = await getDb();
  if (db) for (const id of temporaryUserIds.splice(0)) await db.delete(users).where(eq(users.id, id));
  emailMock.sendAccountPasswordEmail.mockClear();
});

function context(user: TrpcContext["user"] = null) {
  const cookies: Array<{ name: string; value: string }> = [];
  return {
    ctx: {
      user,
      req: {
        ip: "127.0.0.1",
        headers: { host: "ppa.simulados.apia.app.br" },
        header: (name: string) => name.toLowerCase() === "origin" ? "https://ppa.simulados.apia.app.br" : undefined,
      } as TrpcContext["req"],
      res: {
        cookie: (name: string, value: string) => cookies.push({ name, value }),
        clearCookie: vi.fn(),
      } as TrpcContext["res"],
    } satisfies TrpcContext,
    cookies,
  };
}

describe("ativação e recuperação por senha temporária", () => {
  it("cria conta por e-mail, exige troca e bloqueia o estudo até a nova senha", async () => {
    const email = `activation-${nanoid(14)}@example.test`;
    const anonymous = context();
    const registered = await appRouter.createCaller(anonymous.ctx).auth.register({ email });
    expect(registered).toEqual({ activationSent: true });
    expect(emailMock.sendAccountPasswordEmail).toHaveBeenCalledOnce();
    expect(emailMock.sendAccountPasswordEmail).toHaveBeenCalledWith(expect.objectContaining({ recipient: email.toLowerCase(), purpose: "activation", applicationUrl: "https://ppa.simulados.apia.app.br/" }));

    const pending = await getUserByEmail(email);
    if (!pending) throw new Error("Conta de teste não criada.");
    temporaryUserIds.push(pending.id);
    expect(pending.passwordChangeRequired).toBe(true);
    expect(pending.temporaryPasswordExpiresAt).toBeTruthy();
    const temporaryPassword = emailMock.sendAccountPasswordEmail.mock.calls[0]?.[0].temporaryPassword as string;
    expect(await verifyPassword(temporaryPassword, pending.passwordHash)).toBe(true);

    const loginContext = context();
    const loginResult = await appRouter.createCaller(loginContext.ctx).auth.login({ email, password: temporaryPassword });
    expect(loginResult.passwordChangeRequired).toBe(true);
    expect(loginContext.cookies).toHaveLength(1);
    await expect(appRouter.createCaller(context(pending).ctx).study.current()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    const changed = await appRouter.createCaller(context(pending).ctx).auth.changePassword({ currentPassword: temporaryPassword, newPassword: "NovaSenha2026Segura", passwordConfirmation: "NovaSenha2026Segura" });
    expect(changed.passwordChangeRequired).toBe(false);
    const updated = await getUserByEmail(email);
    expect(updated?.passwordChangeRequired).toBe(false);
    expect(updated?.temporaryPasswordExpiresAt).toBeNull();
    expect(await verifyPassword("NovaSenha2026Segura", updated!.passwordHash)).toBe(true);
    await expect(appRouter.createCaller(context().ctx).auth.login({ email, password: temporaryPassword })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  }, 30_000);

  it("substitui a senha após recuperação confirmada sem revelar se um e-mail não existe", async () => {
    const email = `reset-${nanoid(14)}@example.test`;
    const user = await createPasswordUser({ openId: `local_${nanoid(16)}`, name: "Usuário de teste", email, passwordHash: await hashPassword("SenhaAntiga2026"), loginMethod: "password" });
    temporaryUserIds.push(user.id);
    const otherEmail = `isolated-${nanoid(14)}@example.test`;
    const otherUser = await createPasswordUser({ openId: `local_${nanoid(16)}`, name: "Outra conta", email: otherEmail, passwordHash: await hashPassword("SenhaIsolada2026"), loginMethod: "password" });
    temporaryUserIds.push(otherUser.id);
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível no teste.");
    await db.insert(authSessions).values({ id: nanoid(), userId: user.id, tokenHash: `test-${nanoid(32)}`, expiresAt: new Date(Date.now() + 60_000) });

    const result = await appRouter.createCaller(context().ctx).auth.requestPasswordReset({ email, confirmed: true });
    expect(result).toEqual({ accepted: true });
    expect(emailMock.sendAccountPasswordEmail).toHaveBeenCalledWith(expect.objectContaining({ recipient: email.toLowerCase(), purpose: "password_reset" }));
    const temporaryPassword = emailMock.sendAccountPasswordEmail.mock.calls[0]?.[0].temporaryPassword as string;
    const updated = await getUserByEmail(email);
    expect(updated?.passwordChangeRequired).toBe(true);
    expect(await verifyPassword("SenhaAntiga2026", updated!.passwordHash)).toBe(false);
    expect(await verifyPassword(temporaryPassword, updated!.passwordHash)).toBe(true);
    const isolatedLogin = await appRouter.createCaller(context().ctx).auth.login({ email: otherEmail, password: "SenhaIsolada2026" });
    expect(isolatedLogin.passwordChangeRequired).toBe(false);
    const revoked = await db.select({ revokedAt: authSessions.revokedAt }).from(authSessions).where(eq(authSessions.userId, user.id));
    expect(revoked.every(session => session.revokedAt instanceof Date)).toBe(true);
    const delivery = await db.select().from(authPasswordDeliveries).where(eq(authPasswordDeliveries.userId, user.id)).limit(1);
    expect(delivery[0]?.status).toBe("sent");
    expect(delivery[0]?.smtpAcceptedAt).toBeInstanceOf(Date);
    expect(delivery[0]?.smtpMessageIdHash).toHaveLength(64);
    expect(delivery[0]?.recipientHash).toHaveLength(64);
    expect(JSON.stringify(delivery[0])).not.toContain(temporaryPassword);

    const unknown = await appRouter.createCaller(context().ctx).auth.requestPasswordReset({ email: `unknown-${nanoid(10)}@example.test`, confirmed: true });
    expect(unknown).toEqual({ accepted: true });
    expect(emailMock.sendAccountPasswordEmail).toHaveBeenCalledOnce();
  }, 30_000);

  it("recusa a senha temporária expirada antes de criar uma sessão", async () => {
    const email = `expired-${nanoid(14)}@example.test`;
    const user = await createPasswordUser({
      openId: `local_${nanoid(16)}`,
      name: "Senha expirada",
      email,
      passwordHash: await hashPassword("SenhaTemporaria2026"),
      passwordChangeRequired: true,
      temporaryPasswordExpiresAt: new Date(Date.now() - 1_000),
      loginMethod: "password",
    });
    temporaryUserIds.push(user.id);
    const loginContext = context();
    await expect(appRouter.createCaller(loginContext.ctx).auth.login({ email, password: "SenhaTemporaria2026" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(loginContext.cookies).toHaveLength(0);
  }, 30_000);

  it("restaura integralmente o estado anterior se a recuperação falhar antes do aceite SMTP", async () => {
    const email = `rollback-${nanoid(14)}@example.test`;
    const issuedAt = new Date(Date.now() - 120_000);
    const expiresAt = new Date(Date.now() + 20 * 60_000);
    const user = await createPasswordUser({
      openId: `local_${nanoid(16)}`,
      name: "Estado pendente",
      email,
      passwordHash: await hashPassword("SenhaPendente2026"),
      passwordChangeRequired: true,
      temporaryPasswordIssuedAt: issuedAt,
      temporaryPasswordExpiresAt: expiresAt,
      loginMethod: "password",
    });
    temporaryUserIds.push(user.id);
    const beforeReset = await getUserByEmail(email);
    if (!beforeReset) throw new Error("Conta de teste não criada.");
    emailMock.sendAccountPasswordEmail.mockRejectedValueOnce(Object.assign(new Error("SMTP indisponível"), { code: "ETIMEDOUT" }));

    await expect(appRouter.createCaller(context().ctx).auth.requestPasswordReset({ email, confirmed: true })).rejects.toMatchObject({ code: "BAD_GATEWAY" });

    const restored = await getUserByEmail(email);
    expect(restored?.passwordChangeRequired).toBe(true);
    expect(restored?.temporaryPasswordIssuedAt?.getTime()).toBe(beforeReset.temporaryPasswordIssuedAt?.getTime());
    expect(restored?.temporaryPasswordExpiresAt?.getTime()).toBe(beforeReset.temporaryPasswordExpiresAt?.getTime());
    expect(await verifyPassword("SenhaPendente2026", restored!.passwordHash)).toBe(true);
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível no teste.");
    const delivery = await db.select().from(authPasswordDeliveries).where(eq(authPasswordDeliveries.userId, user.id)).orderBy(authPasswordDeliveries.createdAt).limit(1);
    expect(delivery[0]?.failureCode).toBe("smtp_connection_timeout");
  }, 30_000);

  it("remove o cadastro local quando a primeira mensagem de ativação falhar", async () => {
    const email = `activation-failure-${nanoid(14)}@example.test`;
    emailMock.sendAccountPasswordEmail.mockRejectedValueOnce(new Error("SMTP indisponível"));

    await expect(appRouter.createCaller(context().ctx).auth.register({ email })).rejects.toMatchObject({ code: "BAD_GATEWAY" });
    expect(await getUserByEmail(email)).toBeUndefined();
  }, 30_000);
});
