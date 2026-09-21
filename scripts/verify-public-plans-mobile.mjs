import { writeFile } from "node:fs/promises";

const base = "http://127.0.0.1:3000";
const email = `public-plans-mobile-${Date.now()}@example.test`;
const password = "SenhaSegura2026";
const browserInfo = await (await fetch("http://127.0.0.1:9222/json/version")).json();
const socket = new WebSocket(browserInfo.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", event => { const message = JSON.parse(event.data); const callback = pending.get(message.id); if (callback) { pending.delete(message.id); callback(message); } });
function command(method, params = {}, sessionId) { const id = ++sequence; socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); return new Promise((resolve, reject) => pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result))); }
const context = await command("Target.createBrowserContext");
const page = await command("Target.createTarget", { url: base, browserContextId: context.browserContextId });
const attached = await command("Target.attachToTarget", { targetId: page.targetId, flatten: true });
const sessionId = attached.sessionId;
async function evaluate(expression) { const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId); return result.result.value; }
async function waitFor(expression, timeout = 30_000) { const deadline = Date.now() + timeout; let lastError = ""; while (Date.now() < deadline) { try { if (await evaluate(expression)) return; } catch (error) { lastError = error instanceof Error ? error.message : String(error); } await new Promise(resolve => setTimeout(resolve, 150)); } throw new Error(`Tempo excedido: ${expression}; ${lastError}`); }
async function snapshot() { return JSON.parse(await evaluate(`JSON.stringify({ url: location.pathname, access: Boolean(document.querySelector('.auth-hero')), publicPlans: document.body.innerText.includes('Acesso experimental em curso'), cards: Array.from(document.querySelectorAll('article')).filter(card => card.textContent?.includes('Habilitar')).length, disabled: Array.from(document.querySelectorAll('button')).filter(button => button.textContent?.includes('Habilitar') && button.disabled).length })`)); }

try {
  await command("Page.enable", {}, sessionId);
  await command("Runtime.enable", {}, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await command("Page.reload", { ignoreCache: true }, sessionId);
  await waitFor("Boolean(document.querySelector('.auth-hero'))");
  const initial = await snapshot();
  await evaluate(`document.querySelector('a[href="/planos"]')?.click()`);
  await waitFor("location.pathname === '/planos' && document.body.innerText.includes('Acesso experimental em curso')");
  const plans = await snapshot();
  if (plans.cards !== 5 || plans.disabled !== 5) throw new Error(`Planos móveis inválidos: ${JSON.stringify(plans)}`);
  const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId);
  await writeFile("/tmp/ppa-public-plans-mobile-navigation.png", Buffer.from(screenshot.data, "base64"));
  await evaluate(`document.querySelector('a[href="/"]')?.click()`);
  await waitFor("location.pathname === '/' && Boolean(document.querySelector('.auth-hero'))");
  const returned = await snapshot();
  if (!initial.access || !returned.access) throw new Error(`Retorno móvel inválido: ${JSON.stringify({ initial, returned })}`);
  console.log(JSON.stringify({ email, initial, plans, returned }, null, 2));
} finally {
  try { await command("Target.closeTarget", { targetId: page.targetId }); } catch { /* Context is temporary. */ }
  try { await command("Target.disposeBrowserContext", { browserContextId: context.browserContextId }); } catch { /* Context is temporary. */ }
  socket.close();
}
