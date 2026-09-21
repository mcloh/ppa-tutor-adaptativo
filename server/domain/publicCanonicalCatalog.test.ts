import { describe, expect, it } from "vitest";
import { buildPublicCanonicalCatalog } from "./publicCanonicalCatalog";

const rows = [
  { canonicalIndex: 3, matterId: "MAT-A", matterName: "Matéria A", chapterId: "CAP-A1", chapterName: "Capítulo A1", topicId: "TOP-A1", topicName: "Tópico A1", conceptName: "Conceito A1.2" },
  { canonicalIndex: 1, matterId: "MAT-A", matterName: "Matéria A", chapterId: "CAP-A1", chapterName: "Capítulo A1", topicId: "TOP-A1", topicName: "Tópico A1", conceptName: "Conceito A1.1" },
  { canonicalIndex: 2, matterId: "MAT-A", matterName: "Matéria A", chapterId: "CAP-A2", chapterName: "Capítulo A2", topicId: "TOP-A2", topicName: "Tópico A2", conceptName: "Conceito A2.1" },
  { canonicalIndex: 4, matterId: "MAT-B", matterName: "Matéria B", chapterId: "CAP-B1", chapterName: "Capítulo B1", topicId: "TOP-B1", topicName: "Tópico B1", conceptName: "Conceito B1.1" },
] as const;

describe("catálogo canônico público", () => {
  it("organiza curso, matéria, capítulo, tópico e conceito pela ordem canônica", () => {
    const catalog = buildPublicCanonicalCatalog([...rows]);

    expect(catalog.courseName).toBe("Teoria de Piloto Privado de Avião");
    expect(catalog.counts).toEqual({ matters: 2, chapters: 3, topics: 3, concepts: 4 });
    expect(catalog.matters[0]).toMatchObject({
      name: "Matéria A",
      conceptCount: 3,
      chapters: [
        { name: "Capítulo A1", conceptCount: 2, topics: [{ name: "Tópico A1", concepts: [{ name: "Conceito A1.1" }, { name: "Conceito A1.2" }] }] },
        { name: "Capítulo A2", conceptCount: 1 },
      ],
    });
  });

  it("remove IDs e índices internos antes de a árvore ser enviada ao navegador", () => {
    const serialized = JSON.stringify(buildPublicCanonicalCatalog([...rows]));

    expect(serialized).not.toContain("MAT-A");
    expect(serialized).not.toContain("CAP-A1");
    expect(serialized).not.toContain("TOP-A1");
    expect(serialized).not.toContain("canonicalIndex");
    expect(serialized).toContain("Conceito A1.1");
  });
});
