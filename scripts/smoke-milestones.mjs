import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";

const base = process.env.PPA_BASE_URL ?? "http://localhost:3000";
const email = `milestone-${Date.now()}@example.test`;
const user = { name: "Validação de marcos", email, password: "SenhaSegura2026" };

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

const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const registered = await rpc("auth.register", { ...user, passwordConfirmation: user.password });
  const firstQuestion = await rpc("study.current", null, registered.cookie);
  const [rows] = await connection.execute(
    "SELECT q.*, s.id AS activeSessionId FROM study_questions q INNER JOIN study_sessions s ON s.id = q.sessionId WHERE q.id = ? LIMIT 1",
    [firstQuestion.json.id]
  );
  const template = rows[0];
  if (!template) throw new Error("A questão base não foi encontrada.");
  for (let number = 2; number <= 100; number += 1) {
    await connection.execute(
      "INSERT INTO study_questions (id, userId, sessionId, questionNumber, prompt, optionA, optionB, optionC, correctOption, conceptIdsJson, pedagogicalAction, validationJson, cacheQuestionId, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, 'presented')",
      [`test_${randomUUID().replaceAll("-", "")}`, template.userId, template.activeSessionId, number, template.prompt, template.optionA, template.optionB, template.optionC, template.correctOption, template.conceptIdsJson, template.validationJson, template.cacheQuestionId]
    );
  }

  let partial = null;
  let diagnostic = null;
  const [questionRows] = await connection.execute("SELECT id, questionNumber FROM study_questions WHERE userId = ? ORDER BY questionNumber ASC", [template.userId]);
  for (const question of questionRows) {
    const result = await rpc("study.answer", { questionId: question.id, answer: "ME_ENSINE" }, registered.cookie);
    if (question.questionNumber === 20) partial = result.json.assessment;
    if (question.questionNumber === 100) diagnostic = result.json.assessment;
  }
  if (partial?.type !== "partial_20" || !partial.contentMarkdown?.includes("Registro auditável do marco")) throw new Error("O marco 20 não retornou avaliação auditável.");
  if (diagnostic?.type !== "diagnostic_100" || !diagnostic.contentMarkdown?.includes("Registro auditável do marco")) throw new Error("O marco 100 não retornou avaliação auditável.");
  const [checks] = await connection.execute("SELECT (SELECT COUNT(*) FROM progress_assessments WHERE userId = ? AND endQuestionNumber IN (20, 100)) AS targetMilestones, (SELECT COUNT(*) FROM progress_assessments WHERE userId = ?) AS assessments, (SELECT COUNT(*) FROM study_plans WHERE userId = ?) AS plans", [template.userId, template.userId, template.userId]);
  if (Number(checks[0].targetMilestones) !== 2 || Number(checks[0].assessments) !== 5 || Number(checks[0].plans) !== 1) throw new Error(`A persistência de avaliação ou plano não foi concluída: ${JSON.stringify(checks[0])}`);
  console.log(JSON.stringify({ milestone20: "audited", milestone100: "audited", versionedPlan: true, persistedAssessments: Number(checks[0].assessments) }, null, 2));
} finally {
  await connection.execute("DELETE FROM users WHERE email = ?", [email]);
  await connection.end();
}
