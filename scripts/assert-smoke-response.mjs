import { readFile } from "node:fs/promises";

const headers = await readFile("/tmp/ppa-smoke-headers.txt", "utf8");
const payload = await readFile("/tmp/ppa-smoke-question.json", "utf8");
const forbidden = ["correctOption", "conceptIds", "pedagogicalAction", "validationJson"];

if (!headers.includes("ppa_session=")) throw new Error("Cookie de sessão não retornado.");
if (forbidden.some(key => payload.includes(key))) throw new Error("Metadado sensível foi exposto no payload público.");

const decoded = JSON.parse(payload);
const question = decoded[0]?.result?.data?.json;
if (!question?.id || question.alternatives?.length !== 4) throw new Error("Contrato público de questão inválido.");

console.log(JSON.stringify({
  sessionCookie: true,
  questionNumber: question.number,
  alternatives: question.alternatives.map(alternative => alternative.key),
  noSensitiveMetadata: true,
}, null, 2));
