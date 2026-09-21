import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { users } from "../drizzle/schema";
import { createPasswordUser, findOrCreateGoogleUser, getDb, getUserByEmail } from "./db";
import { hashPassword, verifyPassword } from "./domain/password";

const temporaryUserIds: number[] = [];

afterEach(async () => {
  const db = await getDb();
  if (db) for (const id of temporaryUserIds.splice(0)) await db.delete(users).where(eq(users.id, id));
});

describe("vinculação de Conta Google", () => {
  it("vincula Gmail verificado a uma conta local sem alterar senha ou papel", async () => {
    const email = `google-link-${nanoid(12)}@gmail.com`;
    const password = "SenhaLocalSegura2026";
    const local = await createPasswordUser({
      openId: `local_${nanoid(18)}`,
      name: "Conta local",
      email,
      passwordHash: await hashPassword(password),
      loginMethod: "password",
      role: "homologation",
    });
    temporaryUserIds.push(local.id);

    const linked = await findOrCreateGoogleUser({ subject: `subject-${nanoid(18)}`, email: email.toUpperCase(), name: "Nome Google" });
    expect(linked.created).toBe(false);
    expect(linked.linked).toBe(true);
    expect(linked.user.id).toBe(local.id);
    expect(linked.user.role).toBe("homologation");
    expect(linked.user.googleSubject).toBeTruthy();
    expect(await verifyPassword(password, linked.user.passwordHash)).toBe(true);
  }, 30_000);

  it("cria uma única conta federada por subject e não duplica por novo login", async () => {
    const subject = `subject-${nanoid(18)}`;
    const email = `google-new-${nanoid(12)}@gmail.com`;
    const created = await findOrCreateGoogleUser({ subject, email, name: "Aluno Google" });
    temporaryUserIds.push(created.user.id);
    expect(created.created).toBe(true);
    expect(created.user.loginMethod).toBe("google");
    expect(created.user.passwordChangeRequired).toBe(false);

    const returning = await findOrCreateGoogleUser({ subject, email: `different-${nanoid(10)}@gmail.com`, name: "Outro nome" });
    expect(returning.created).toBe(false);
    expect(returning.user.id).toBe(created.user.id);
    expect(await getUserByEmail(email)).toBeTruthy();
  }, 30_000);

  it("recusa vinculação de um novo subject a e-mail já vinculado", async () => {
    const email = `google-conflict-${nanoid(12)}@gmail.com`;
    const first = await findOrCreateGoogleUser({ subject: `subject-${nanoid(18)}`, email, name: "Primeiro" });
    temporaryUserIds.push(first.user.id);
    await expect(findOrCreateGoogleUser({ subject: `subject-${nanoid(18)}`, email, name: "Segundo" })).rejects.toThrow("não corresponde");
  }, 30_000);
});
