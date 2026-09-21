import { describe, expect, it } from "vitest";
import { getAdminAnalyticsCosts, getAdminAnalyticsOperations, getAdminAnalyticsOverview } from "./adminAnalyticsDb";

describe("console gerencial — consultas de leitura", () => {
  it("retorna snapshots agregados sem dados de aluno", async () => {
    const [overview, operations, costs] = await Promise.all([
      getAdminAnalyticsOverview("30d"),
      getAdminAnalyticsOperations("30d"),
      getAdminAnalyticsCosts("30d"),
    ]);

    expect(overview.period).toBe("30d");
    expect(typeof overview.cards.totalStudents).toBe("number");
    expect(operations.period).toBe("30d");
    expect(operations.availability).toBeDefined();
    expect(costs.period).toBe("30d");
    expect(JSON.stringify({ overview, operations, costs })).not.toContain("passwordHash");
    expect(JSON.stringify({ overview, operations, costs })).not.toContain("openId");
  });
});
