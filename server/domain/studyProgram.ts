import type { StudyMode } from "./assessmentMatrix";

export type DiagnosticStatus = "active" | "mode_selection" | "completed";

export function diagnosticStatusAfterAnswer(input: { currentStatus: DiagnosticStatus; mode: StudyMode; matrixSlot: number | null }) {
  if (input.currentStatus === "active" && input.mode === "diagnostic" && input.matrixSlot === 100) return "mode_selection" as const;
  return input.currentStatus;
}

export function canSelectStudyMode(status: DiagnosticStatus) {
  return status === "mode_selection";
}

export function sessionCompletesAfterAnswer(input: { mode: StudyMode; matrixSlot: number | null }) {
  return (input.mode === "diagnostic" || input.mode === "simulado") && input.matrixSlot === 100;
}

export function nextModeAfterSelection(input: { status: DiagnosticStatus; mode: "simulado" | "tutor" }) {
  if (!canSelectStudyMode(input.status)) throw new Error("Conclua o diagnóstico antes de escolher uma modalidade.");
  return { diagnosticStatus: "completed" as const, selectedMode: input.mode };
}
