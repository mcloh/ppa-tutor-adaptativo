export const STUDY_MODES = ["diagnostic", "simulado", "tutor"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];
export type SelectableStudyMode = Exclude<StudyMode, "diagnostic">;

export const ASSESSMENT_MATTERS = ["CTA", "MET", "NAV", "TV", "REG"] as const;
export const QUESTIONS_PER_MATTER = 20;
export const ASSESSMENT_QUESTION_COUNT = ASSESSMENT_MATTERS.length * QUESTIONS_PER_MATTER;

const crossChapterRule = {
  matterId: "REG",
  primaryChapterId: "REG-C07",
  secondaryChapterId: "REG-C08",
  primaryConceptId: "REG-C07-T01-K02",
  secondaryConceptId: "REG-C08-T01-K02",
} as const;

export type MatrixConcept = {
  id: string;
  canonicalIndex: number;
  matterId: string;
  matterName: string;
  chapterId: string;
  chapterName: string;
  topicId: string;
  topicName: string;
  name: string;
  priority: "P1" | "P2" | "P3" | "P4";
  gapScore: number;
};

export type AssessmentMatrixSlot = {
  slot: number;
  matterId: (typeof ASSESSMENT_MATTERS)[number];
  chapterIds: string[];
  conceptIds: string[];
  kind: "chapter_baseline" | "chapter_supplement" | "cross_chapter";
};

const priorityOrder = { P1: 1, P2: 2, P3: 3, P4: 4 } as const;

function conceptOrder(a: MatrixConcept, b: MatrixConcept) {
  return priorityOrder[a.priority] - priorityOrder[b.priority]
    || b.gapScore - a.gapScore
    || a.canonicalIndex - b.canonicalIndex;
}

function chapterOrder(a: MatrixConcept, b: MatrixConcept) {
  return a.chapterId.localeCompare(b.chapterId)
    || conceptOrder(a, b);
}

function firstUnusedConcept(candidates: MatrixConcept[], used: Set<string>) {
  const concept = [...candidates].sort(conceptOrder).find(item => !used.has(item.id));
  if (!concept) throw new Error("Não há conceito disponível para compor a matriz de avaliação.");
  used.add(concept.id);
  return concept;
}

export function buildAssessmentMatrix(concepts: MatrixConcept[]): AssessmentMatrixSlot[] {
  const slots: AssessmentMatrixSlot[] = [];
  const usedConceptIds = new Set<string>();

  for (const matterId of ASSESSMENT_MATTERS) {
    const matterConcepts = concepts.filter(concept => concept.matterId === matterId);
    if (!matterConcepts.length) throw new Error(`A matéria ${matterId} não possui conceitos para a matriz.`);
    const chapters = new Map<string, MatrixConcept[]>();
    for (const concept of matterConcepts) {
      const current = chapters.get(concept.chapterId) ?? [];
      current.push(concept);
      chapters.set(concept.chapterId, current);
    }

    const matterSlots: Omit<AssessmentMatrixSlot, "slot">[] = [];
    for (const [chapterId, chapterConcepts] of Array.from(chapters.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      if (matterId === crossChapterRule.matterId && chapterId === crossChapterRule.secondaryChapterId) continue;
      if (matterId === crossChapterRule.matterId && chapterId === crossChapterRule.primaryChapterId) {
        const primary = matterConcepts.find(concept => concept.id === crossChapterRule.primaryConceptId);
        const secondary = matterConcepts.find(concept => concept.id === crossChapterRule.secondaryConceptId);
        if (!primary || !secondary) throw new Error("Os conceitos da questão transversal de Regulamentos não foram encontrados.");
        usedConceptIds.add(primary.id);
        usedConceptIds.add(secondary.id);
        matterSlots.push({
          matterId,
          chapterIds: [crossChapterRule.primaryChapterId, crossChapterRule.secondaryChapterId],
          conceptIds: [primary.id, secondary.id],
          kind: "cross_chapter",
        });
        continue;
      }
      const concept = firstUnusedConcept(chapterConcepts, usedConceptIds);
      matterSlots.push({ matterId, chapterIds: [chapterId], conceptIds: [concept.id], kind: "chapter_baseline" });
    }

    const supplementalCandidates = [...matterConcepts].sort(conceptOrder);
    while (matterSlots.length < QUESTIONS_PER_MATTER) {
      const concept = firstUnusedConcept(supplementalCandidates, usedConceptIds);
      matterSlots.push({ matterId, chapterIds: [concept.chapterId], conceptIds: [concept.id], kind: "chapter_supplement" });
    }
    if (matterSlots.length !== QUESTIONS_PER_MATTER) throw new Error(`A matéria ${matterId} excedeu ${QUESTIONS_PER_MATTER} posições na matriz.`);
    const firstSlot = slots.length + 1;
    slots.push(...matterSlots.map((slot, index) => ({ ...slot, slot: firstSlot + index })));
  }

  if (slots.length !== ASSESSMENT_QUESTION_COUNT) throw new Error("A matriz não totaliza 100 questões.");
  const counts = new Map<string, number>();
  for (const slot of slots) counts.set(slot.matterId, (counts.get(slot.matterId) ?? 0) + 1);
  for (const matterId of ASSESSMENT_MATTERS) {
    if (counts.get(matterId) !== QUESTIONS_PER_MATTER) throw new Error(`A matéria ${matterId} não totaliza 20 questões.`);
  }
  return slots;
}

export function assessmentMatrixSummary(slots: AssessmentMatrixSlot[]) {
  const matterCounts = Object.fromEntries(ASSESSMENT_MATTERS.map(matterId => [matterId, slots.filter(slot => slot.matterId === matterId).length]));
  const chapterCoverage = new Set(slots.flatMap(slot => slot.chapterIds));
  const crossChapterSlots = slots.filter(slot => slot.kind === "cross_chapter");
  return {
    totalQuestions: slots.length,
    matterCounts,
    chapterCoverageCount: chapterCoverage.size,
    crossChapterSlots: crossChapterSlots.map(slot => ({ slot: slot.slot, chapterIds: slot.chapterIds, conceptIds: slot.conceptIds })),
  };
}

export function nextMatrixSlot(slots: AssessmentMatrixSlot[], deliveredSlots: number[]) {
  const delivered = new Set(deliveredSlots);
  return slots.find(slot => !delivered.has(slot.slot)) ?? null;
}
