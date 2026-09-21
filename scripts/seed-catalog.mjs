import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const sourceDir = "/home/ubuntu/projects/ppa-te-rico-6707cce7";
const mapPath = `${sourceDir}/Mapa_Prontidao_Canonico.json`;
const planPath = `${sourceDir}/Plano_de_Estudo_Fase_2.md`;

const mapText = await readFile(mapPath, "utf8");
const planMarkdown = await readFile(planPath, "utf8");
const sourceMap = JSON.parse(mapText);
const sourceChecksum = createHash("sha256").update(mapText).digest("hex");
const catalogVersion = `ppa-${String(sourceMap.generated_at ?? "2026-08-28").slice(0, 10)}`;

const connection = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const [existing] = await connection.execute(
    "SELECT id FROM course_catalog_versions WHERE version = ? LIMIT 1",
    [catalogVersion]
  );

  if (existing.length > 0) {
    console.log(`Catalog ${catalogVersion} already exists; no changes applied.`);
    process.exit(0);
  }

  const catalogId = randomUUID();
  await connection.beginTransaction();
  await connection.execute(
    "INSERT INTO course_catalog_versions (id, version, sourceChecksum, sourceMapJson, sourcePlanMarkdown) VALUES (?, ?, ?, ?, ?)",
    [catalogId, catalogVersion, sourceChecksum, mapText, planMarkdown]
  );

  const insertConcept = `INSERT INTO canonical_concepts
    (id, catalogVersionId, canonicalIndex, matterId, matterName, chapterId, chapterName, topicId, topicName, name, priority, gapScore, referenceQuestionCount, recentIncidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  let conceptCount = 0;
  for (const matter of sourceMap.matters) {
    for (const chapter of matter.chapters) {
      for (const topic of chapter.topics) {
        const phase2 = topic.phase2 ?? { priority: "P2", gap_score: 5 };
        const evidence = topic.external_evidence ?? {};
        const questionCount = evidence.simulated_bank?.question_count ?? 0;
        const recentIncidence = evidence.recent_exam_reports?.incidence ?? "none";

        for (const concept of topic.concepts) {
          await connection.execute(insertConcept, [
            concept.id,
            catalogId,
            concept.canonical_index,
            matter.id,
            matter.name,
            chapter.id,
            chapter.name,
            topic.id,
            topic.name,
            concept.name,
            phase2.priority,
            phase2.gap_score,
            questionCount,
            recentIncidence,
          ]);
          conceptCount += 1;
        }
      }
    }
  }

  if (conceptCount !== sourceMap.canonical_counts.concepts) {
    throw new Error(`Integrity check failed: expected ${sourceMap.canonical_counts.concepts} concepts, imported ${conceptCount}.`);
  }

  await connection.commit();
  console.log(`Imported ${conceptCount} canonical concepts for ${catalogVersion}.`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
