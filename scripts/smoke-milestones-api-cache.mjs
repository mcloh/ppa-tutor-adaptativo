import { createHash } from "node:crypto";
import mysql from "mysql2/promise";

const base = process.env.PPA_BASE_URL ?? "http://localhost:3000";
const runId = `test_api_e2e_${Date.now()}`;
const email = `milestone-cache-${Date.now()}@example.test`;
const user = { name: "Validação API de marcos", email, password: "SenhaSegura2026" };
const hash = value => createHash("sha256").update(value).digest("hex");

async function rpc(path, body, cookie) {
  const response = await fetch(`${base}/api/trpc/${path}?batch=1`, {
    method: body ? "POST" : "GET",
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify({ 0: { json: body } }) : undefined,
  });
  const payload = await response.json();
  const error = payload[0]?.error?.json;
  if (error) throw new Error(`${path}: ${error.message}`);
  return { json: payload[0]?.result?.data?.json, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

const db = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [[template]] = await db.execute("SELECT * FROM shared_question_cache WHERE status = 'approved' ORDER BY createdAt ASC LIMIT 1");
  const [concepts] = await db.execute("SELECT id FROM canonical_concepts WHERE catalogVersionId = ? ORDER BY canonicalIndex ASC", [template.catalogVersionId]);
  if (!template || concepts.length < 100) throw new Error("Não há catálogo ou item de cache aprovado para a prova de API.");
  const seed = [];
  for (const concept of concepts) {
    const id = `${runId}_${hash(concept.id).slice(0, 24)}`;
    seed.push([
      id, template.catalogVersionId, concept.id, template.ragSourceId, template.ragSourceChecksum, template.ragChunkIdsJson,
      `${runId}_${hash(concept.id).slice(0, 32)}`, `Questão temporária de validação para o conceito ${concept.id}.`, "Alternativa técnica A", "Alternativa técnica B", "Alternativa técnica C",
      "A", "{\"validation\":\"temporary-api-smoke\"}",
      "**correct:** Resposta confirmada.", "**incorrect:** Revise a alternativa correta.", "**Me ensine:** Retome o conceito.",
    ]);
  }
  for (const row of seed) {
    await db.execute(
      "INSERT INTO shared_question_cache (id, catalogVersionId, conceptId, ragSourceId, ragSourceChecksum, ragChunkIdsJson, questionSignature, prompt, optionA, optionB, optionC, correctOption, validationJson, feedbackCorrectMarkdown, feedbackIncorrectMarkdown, feedbackTeachMarkdown, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')",
      row
    );
  }

  const registered = await rpc("auth.register", { ...user, passwordConfirmation: user.password });
  const milestones = [];
  for (let expected = 1; expected <= 100; expected += 1) {
    const question = await rpc("study.current", null, registered.cookie);
    if (question.json?.number !== expected) throw new Error(`Sequência inválida: era esperada a questão ${expected}.`);
    const result = await rpc("study.answer", { questionId: question.json.id, answer: template.correctOption }, registered.cookie);
    if (expected % 20 === 0) {
      const expectedType = expected === 100 ? "diagnostic_100" : "partial_20";
      if (result.json?.assessment?.type !== expectedType || !result.json.assessment.contentMarkdown?.includes("Registro auditável do marco")) throw new Error(`O marco ${expected} não retornou relatório auditável.`);
      milestones.push(expected);
    }
  }
  if (milestones.join(",") !== "20,40,60,80,100") throw new Error("Os marcos previstos não foram disparados.");
  const [[userRow]] = await db.execute("SELECT id FROM users WHERE email = ?", [email]);
  const [[assessmentRow]] = await db.execute("SELECT COUNT(*) AS count, SUM(assessmentType = 'diagnostic_100') AS diagnostics FROM progress_assessments WHERE userId = ?", [userRow.id]);
  const [[planRow]] = await db.execute("SELECT COUNT(*) AS count, MAX(sourceMapVersion) AS sourceMapVersion FROM study_plans WHERE userId = ?", [userRow.id]);
  if (Number(assessmentRow.count) !== 5 || Number(assessmentRow.diagnostics) !== 1) throw new Error("As cinco avaliações de marco não foram persistidas pelo fluxo de API.");
  if (Number(planRow.count) !== 1 || !planRow.sourceMapVersion) throw new Error("O plano de estudo versionado do marco 100 não foi persistido.");
  console.log(JSON.stringify({ apiOnlyStudentFlow: true, temporaryCacheSeeded: true, auditedMilestones: milestones, assessmentsPersisted: Number(assessmentRow.count), versionedPlanPersisted: Number(planRow.count) === 1, diagnosticReturned: true }, null, 2));
} finally {
  await db.execute("DELETE FROM users WHERE email = ?", [email]);
  await db.execute("DELETE FROM shared_question_cache WHERE id LIKE ?", [`${runId}_%`]);
  await db.end();
}
