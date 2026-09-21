export type CanonicalCatalogPublicSourceRow = {
  canonicalIndex: number;
  matterId: string;
  matterName: string;
  chapterId: string;
  chapterName: string;
  topicId: string;
  topicName: string;
  conceptName: string;
};

export type PublicCanonicalCatalog = {
  courseName: string;
  counts: {
    matters: number;
    chapters: number;
    topics: number;
    concepts: number;
  };
  matters: Array<{
    name: string;
    conceptCount: number;
    chapters: Array<{
      name: string;
      conceptCount: number;
      topics: Array<{
        name: string;
        conceptCount: number;
        concepts: Array<{ name: string }>;
      }>;
    }>;
  }>;
};

type TopicAccumulator = {
  name: string;
  concepts: Array<{ name: string }>;
};

type ChapterAccumulator = {
  name: string;
  topics: Map<string, TopicAccumulator>;
};

type MatterAccumulator = {
  name: string;
  chapters: Map<string, ChapterAccumulator>;
};

/**
 * Constrói uma visão exclusivamente pública da taxonomia de estudos. IDs,
 * prioridades, índices, incidência, RAG e qualquer estado individual ficam
 * deliberadamente fora do payload retornado ao navegador.
 */
export function buildPublicCanonicalCatalog(rows: CanonicalCatalogPublicSourceRow[]): PublicCanonicalCatalog {
  const matters = new Map<string, MatterAccumulator>();

  for (const row of [...rows].sort((a, b) => a.canonicalIndex - b.canonicalIndex)) {
    const matter = matters.get(row.matterId) ?? { name: row.matterName, chapters: new Map<string, ChapterAccumulator>() };
    matters.set(row.matterId, matter);

    const chapter = matter.chapters.get(row.chapterId) ?? { name: row.chapterName, topics: new Map<string, TopicAccumulator>() };
    matter.chapters.set(row.chapterId, chapter);

    const topic = chapter.topics.get(row.topicId) ?? { name: row.topicName, concepts: [] };
    chapter.topics.set(row.topicId, topic);
    topic.concepts.push({ name: row.conceptName });
  }

  const publicMatters = Array.from(matters.values()).map(matter => {
    const chapters = Array.from(matter.chapters.values()).map(chapter => {
      const topics = Array.from(chapter.topics.values()).map(topic => ({
        name: topic.name,
        conceptCount: topic.concepts.length,
        concepts: topic.concepts,
      }));
      return {
        name: chapter.name,
        conceptCount: topics.reduce((total, topic) => total + topic.conceptCount, 0),
        topics,
      };
    });
    return {
      name: matter.name,
      conceptCount: chapters.reduce((total, chapter) => total + chapter.conceptCount, 0),
      chapters,
    };
  });

  return {
    courseName: "Teoria de Piloto Privado de Avião",
    counts: {
      matters: publicMatters.length,
      chapters: publicMatters.reduce((total, matter) => total + matter.chapters.length, 0),
      topics: publicMatters.reduce((total, matter) => total + matter.chapters.reduce((chapterTotal, chapter) => chapterTotal + chapter.topics.length, 0), 0),
      concepts: publicMatters.reduce((total, matter) => total + matter.conceptCount, 0),
    },
    matters: publicMatters,
  };
}
