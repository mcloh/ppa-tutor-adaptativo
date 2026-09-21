import { writeFile } from "node:fs/promises";

const base = "http://localhost:3000";
const email = `ui-capture-${Date.now()}@example.test`;
const password = "SenhaSegura2026";

const version = await (await fetch("http://127.0.0.1:9222/json/version")).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", event => { const message = JSON.parse(event.data); const handler = pending.get(message.id); if (handler) { pending.delete(message.id); handler(message); } });
function rootCommand(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
}
const browserContextId = (await rootCommand("Target.createBrowserContext")).browserContextId;
const targetId = (await rootCommand("Target.createTarget", { url: "about:blank", browserContextId })).targetId;
const sessionId = (await rootCommand("Target.attachToTarget", { targetId, flatten: true })).sessionId;
function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
}
async function evaluate(expression) { return (await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value; }
async function waitFor(expression, timeout = 30_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 250)); }
  const body = await evaluate("document.body?.innerText?.slice(0, 500) ?? document.readyState");
  throw new Error(`Tempo esgotado: ${expression}; conteúdo atual: ${body}`);
}
async function capture(path) { const image = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); await writeFile(path, Buffer.from(image.data, "base64")); }
function assertLayout(label, values, predicate) { if (!predicate(values)) throw new Error(`Contrato visual inválido em ${label}: ${JSON.stringify(values)}`); }

try {
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await command("Page.navigate", { url: base });
  await waitFor("document.body.innerText.includes('CRIAR CONTA')");
  const registered = await evaluate(`(async () => { const r = await fetch('/api/trpc/auth.register?batch=1', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 0: { json: { name: 'Captura Visual', email: '${email}', password: '${password}', passwordConfirmation: '${password}' } } }) }); return await r.text(); })()`);
  if (registered.includes('error')) throw new Error(`Cadastro visual falhou: ${registered}`);
  await command("Page.reload", { ignoreCache: true });
  await waitFor("document.body.innerText.includes('Questão')");
  const desktopStudy = await evaluate(`(() => { const card = document.querySelector('.cad-frame'); return { viewport: innerWidth, cardWidth: Math.round(card?.getBoundingClientRect().width ?? 0), sidebar: getComputedStyle(document.querySelector('aside')).display, answers: document.querySelectorAll('[role="radio"]').length, primaryAction: Boolean(Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Enviar resposta'))) }; })()`);
  assertLayout("estudo desktop", desktopStudy, value => value.viewport >= 1200 && value.cardWidth > 600 && value.sidebar !== "none" && value.answers === 4 && value.primaryAction);
  await capture("/tmp/ppa-study-desktop.png");
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Me ensine'))?.click()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Enviar resposta'))?.click()`);
  await waitFor("document.body.innerText.includes('RESULTADO REGISTRADO')");
  const desktopFeedback = await evaluate(`(() => ({ feedbackVisible: document.body.innerText.includes('RESULTADO REGISTRADO'), nextAction: Boolean(Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Próxima questão'))) }))()`);
  assertLayout("retorno desktop", desktopFeedback, value => value.feedbackVisible && value.nextAction);
  await capture("/tmp/ppa-feedback-desktop.png");
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Prontidão'))?.click()`);
  await waitFor("document.body.innerText.includes('Evidências, cobertura e próxima ação')");
  const desktopDashboard = await evaluate(`(() => ({ dashboardVisible: document.body.innerText.includes('Evidências, cobertura e próxima ação'), metrics: document.querySelectorAll('main .cad-frame').length, sidebar: getComputedStyle(document.querySelector('aside')).display }))()`);
  assertLayout("dashboard desktop", desktopDashboard, value => value.dashboardVisible && value.metrics >= 5 && value.sidebar !== "none");
  await capture("/tmp/ppa-dashboard-desktop.png");
  await command("Emulation.setDeviceMetricsOverride", { width: 768, height: 1024, deviceScaleFactor: 1, mobile: true });
  await command("Page.reload", { ignoreCache: true });
  await waitFor("document.body.innerText.includes('Questão')");
  const tabletStudy = await evaluate(`(() => { const card = document.querySelector('.cad-frame'); return { viewport: innerWidth, cardWidth: Math.round(card?.getBoundingClientRect().width ?? 0), mobileHeader: getComputedStyle(document.querySelector('header')).display, sidebar: getComputedStyle(document.querySelector('aside')).display, answers: document.querySelectorAll('[role="radio"]').length }; })()`);
  assertLayout("estudo tablet", tabletStudy, value => value.viewport === 768 && value.cardWidth > 500 && value.sidebar === "none" && value.answers === 4);
  await capture("/tmp/ppa-study-tablet.png");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command("Page.reload", { ignoreCache: true });
  await waitFor("document.body.innerText.includes('Questão')");
  const mobileStudy = await evaluate(`(() => { const card = document.querySelector('.cad-frame'); const header = document.querySelector('header') ?? document.body; const sidebar = document.querySelector('aside') ?? document.body; return { viewport: innerWidth, cardWidth: Math.round(card?.getBoundingClientRect().width ?? 0), mobileHeader: getComputedStyle(header).display, sidebar: getComputedStyle(sidebar).display, answers: document.querySelectorAll('[role="radio"]').length }; })()`);
  assertLayout("estudo móvel", mobileStudy, value => value.viewport === 390 && value.cardWidth <= 390 && value.mobileHeader !== "none" && value.sidebar === "none" && value.answers === 4);
  await capture("/tmp/ppa-study-mobile.png");
  await writeFile("/tmp/ppa-ui-capture-email.txt", email);
  console.log(JSON.stringify({ screenshots: ["study-desktop", "feedback-desktop", "dashboard-desktop", "study-tablet", "study-mobile"], layouts: { desktopStudy, desktopFeedback, desktopDashboard, tabletStudy, mobileStudy }, email }, null, 2));
} finally {
  try { socket.send(JSON.stringify({ id: ++sequence, method: "Target.closeTarget", params: { targetId } })); } catch { /* conexão já encerrada */ }
  try { socket.send(JSON.stringify({ id: ++sequence, method: "Target.disposeBrowserContext", params: { browserContextId } })); } catch { /* conexão já encerrada */ }
  socket.close();
}
