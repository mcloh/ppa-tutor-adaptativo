import { writeFile } from "node:fs/promises";

const base = process.env.PPA_BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
const users = ["a", "b"].map(label => ({ name: `Validação RAG ${label.toUpperCase()}`, email: `rag-cache-${label}-${stamp}@example.test`, password: "SenhaSegura2026" }));

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

try {
  const registeredA = await rpc("auth.register", { ...users[0], passwordConfirmation: users[0].password });
  const firstQuestion = await rpc("study.current", null, registeredA.cookie);
  if (!firstQuestion.json?.id || !firstQuestion.json?.prompt) throw new Error("A questão RAG não foi entregue.");
  if (JSON.stringify(firstQuestion.json).match(/correctOption|conceptIds|pedagogicalAction|ragSource|cacheQuestion/)) throw new Error("Metadado interno vazou no contrato de questão.");

  const feedbackA = await rpc("study.answer", { questionId: firstQuestion.json.id, answer: "ME_ENSINE" }, registeredA.cookie);
  if (feedbackA.json?.classification !== "Me ensine" || !feedbackA.json?.feedbackMarkdown) throw new Error("O feedback de Me ensine não foi produzido.");
  if (/origem:|sourcepath|ragsource|chunkid|checksum|\.png|\.zip/i.test(feedbackA.json.feedbackMarkdown)) throw new Error("O retorno público expôs metadado RAG.");

  const registeredB = await rpc("auth.register", { ...users[1], passwordConfirmation: users[1].password });
  const cachedQuestion = await rpc("study.current", null, registeredB.cookie);
  if (cachedQuestion.json?.prompt !== firstQuestion.json.prompt) throw new Error("A segunda conta não recuperou a questão compartilhada esperada.");
  if (cachedQuestion.json?.id === firstQuestion.json.id) throw new Error("A entrega por aluno não foi individualizada.");

  const feedbackB = await rpc("study.answer", { questionId: cachedQuestion.json.id, answer: "ME_ENSINE" }, registeredB.cookie);
  if (feedbackB.json?.feedbackMarkdown !== feedbackA.json.feedbackMarkdown) throw new Error("A explicação compartilhada não foi reutilizada.");
  await writeFile("/tmp/ppa-rag-cache-test-emails.txt", users.map(user => user.email).join("\n"));
  console.log(JSON.stringify({ ragGroundedQuestion: true, reusedAcrossUsers: true, uniqueDeliveryIds: true, reusedTeachingFeedback: true, publicPayloadProtected: true }, null, 2));
} catch (error) {
  await writeFile("/tmp/ppa-rag-cache-test-emails.txt", users.map(user => user.email).join("\n"));
  throw error;
}
