import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

describe("controle de acesso", () => {
  it("rejeita o procedimento de estudo quando não há sessão autenticada", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { headers: {}, protocol: "https" } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.study.current()).rejects.toMatchObject<Partial<TRPCError>>({ code: "UNAUTHORIZED" });
  });

  it("rejeita a retirada de cache para conta não administrativa", async () => {
    const ctx: TrpcContext = {
      user: { id: 1, openId: "student", name: "Estudante", email: "student@example.test", passwordHash: "hash", loginMethod: "password", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { headers: {}, protocol: "https" } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.cacheAdmin.retire({ cacheQuestionId: "sqc_12345678", reason: "Revisão identificou alternativas ambíguas." })).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
  });
});
