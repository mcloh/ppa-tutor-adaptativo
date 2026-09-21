import { readFile } from "node:fs/promises";

const mapPath = "/home/ubuntu/projects/ppa-te-rico-6707cce7/Mapa_Prontidao_Canonico.json";
const map = JSON.parse(await readFile(mapPath, "utf8"));
const questionsPerMatter = 20;

const matters = map.matters.map(matter => {
  const chapterCount = matter.chapters.length;
  const conceptCount = matter.chapters.reduce((total, chapter) => total + chapter.topics.reduce((topicTotal, topic) => topicTotal + topic.concepts.length, 0), 0);
  return {
    id: matter.id,
    name: matter.name,
    chapters: chapterCount,
    concepts: conceptCount,
    allocatedQuestions: questionsPerMatter,
    additionalQuestionsAfterChapterCoverage: questionsPerMatter - chapterCount,
    feasible: chapterCount <= questionsPerMatter,
  };
});

const summary = {
  matters: matters.length,
  chapters: matters.reduce((total, matter) => total + matter.chapters, 0),
  concepts: matters.reduce((total, matter) => total + matter.concepts, 0),
  totalQuestions: matters.length * questionsPerMatter,
  minimumChapterCoverage: matters.reduce((total, matter) => total + matter.chapters, 0),
  remainingQuestionSlots: matters.reduce((total, matter) => total + matter.additionalQuestionsAfterChapterCoverage, 0),
  feasible: matters.every(matter => matter.feasible),
  approvedCrossChapterRule: {
    matterId: "REG",
    chapterIds: ["REG-C07", "REG-C08"],
    conceptIds: ["REG-C07-T01-K02", "REG-C08-T01-K02"],
  },
  feasibleWithApprovedCrossChapterRule: matters.every(matter => matter.feasible || matter.id === "REG" && matter.chapters === questionsPerMatter + 1),
};

const regulations = map.matters.find(matter => matter.id === "REG");
const regulationChapters = regulations?.chapters.map(chapter => ({
  id: chapter.id,
  name: chapter.name,
  concepts: chapter.topics.reduce((total, topic) => total + topic.concepts.length, 0),
})) ?? [];

console.log(JSON.stringify({ summary, matters, regulationChapters }, null, 2));
