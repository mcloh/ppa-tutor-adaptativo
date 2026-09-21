import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const [ocrFile, archiveFile] = process.argv.slice(2);
if (!ocrFile || !archiveFile) throw new Error("Uso: node import-evidence-rag.mjs <ocr-index.json> <arquivo-evidência.zip>");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não está configurada.");

const sha256 = input => createHash("sha256").update(input).digest("hex");
const normalize = input => input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const stopWords = new Set("a ao aos as o os de da das do dos e em no na nos nas um uma uns umas por para com que se sua seu suas seus como mais menos entre sobre sem sob já não sim ou este esta isto esse essa isso aquele aquela aqueles aquelas meu minha nosso nossa vosso vossa ser estar ter haver são foi foram era eram é são".split(" "));

function termsFor(content) {
  const tokens = normalize(content).match(/[a-z0-9]{3,}/g) ?? [];
  const counts = new Map();
  for (const token of tokens) {
    if (!stopWords.has(token)) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 80);
}

const [ocrRaw, archiveRaw] = await Promise.all([readFile(ocrFile), readFile(archiveFile)]);
const extracted = JSON.parse(ocrRaw.toString("utf8"));
const archiveChecksum = sha256(archiveRaw);
const extractionChecksum = sha256(ocrRaw);
const sourceId = `ead_${archiveChecksum.slice(0, 40)}`;
const connection = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const [catalogRows] = await connection.execute("SELECT id, version FROM course_catalog_versions ORDER BY createdAt DESC LIMIT 1");
  const catalog = catalogRows[0];
  if (!catalog) throw new Error("O catálogo canônico deve ser carregado antes do RAG.");

  await connection.beginTransaction();
  const [existingRows] = await connection.execute("SELECT id, status, extractionChecksum FROM knowledge_sources WHERE catalogVersionId = ? AND sourceChecksum = ? LIMIT 1", [catalog.id, archiveChecksum]);
  const existing = existingRows[0];
  if (existing?.status === "ready" && existing.extractionChecksum === extractionChecksum) {
    await connection.commit();
    console.log(JSON.stringify({ status: "already_indexed", sourceId: existing.id, catalogVersion: catalog.version }, null, 2));
    process.exit(0);
  }
  if (existing) await connection.execute("DELETE FROM knowledge_sources WHERE id = ?", [existing.id]);
  await connection.execute(
    "INSERT INTO knowledge_sources (id, catalogVersionId, logicalName, originalFilename, sourceChecksum, extractionChecksum, extractionVersion, status, chunkCount) VALUES (?, ?, ?, ?, ?, ?, ?, 'indexing', 0)",
    [sourceId, catalog.id, "Apostila EAD de aviação PPA", "aviação ppa ead.zip", archiveChecksum, extractionChecksum, extracted.extractionVersion]
  );

  const accepted = extracted.chunks.filter(chunk => chunk.content.length >= 24);
  for (const chunk of accepted) {
    const id = `kc_${sha256(`${sourceId}:${chunk.sourcePath}`).slice(0, 40)}`;
    await connection.execute(
      "INSERT INTO knowledge_chunks (id, sourceId, module, sourcePath, ordinal, contentChecksum, content, charCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, sourceId, chunk.module, chunk.sourcePath, chunk.ordinal, chunk.contentChecksum, chunk.content, chunk.content.length]
    );
    const terms = termsFor(chunk.content);
    if (terms.length) {
      const values = terms.map(([token, weight]) => [`kt_${sha256(`${id}:${token}`).slice(0, 40)}`, sourceId, id, token.slice(0, 64), Math.min(weight, 999)]);
      const placeholders = values.map(() => "(?, ?, ?, ?, ?)").join(",");
      await connection.execute(`INSERT INTO knowledge_chunk_terms (id, sourceId, chunkId, token, weight) VALUES ${placeholders}`, values.flat());
    }
  }
  await connection.execute("UPDATE knowledge_sources SET status = 'ready', chunkCount = ?, indexedAt = NOW() WHERE id = ?", [accepted.length, sourceId]);
  await connection.commit();
  console.log(JSON.stringify({ status: "ready", sourceId, catalogVersion: catalog.version, chunks: accepted.length, sourceChecksum: archiveChecksum, extractionChecksum }, null, 2));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
