import { writeFile } from "node:fs/promises";

const base = "http://127.0.0.1:3000";
const email = `next-transition-${Date.now()}@example.test`;
const password = "SenhaSegura2026";
const target = await (await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(base)}`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0;
const pending = new Map();
let interceptNextQuestion = false;
let pausedRequestId = null;
let pauseSignal;
const pauseReady = new Promise(resolve => { pauseSignal = resolve; });
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (message.method === "Fetch.requestPaused") {
    const paused = message.params;
    if (interceptNextQuestion && paused.request.url.includes("/api/trpc/study.current")) {
      pausedRequestId = paused.requestId;
      pauseSignal();
    } else {
      socket.send(JSON.stringify({ id: ++sequence, method: "Fetch.continueRequest", params: { requestId: paused.requestId } }));
    }
    return;
  }
  const handler = pending.get(message.id);
  if (handler) { pending.delete(message.id); handler(message); }
});
function command(method, params = {}) { const id = ++sequence; socket.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result))); }
async function evaluate(expression) { return (await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value; }
async function waitFor(expression, timeout = 30_000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Tempo excedido: ${expression}`); }
async function capture(path) { const shot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); await writeFile(path, Buffer.from(shot.data, "base64")); }

try {
  await command("Page.enable"); await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await waitFor("Boolean(document.querySelector('.auth-hero') && document.querySelector('#password-confirmation'))");
  const register = await evaluate(`(async () => { const response = await fetch('/api/trpc/auth.register?batch=1', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 0: { json: { name: 'Validação de transição', email: '${email}', password: '${password}', passwordConfirmation: '${password}' } } }) }); return await response.text(); })()`);
  if (register.includes("error")) throw new Error(`Cadastro de teste falhou: ${register}`);
  await command("Page.reload", { ignoreCache: true });
  await waitFor("document.body.innerText.includes('Questão')");
  const previousPrompt = await evaluate("document.querySelector('[role=\"radiogroup\"]')?.previousElementSibling?.innerText ?? ''");
  await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Me ensine'))?.click()");
  await waitFor("!Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Enviar resposta'))?.disabled");
  await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Enviar resposta'))?.click()");
  await waitFor("document.body.innerText.includes('RESULTADO REGISTRADO')");
  await command("Fetch.enable", { patterns: [{ urlPattern: "*api/trpc/study.current*", requestStage: "Request" }] });
  interceptNextQuestion = true;
  await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Próxima questão'))?.click()");
  await Promise.race([pauseReady, new Promise((_, reject) => setTimeout(() => reject(new Error('A busca da próxima questão não foi iniciada.')), 10_000))]);
  await waitFor("document.body.innerText.includes('Calculando seu próximo conceito.')");
  const interim = {
    loadingVisible: await evaluate("document.body.innerText.includes('Calculando seu próximo conceito.')"),
    previousPromptHidden: await evaluate(`!document.body.innerText.includes(${JSON.stringify(previousPrompt)})`),
    retryUnavailableDuringLoading: await evaluate("!document.body.innerText.includes('Tentar novamente')"),
  };
  if (!interim.loadingVisible || !interim.previousPromptHidden || !interim.retryUnavailableDuringLoading) throw new Error(`Estado intermediário inválido: ${JSON.stringify(interim)}`);
  await new Promise(resolve => setTimeout(resolve, 280));
  const visual = JSON.parse(await evaluate(`JSON.stringify((() => { const panel = document.querySelector('.cad-frame'); const heading = Array.from(document.querySelectorAll('h1')).find(item => item.textContent?.includes('Calculando seu próximo conceito.')); const description = Array.from(document.querySelectorAll('p')).find(item => item.textContent?.includes('Atualizando o mapa de prontidão')); const panelStyle = panel ? getComputedStyle(panel) : null; const headingStyle = heading ? getComputedStyle(heading) : null; const descriptionStyle = description ? getComputedStyle(description) : null; return { panelPresent: Boolean(panel), panelBackground: panelStyle?.backgroundColor ?? '', panelShadow: panelStyle?.boxShadow ?? '', panelHeight: Math.round(panel?.getBoundingClientRect().height ?? 0), headingColor: headingStyle?.color ?? '', descriptionColor: descriptionStyle?.color ?? '', descriptionVisible: Boolean(description) }; })())`));
  const opaqueBlueprintBackground = (/rgba?\(7, 27, 80/.test(visual.panelBackground) || visual.panelBackground.startsWith("oklab(")) && visual.panelBackground.includes("0.95");
  const readablePanel = visual.panelPresent && visual.panelHeight >= 240 && opaqueBlueprintBackground && visual.panelShadow !== "none" && visual.headingColor === "rgb(255, 255, 255)" && visual.descriptionColor !== "rgba(0, 0, 0, 0)" && visual.descriptionVisible;
  if (!readablePanel) throw new Error(`Painel de carregamento móvel sem contraste verificável: ${JSON.stringify(visual)}`);
  await capture("/tmp/ppa-next-question-loading-mobile.png");
  interceptNextQuestion = false;
  await command("Fetch.continueRequest", { requestId: pausedRequestId });
  await waitFor("document.body.innerText.includes('Questão') && !document.body.innerText.includes('Calculando seu próximo conceito.')");
  const finalQuestionVisible = await evaluate("document.querySelectorAll('[role=\"radio\"]').length === 4");
  if (!finalQuestionVisible) throw new Error("A nova questão não foi apresentada após o carregamento.");
  const report = { mobileTransitionLoading: true, previousPromptHidden: true, newQuestionVisible: true, visual, email };
  await writeFile("/tmp/ppa-next-transition-report.json", JSON.stringify(report, null, 2));
  await writeFile("/tmp/ppa-next-transition-email.txt", email);
  console.log(JSON.stringify(report, null, 2));
} finally { socket.close(); }
