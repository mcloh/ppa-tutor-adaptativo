import { writeFile } from "node:fs/promises";

const base = "http://127.0.0.1:3000";
const runId = Date.now();
const email = `plans-ui-${runId}@example.test`;
const password = "SenhaSegura2026";
const target = await (await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(base)}`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", event => { const message = JSON.parse(event.data); const handler = pending.get(message.id); if (handler) { pending.delete(message.id); handler(message); } });
function command(method, params = {}) { const id = ++sequence; socket.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result))); }
async function evaluate(expression) { const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); return result.result.value; }
async function waitFor(expression, timeout = 30_000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 150)); } throw new Error(`Tempo excedido: ${expression}`); }
async function capture(name) { const shot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); await writeFile(`/tmp/ppa-plans-${name}.png`, Buffer.from(shot.data, "base64")); }
async function snapshot() { return JSON.parse(await evaluate(`JSON.stringify((() => { const cards = Array.from(document.querySelectorAll('article')).filter(card => card.textContent?.includes('Habilitar')); const disabled = Array.from(document.querySelectorAll('button')).filter(button => button.textContent?.includes('Habilitar') && button.disabled); return { width: innerWidth, notice: document.body.innerText.includes('Acesso experimental em curso'), cards: cards.length, disabled: disabled.length, free: document.body.innerText.includes('Gratuito'), prices: ['R$ 4,90', 'R$ 14,90', 'R$ 24,90', 'R$ 44,90'].every(value => document.body.innerText.includes(value)), simulations: document.body.innerText.includes('30 simulados'), title: document.body.innerText.includes('Escolha a sua próxima etapa de voo.') }; })())`)); }
async function openPlans() {
  const mobile = await evaluate("innerWidth < 1024");
  if (mobile) {
    await evaluate("document.querySelector('button[aria-label=\"Abrir navegação\"]')?.click()");
    await waitFor("Array.from(document.querySelectorAll('button')).some(button => button.textContent?.trim() === 'Planos')");
  }
  const navigationResult = JSON.parse(await evaluate(`JSON.stringify((() => { const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent?.trim() === 'Planos'); const labels = Array.from(document.querySelectorAll('button')).map(item => item.textContent?.trim()).filter(Boolean); button?.click(); return { clicked: Boolean(button), labels }; })())`));
  if (!navigationResult.clicked) {
    const pageState = await evaluate("JSON.stringify({ ready: document.readyState, text: document.body.innerText.slice(0, 1000), buttons: document.querySelectorAll('button').length, html: document.documentElement.innerHTML.slice(0, 500) })");
    throw new Error(`Botão Planos não encontrado: ${JSON.stringify(navigationResult.labels)}; estado=${pageState}`);
  }
  await new Promise(resolve => setTimeout(resolve, 350));
  try {
    await waitFor("document.body.innerText.includes('Acesso experimental em curso')");
  } catch (error) {
    const body = await evaluate("document.body.innerText.slice(0, 1200)");
    throw new Error(`Página de planos não renderizou: ${body}`);
  }
}

try {
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Page.navigate", { url: base });
  await waitFor("document.readyState === 'complete' && document.body.innerText.length > 0");
  await evaluate(`fetch('/api/trpc/auth.logout?batch=1', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 0: { json: null } }) })`);
  await command("Page.reload", { ignoreCache: true });
  await waitFor("Boolean(document.querySelector('.auth-hero'))");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const registration = await evaluate(`(async () => { const response = await fetch('/api/trpc/auth.register?batch=1', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 0: { json: { name: 'Validação Planos', email: '${email}', password: '${password}', passwordConfirmation: '${password}' } } }) }); return await response.text(); })()`);
  if (registration.includes('error')) throw new Error(`Cadastro de planos falhou: ${registration}`);
  await command("Page.reload", { ignoreCache: true });
  await waitFor("Boolean(document.querySelector('aside')) && Array.from(document.querySelectorAll('button')).some(button => button.textContent?.trim() === 'Planos')");

  await openPlans();
  const desktop = await snapshot();
  if (!desktop.notice || desktop.cards !== 5 || desktop.disabled !== 5 || !desktop.free || !desktop.prices || !desktop.simulations || !desktop.title) throw new Error(`Planos desktop inválidos: ${JSON.stringify(desktop)}`);
  await capture("desktop");

  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command("Page.reload", { ignoreCache: true });
  await waitFor("Boolean(document.querySelector('button[aria-label=\"Abrir navegação\"]'))");
  await openPlans();
  const mobile = await snapshot();
  if (!mobile.notice || mobile.width !== 390 || mobile.cards !== 5 || mobile.disabled !== 5 || !mobile.prices) throw new Error(`Planos móveis inválidos: ${JSON.stringify(mobile)}`);
  await capture("mobile");
  console.log(JSON.stringify({ email, desktop, mobile }, null, 2));
} finally {
  socket.close();
}
