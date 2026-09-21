import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("contratos do console administrativo", () => {
  it("mantém métricas exclusivas de admin e atividade de aluno sem expor conteúdo", async () => {
    const [router, db, dashboard, home] = await Promise.all([
      source("./routers/adminAnalytics.ts"),
      source("./adminAnalyticsDb.ts"),
      source("../client/src/pages/AdminAnalyticsDashboard.tsx"),
      source("../client/src/pages/Home.tsx"),
    ]);
    expect(router).toContain("adminProcedure");
    expect(router).toContain("activityRouter");
    expect(router).not.toContain("publicProcedure");
    expect(db).toContain("Telemetria é melhor esforço");
    expect(db).not.toContain("prompt:");
    expect(db).not.toContain("sourceContext");
    expect(dashboard).toContain("Console Gerencial");
    expect(dashboard).toContain("Comercial e produto");
    expect(dashboard).toContain("Operação e confiabilidade");
    expect(dashboard).toContain("Não mensurável sem sonda externa");
    expect(home).toContain('user.role === "admin"');
    expect(home).toContain("AdminAnalyticsDashboard");
  });
});
