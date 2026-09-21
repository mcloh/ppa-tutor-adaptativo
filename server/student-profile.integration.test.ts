import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { users } from "../drizzle/schema";
import { createPasswordUser, findOrCreateGoogleUser, getDb } from "./db";
import { hashPassword } from "./domain/password";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const temporaryUserIds: number[] = [];

afterEach(async () => {
  const db = await getDb();
  if (db) for (const id of temporaryUserIds.splice(0)) await db.delete(users).where(eq(users.id, id));
});

function context(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { ip: "127.0.0.1", headers: { host: "ppa.simulados.apia.app.br" }, header: () => undefined } as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as TrpcContext["res"],
  };
}

async function localUser(label: string) {
  const user = await createPasswordUser({
    openId: `local_${nanoid(18)}`,
    name: `${label} Inicial`,
    email: `${label.toLowerCase()}-${nanoid(10)}@example.test`,
    passwordHash: await hashPassword("SenhaLocalSegura2026"),
    loginMethod: "password",
  });
  temporaryUserIds.push(user.id);
  return user;
}

describe("dados cadastrais e histórico ANAC", () => {
  it("mantém perfil e tentativas inteiramente isolados por usuário", async () => {
    const userA = await localUser("AlunoA");
    const userB = await localUser("AlunoB");
    const callerA = appRouter.createCaller(context(userA));
    const callerB = appRouter.createCaller(context(userB));

    const initialProfile = await callerA.studentProfile.get();
    expect(initialProfile).toMatchObject({ name: "AlunoA Inicial", email: userA.email, dateOfBirth: null });
    expect(initialProfile).not.toHaveProperty("id");
    expect(initialProfile).not.toHaveProperty("openId");

    await callerA.studentProfile.update({
      name: "Aluno A Atualizado",
      dateOfBirth: "1990-05-20",
      gender: "NB",
      city: "São Paulo",
      stateUf: "sp",
      theoreticalCourseProvider: "Escola PPA",
    });
    await callerA.studentProfile.attempts.create({ examDate: "2026-08-10", metScore: 18, regScore: 17, navScore: 16, mecScore: 15, tvoScore: 14, approved: true });

    const [profileA, attemptsA, profileB, attemptsB] = await Promise.all([
      callerA.studentProfile.get(),
      callerA.studentProfile.attempts.list(),
      callerB.studentProfile.get(),
      callerB.studentProfile.attempts.list(),
    ]);
    expect(profileA).toMatchObject({ name: "Aluno A Atualizado", dateOfBirth: "1990-05-20", gender: "NB", city: "São Paulo", stateUf: "SP", theoreticalCourseProvider: "Escola PPA" });
    expect(profileB).toMatchObject({ name: "AlunoB Inicial", dateOfBirth: null, city: null });
    expect(attemptsA).toHaveLength(1);
    expect(attemptsA[0]).toMatchObject({ examDate: "2026-08-10", metScore: 18, approved: true });
    expect(attemptsA[0]).not.toHaveProperty("userId");
    expect(attemptsB).toEqual([]);
  }, 30_000);

  it("rejeita UF, data e notas ANAC fora dos limites do contrato", async () => {
    const user = await localUser("Validacao");
    const caller = appRouter.createCaller(context(user));

    await expect(caller.studentProfile.update({ name: "Aluno Válido", dateOfBirth: "2026-99-99", gender: "M", city: "", stateUf: "SP", theoreticalCourseProvider: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.studentProfile.update({ name: "Aluno Válido", dateOfBirth: null, gender: null, city: "", stateUf: "XX", theoreticalCourseProvider: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.studentProfile.attempts.create({ examDate: "2026-08-10", metScore: 21, regScore: 0, navScore: 0, mecScore: 0, tvoScore: 0, approved: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }, 30_000);

  it("permite senha local para conta vinculada e a recusa para conta exclusivamente Google", async () => {
    const google = await findOrCreateGoogleUser({ subject: `subject-${nanoid(18)}`, email: `google-only-${nanoid(10)}@example.test`, name: "Conta Google" });
    temporaryUserIds.push(google.user.id);
    const googleCaller = appRouter.createCaller(context(google.user));
    expect(await googleCaller.auth.me()).toMatchObject({ canChangePassword: false });
    await expect(googleCaller.auth.changePassword({ currentPassword: "qualquer", newPassword: "NovaSenha2026Segura", passwordConfirmation: "NovaSenha2026Segura" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const local = await localUser("Vinculada");
    const linked = await findOrCreateGoogleUser({ subject: `subject-${nanoid(18)}`, email: local.email, name: "Conta Vinculada" });
    const linkedCaller = appRouter.createCaller(context(linked.user));
    expect(await linkedCaller.auth.me()).toMatchObject({ canChangePassword: true });
    await expect(linkedCaller.auth.changePassword({ currentPassword: "SenhaLocalSegura2026", newPassword: "NovaSenha2026Segura", passwordConfirmation: "NovaSenha2026Segura" })).resolves.toMatchObject({ canChangePassword: true, passwordChangeRequired: false });
  }, 30_000);
});
