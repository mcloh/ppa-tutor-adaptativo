import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  getAdminAnalyticsCosts,
  getAdminAnalyticsOperations,
  getAdminAnalyticsOverview,
  trackPlatformActivity,
} from "../adminAnalyticsDb";
import { analyticsPeriods, isPlatformView, type PlatformView } from "../domain/adminAnalytics";

const periodInput = z.object({ period: z.enum(analyticsPeriods) });

/**
 * Telemetria de presença por sessão (view atual, tempo ativo). Nunca IP,
 * user-agent, cliques ou conteúdo navegado — ver server/domain/adminAnalytics.ts.
 * Exige sempre um usuário autenticado com senha já trocada; jamais aberto
 * anonimamente, já que a atividade é sempre atribuída a um usuário.
 */
export const activityRouter = router({
  touch: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().min(1).max(64),
        view: z.string().refine(isPlatformView, "view inválida"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await trackPlatformActivity({
          userId: ctx.user.id,
          sessionId: input.sessionId,
          view: input.view as PlatformView,
        });
      } catch {
        // Telemetria é melhor esforço e jamais deve interromper a operação principal.
        return { accepted: false, activeSecondsAdded: 0 };
      }
    }),
});

/**
 * Console Gerencial — métricas agregadas de comercial/produto, operação/
 * confiabilidade e custos. Exclusivo de administradores (`adminProcedure`);
 * nunca expõe conteúdo de aluno, dados pessoais, prompts, respostas ou segredos.
 */
export const adminAnalyticsRouter = router({
  overview: adminProcedure
    .input(periodInput)
    .query(({ input }) => getAdminAnalyticsOverview(input.period)),
  operations: adminProcedure
    .input(periodInput)
    .query(({ input }) => getAdminAnalyticsOperations(input.period)),
  costs: router({
    summary: adminProcedure
      .input(periodInput)
      .query(({ input }) => getAdminAnalyticsCosts(input.period)),
  }),
});
