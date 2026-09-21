import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  listApprovedCacheForConcept,
  listCacheWarmupConcepts,
  retrieveRagEvidence,
  storeCachedFeedback,
  storeSharedQuestion,
} from "../server/db.ts";
import { CACHE_WARMUP_TARGET_PER_CONCEPT, isWarmupComplete, warmupRoundPlan } from "../server/domain/cacheWarmup.ts";
import { generateCacheBundle, generateFeedback } from "../server/domain/tutorLlm.ts";

const args = new Map(process.argv.slice(2).map(value => {
  const [key, raw = "true"] = value.split("=");
  return [key.replace(/^--/, ""), raw];
}));
const requestedRound = Number(args.get("round") ?? 0);
const workers = Math.max(1, Math.min(8, Number(args.get("workers") ?? 4)));
const limit = Math.max(0, Number(args.get("limit") ?? 0));
const dryRun = args.get("dry-run") === "true";
const statePath = resolve(args.get("state") ?? "/home/ubuntu/ppa-cache-warmup/progress.json");
const forceConceptIds = new Set((args.get("force-concepts") ?? "").split(",").map(value => value.trim()).filter(Boolean));
const batchId = args.get("batch-id") ?? "ppa-ead-cache-2026-09-04-a";

if (!Number.isInteger(requestedRound) || requestedRound < 0 || requestedRound > CACHE_WARMUP_TARGET_PER_CONCEPT) {
  throw new Error(`Use --round=1..${CACHE_WARMUP_TARGET_PER_CONCEPT} ou --round=0 para executar todas as rodadas.`);
}

async function readState() {
  try { return JSON.parse(await readFile(statePath, "utf8")); } catch { return { startedAt: new Date().toISOString(), concepts: {} }; }
}
const state = await readState();
await mkdir(dirname(statePath), { recursive: true });
async function checkpoint() {
  state.updatedAt = new Date().toISOString();
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function presentFeedback(item) {
  return Boolean(item.feedbackCorrectMarkdown && item.feedbackIncorrectMarkdown && item.feedbackTeachMarkdown);
}

async function hydrateExistingFeedback({ item, concept, evidence }) {
  const details = { A: item.optionA, B: item.optionB, C: item.optionC };
  const missing = [
    ["correct", "A", item.feedbackCorrectMarkdown],
    ["incorrect", item.correctOption === "A" ? "B" : "A", item.feedbackIncorrectMarkdown],
    ["me_ensine", "ME_ENSINE", item.feedbackTeachMarkdown],
  ];
  for (const [classification, answer, existing] of missing) {
    if (existing) continue;
    const feedback = await generateFeedback({
      prompt: item.prompt,
      options: details,
      correctOption: item.correctOption,
      answer,
      classification,
      sourceContext: evidence.context,
    });
    await storeCachedFeedback(item.id, classification, feedback);
    if (classification === "correct") item.feedbackCorrectMarkdown = feedback;
    if (classification === "incorrect") item.feedbackIncorrectMarkdown = feedback;
    if (classification === "me_ensine") item.feedbackTeachMarkdown = feedback;
  }
}

async function warmConcept({ concept, catalog, round, forceAdditionalItem = false }) {
  const evidence = await retrieveRagEvidence([concept]);
  let items = await listApprovedCacheForConcept({ catalogVersionId: catalog.id, conceptId: concept.id, ragSourceId: evidence.sourceId });
  for (const item of items) {
    if (!presentFeedback(item)) await hydrateExistingFeedback({ item, concept, evidence });
  }
  let attempts = 0;
  let lastGenerationError;
  const targetCount = forceAdditionalItem ? items.length + 1 : round;
  while (items.length < targetCount && attempts < 6) {
    attempts += 1;
    try {
      const bundle = await generateCacheBundle({
        concept,
        cacheVariant: items.length + 1,
        avoidPrompts: items.map(item => item.prompt),
        sourceContext: evidence.context,
      });
      const stored = await storeSharedQuestion({
        catalogVersionId: catalog.id,
        conceptId: concept.id,
        ragSourceId: evidence.sourceId,
        ragSourceChecksum: evidence.sourceChecksum,
        ragChunkIds: evidence.chunkIds,
        prompt: bundle.prompt,
        optionA: bundle.optionA,
        optionB: bundle.optionB,
        optionC: bundle.optionC,
        correctOption: bundle.correctOption,
        validationNote: bundle.validationNote,
        warmup: { batchId, wave: round },
      });
      if (!stored) throw new Error("A questão gerada não pôde ser persistida no cache.");
      await storeCachedFeedback(stored.id, "correct", bundle.feedbackCorrectMarkdown);
      await storeCachedFeedback(stored.id, "incorrect", bundle.feedbackIncorrectMarkdown);
      await storeCachedFeedback(stored.id, "me_ensine", bundle.feedbackTeachMarkdown);
      items = await listApprovedCacheForConcept({ catalogVersionId: catalog.id, conceptId: concept.id, ragSourceId: evidence.sourceId });
    } catch (error) {
      lastGenerationError = error;
      console.warn(JSON.stringify({ event: "concept_retry", conceptId: concept.id, attempt: attempts, error: error instanceof Error ? error.message.slice(0, 280) : String(error).slice(0, 280) }));
    }
  }
  if (!isWarmupComplete(items.length, targetCount)) {
    throw new Error(`O conceito ${concept.id} permaneceu com ${items.length}/${targetCount} itens após tentativas de geração. ${lastGenerationError instanceof Error ? lastGenerationError.message : ""}`);
  }
  return { count: items.length, feedbackReady: items.slice(0, round).every(presentFeedback) };
}

async function runPool(items, callback) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(workers, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      const item = items[index];
      if (!item) return;
      await callback(item, index);
    }
  });
  await Promise.all(runners);
}

const { catalog, concepts } = await listCacheWarmupConcepts();
if (concepts.length !== 872) throw new Error(`O catálogo esperado contém 872 conceitos; foram encontrados ${concepts.length}.`);
const rounds = warmupRoundPlan(concepts.length).filter(wave => requestedRound === 0 || wave.round === requestedRound);
console.log(JSON.stringify({ dryRun, workers, concepts: concepts.length, targetPerConcept: CACHE_WARMUP_TARGET_PER_CONCEPT, plannedItems: rounds.reduce((total, wave) => total + wave.plannedItems, 0), rounds }, null, 2));
if (dryRun) process.exit(0);

for (const wave of rounds) {
  const selectedConcepts = forceConceptIds.size ? concepts.filter(concept => forceConceptIds.has(concept.id)) : concepts;
  if (forceConceptIds.size && selectedConcepts.length !== forceConceptIds.size) throw new Error("Um ou mais conceitos forçados não pertencem ao catálogo atual.");
  const selected = limit ? selectedConcepts.slice(0, limit) : selectedConcepts;
  let completed = 0;
  let failed = 0;
  console.log(JSON.stringify({ event: "wave_started", batchId, round: wave.round, concepts: selected.length, at: new Date().toISOString() }));
  await runPool(selected, async (concept, index) => {
    try {
      const result = await warmConcept({ concept, catalog, round: wave.round, forceAdditionalItem: forceConceptIds.has(concept.id) });
      state.concepts[concept.id] = { round: wave.round, status: "complete", count: result.count, feedbackReady: result.feedbackReady, updatedAt: new Date().toISOString() };
      completed += 1;
    } catch (error) {
      failed += 1;
      state.concepts[concept.id] = { round: wave.round, status: "failed", error: error instanceof Error ? error.message : String(error), updatedAt: new Date().toISOString() };
    }
    if ((index + 1) % 10 === 0 || index + 1 === selected.length) {
      await checkpoint();
      console.log(JSON.stringify({ event: "wave_progress", round: wave.round, completed, failed, processed: index + 1, total: selected.length }));
    }
  });
  await checkpoint();
  if (failed) throw new Error(`A rodada ${wave.round} terminou com ${failed} conceitos pendentes; corrija e execute novamente a mesma rodada.`);
  console.log(JSON.stringify({ event: "wave_complete", round: wave.round, completed, failed, at: new Date().toISOString() }));
}

process.exit(0);
