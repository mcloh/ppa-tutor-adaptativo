import { NOT_ADMIN_ERR_MSG, NOT_HOMOLOGATION_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

const requireUpdatedPassword = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (ctx.user.passwordChangeRequired) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Atualize sua senha temporária para continuar." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const passwordChangeProcedure = t.procedure.use(requireUser);
export const protectedProcedure = t.procedure.use(requireUpdatedPassword);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    if (ctx.user.passwordChangeRequired) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Atualize sua senha temporária para continuar." });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/** Permissão mínima para execução de checkout PagBank Sandbox na homologação. */
export const homologationProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'homologation') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_HOMOLOGATION_ERR_MSG });
    }
    if (ctx.user.passwordChangeRequired) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Atualize sua senha temporária para continuar." });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
