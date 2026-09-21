import { writeFile } from "node:fs/promises";

const base = process.env.PPA_BASE_URL ?? "http://localhost:3000";
const user = { name: "Validação API de marcos", email: `milestone-api-${Date.now()}@example.test`, password: "SenhaSegura2026" };

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

await writeFile("/tmp/ppa-milestone-api-email.txt", user.email);
const registered = await rpc("auth.register", { ...user, passwordConfirmation: user.password });
const milestones = [];
for (let expected = 1; expected <= 100; expected += 1) {
  const question = await rpc("study.current", null, registered.cookie);
  if (question.json?.number !== expected) throw new Error(`Sequência inválida: era esperada a questão ${expected}.`);
  const result = await rpc("study.answer", { questionId: question.json.id, answer: "ME_ENSINE" }, registered.cookie);
  if (expected % 20 === 0) {
    const expectedType = expected === 100 ? "diagnostic_100" : "partial_20";
    if (result.json?.assessment?.type !== expectedType || !result.json.assessment.contentMarkdown?.includes("Registro auditável do marco")) {
      throw new Error(`O marco ${expected} não retornou relatório auditável.`);
    }
    milestones.push(expected);
  }
}
if (milestones.join(",") !== "20,40,60,80,100") throw new Error("Os marcos previstos não foram disparados.");
console.log(JSON.stringify({ apiOnly: true, auditedMilestones: milestones, diagnosticReturned: true }, null, 2));
