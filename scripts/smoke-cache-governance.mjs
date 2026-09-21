import mysql from "mysql2/promise";

const base = process.env.PPA_BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
const users = ["owner", "student"].map(label => ({ name: `Governança ${label}`, email: `cache-gov-${label}-${stamp}@example.test`, password: "SenhaSegura2026" }));

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
  const owner = await rpc("auth.register", { ...users[0], passwordConfirmation: users[0].password });
  await db.execute("UPDATE users SET role = 'admin' WHERE email = ?", [users[0].email]);
  const ownerQuestion = await rpc("study.current", null, owner.cookie);
  const [mapping] = await db.execute("SELECT cacheQuestionId FROM study_questions WHERE id = ? LIMIT 1", [ownerQuestion.json.id]);
  const cacheQuestionId = mapping[0]?.cacheQuestionId;
  if (!cacheQuestionId) throw new Error("A questão real não foi vinculada ao cache.");
  await rpc("study.answer", { questionId: ownerQuestion.json.id, answer: "ME_ENSINE" }, owner.cookie);
  const metrics = await rpc("cacheAdmin.metrics", null, owner.cookie);
  const metric = metrics.json.find(item => item.id === cacheQuestionId);
  if (!metric || Number(metric.teachDeliveries) < 1) throw new Error("A métrica de Me ensine não foi incrementada após resposta real.");
  await rpc("cacheAdmin.retire", { cacheQuestionId, reason: "Validação técnica controlada de retirada do cache." }, owner.cookie);
  const [retired] = await db.execute("SELECT status, retiredReason FROM shared_question_cache WHERE id = ? LIMIT 1", [cacheQuestionId]);
  if (retired[0]?.status !== "retired" || !retired[0]?.retiredReason) throw new Error("O item não foi retirado de forma auditável.");

  const student = await rpc("auth.register", { ...users[1], passwordConfirmation: users[1].password });
  const studentQuestion = await rpc("study.current", null, student.cookie);
  const [reuse] = await db.execute("SELECT COUNT(*) AS count FROM study_questions WHERE id = ? AND cacheQuestionId = ?", [studentQuestion.json.id, cacheQuestionId]);
  if (Number(reuse[0]?.count) !== 0) throw new Error("Um item retirado voltou a ser selecionado.");
  console.log(JSON.stringify({ metricsUpdatedByRealAnswer: true, adminMetricsAvailable: true, retiredItemBlockedFromSelection: true }, null, 2));
} finally {
  await db.execute("DELETE FROM users WHERE email LIKE ?", [`cache-gov-%-${stamp}@example.test`]);
  await db.end();
}
