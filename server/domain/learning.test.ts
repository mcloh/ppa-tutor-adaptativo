import { describe, expect, it } from "vitest";
import { appendMapEvent, assessmentAuditAppendix, assessmentMilestoneForQuestion, classifyResponse, initialReadinessMap, readinessChecksum, transitionProgress, zeroProgress } from "./learning";

describe("motor determinístico de aprendizagem", () => {
  it("aceita somente as classificações correct, incorrect e Me ensine", () => {
    expect(classifyResponse("A", "A")).toBe("correct");
    expect(classifyResponse("B", "A")).toBe("incorrect");
    expect(classifyResponse("ME_ENSINE", "A")).toBe("me_ensine");
  });

  it("não contabiliza Me ensine como tentativa independente ou erro", () => {
    const transition = transitionProgress(zeroProgress(), "ME_ENSINE", "B", "new", 1, new Date("2026-08-28T00:00:00Z"));
    expect(transition.eventType).toBe("teach_requested");
    expect(transition.next).toMatchObject({ questionsPresented: 1, teachRequests: 1, independentAnswers: 0, correct: 0, incorrect: 0, currentState: "taught" });
    expect(transition.next.reviewEligibleAfterQuestion).toBe(2);
  });

  it("mantém acerto de reforço como consolidação e confirma apenas por revisão espaçada", () => {
    const recovery = transitionProgress(zeroProgress(), "A", "A", "immediate_review", 2, new Date("2026-08-28T00:00:00Z"));
    expect(recovery.eventType).toBe("immediate_review_correct");
    expect(recovery.next.currentState).toBe("partial_consolidation");
    expect(recovery.next.immediateCorrect).toBe(1);

    const confirmed = transitionProgress(recovery.next, "A", "A", "spaced_review", 22, new Date("2026-08-29T00:00:00Z"));
    expect(confirmed.eventType).toBe("spaced_review_correct");
    expect(confirmed.next.currentState).toBe("confirmed");
    expect(confirmed.next.spacedCorrect).toBe(1);
  });

  it("atualiza o mapa com evento e preserva um checksum verificável", () => {
    const original = initialReadinessMap("ppa-2026-08-28");
    const transition = transitionProgress(zeroProgress(), "C", "C", "new", 1, new Date("2026-08-28T00:00:00Z"));
    const updated = appendMapEvent(original, { eventId: "evt_001", conceptIds: ["CTA-C01-T01-K01"], progressByConcept: { "CTA-C01-T01-K01": transition.next }, transition, at: new Date("2026-08-28T00:00:00Z") });
    expect(original.current_version).toBe(0);
    expect(updated.current_version).toBe(1);
    expect(updated.global_counters).toMatchObject({ questions_presented: 1, independent_answers: 1, correct: 1, incorrect: 0 });
    expect(updated.concepts["CTA-C01-T01-K01"]?.last_event_id).toBe("evt_001");
    expect(readinessChecksum(updated)).toHaveLength(64);
  });

  it("registra a questão transversal nos dois conceitos sem duplicar o contador global", () => {
    const original = initialReadinessMap("ppa-2026-08-28");
    const ruleTransition = transitionProgress(zeroProgress(), "A", "A", "new", 1, new Date("2026-08-28T00:00:00Z"));
    const vfrTransition = transitionProgress(zeroProgress(), "A", "A", "new", 1, new Date("2026-08-28T00:00:00Z"));
    const updated = appendMapEvent(original, {
      eventId: "evt_cross_001",
      conceptIds: ["REG-C07-T01-K02", "REG-C08-T01-K02"],
      progressByConcept: { "REG-C07-T01-K02": ruleTransition.next, "REG-C08-T01-K02": vfrTransition.next },
      transition: ruleTransition,
      at: new Date("2026-08-28T00:00:00Z"),
    });
    expect(updated.global_counters.questions_presented).toBe(1);
    expect(updated.global_counters.independent_answers).toBe(1);
    expect(updated.concepts["REG-C07-T01-K02"]?.readiness).toBe(ruleTransition.next.readinessScore);
    expect(updated.concepts["REG-C08-T01-K02"]?.readiness).toBe(vfrTransition.next.readinessScore);
  });

  it("anexa métricas auditáveis aos marcos de avaliação", () => {
    const report = assessmentAuditAppendix({
      type: "partial_20", questionNumber: 20, mapVersion: 20,
      counters: { questions_presented: 20, independent_answers: 17, correct: 13, incorrect: 4, teach_requests: 3 },
      subjects: [{ name: "Meteorologia", coverage: 12, accuracy: 76, readiness: 43 }],
      gaps: [{ priority: "P1", matter: "Meteorologia", name: "Visibilidade", readiness: 20, evidence: 1 }],
    });
    expect(report).toContain("Questões 001–020");
    expect(report).toContain("Precisão independente");
    expect(report).toContain("Matriz de lacunas prioritárias");
    expect(report).toContain("integridade validada");
  });

  it("dispara avaliação parcial em 20 e diagnóstico com plano em 100", () => {
    expect(assessmentMilestoneForQuestion(19)).toBeNull();
    expect(assessmentMilestoneForQuestion(20)).toBe("partial_20");
    expect(assessmentMilestoneForQuestion(99)).toBeNull();
    expect(assessmentMilestoneForQuestion(100)).toBe("diagnostic_100");
    expect(assessmentMilestoneForQuestion(200)).toBe("diagnostic_100");
  });
});
