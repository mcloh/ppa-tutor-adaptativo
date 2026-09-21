import { createHash } from "node:crypto";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const run = promisify(execFile);
const sourceRoot = process.argv[2];
const outputPath = process.argv[3];
const concurrency = Number(process.env.OCR_CONCURRENCY ?? 8);

if (!sourceRoot || !outputPath) throw new Error("Uso: node extract-evidence-ocr.mjs <diretório-fonte> <arquivo-saída>");

async function listImages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listImages(path);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".png") ? [path] : [];
  }));
  return nested.flat();
}

function cleanOcr(text) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const files = (await listImages(sourceRoot)).sort();
const output = [];
let cursor = 0;
let failures = 0;

async function saveCheckpoint() {
  const ordered = [...output].sort((a, b) => a.ordinal - b.ordinal);
  await mkdir(join(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, JSON.stringify({ extractionVersion: "ocr-por-eng-v1", sourceRoot, scanned: files.length, processed: cursor, accepted: ordered.length, failures, chunks: ordered }, null, 2));
}

async function worker() {
  while (cursor < files.length) {
    const index = cursor++;
    const path = files[index];
    try {
      const { stdout } = await run("tesseract", [path, "stdout", "-l", "por+eng", "--psm", "11"], { maxBuffer: 2 * 1024 * 1024, env: { ...process.env, OMP_THREAD_LIMIT: "1" } });
      const content = cleanOcr(stdout);
      const textCharacters = (content.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
      if (textCharacters < 24) continue;
      const relPath = relative(sourceRoot, path);
      output.push({
        module: relPath.split(/[\\/]/)[0] ?? "geral",
        sourcePath: relPath,
        ordinal: index + 1,
        content,
        contentChecksum: createHash("sha256").update(content).digest("hex"),
        sourceFile: basename(path),
      });
    } catch (error) {
      failures += 1;
      console.error(`OCR falhou: ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if ((index + 1) % 10 === 0) {
      await saveCheckpoint();
      console.log(`OCR: ${index + 1}/${files.length}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
await saveCheckpoint();
console.log(JSON.stringify({ scanned: files.length, accepted: output.length, failures, outputPath }, null, 2));
