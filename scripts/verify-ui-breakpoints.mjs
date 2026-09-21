import { writeFile } from "node:fs/promises";

const base = "http://127.0.0.1:3000";
const runId = Date.now();
const password = "SenhaSegura2026";
const target = await (await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(base)}`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", event => { const message = JSON.parse(event.data); const handler = pending.get(message.id); if (handler) { pending.delete(message.id); handler(message); } });
function command(method, params = {}) { const id = ++sequence; socket.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result))); }
async function evaluate(expression) { const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); return result.result.value; }
async function waitFor(expression, timeout = 30_000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 200)); } throw new Error(`Tempo excedido: ${expression}`); }
async function capture(name) { const shot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); await writeFile(`/tmp/ppa-${name}.png`, Buffer.from(shot.data, "base64")); }
function assert(label, value, check) { if (!check(value)) throw new Error(`${label}: ${JSON.stringify(value)}`); }
async function snapshot(expression) { return JSON.parse(await evaluate(`JSON.stringify(${expression})`)); }

async function setViewport(width, height, mobile) { await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }); }
async function logoutAndOpenAccess() {
  await evaluate(`(async () => { await fetch('/api/trpc/auth.logout?batch=1', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 0: { json: null } }) }); })()`);
  await command("Page.reload", { ignoreCache: true });
  await waitFor("Boolean(document.querySelector('.auth-hero') && document.querySelector('#password-confirmation'))");
}
async function registerAndOpenStudy(email) {
  const result = await evaluate(`(async () => { const response = await fetch('/api/trpc/auth.register?batch=1', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 0: { json: { name: 'Validação Visual', email: '${email}', password: '${password}', passwordConfirmation: '${password}' } } }) }); return await response.text(); })()`);
  if (result.includes('error')) throw new Error(`Cadastro visual falhou: ${result}`);
  await command("Page.reload", { ignoreCache: true });
  await waitFor("document.body.innerText.includes('Questão')");
}
async function studyLayout() { return snapshot(`(() => { const card = document.querySelector('.cad-frame'); const sidebar = document.querySelector('aside'); const header = document.querySelector('body > #root > div > header'); return { width: innerWidth, card: Math.round(card?.getBoundingClientRect().width ?? 0), answers: document.querySelectorAll('[role="radio"]').length, sidebar: sidebar ? getComputedStyle(sidebar).display : 'missing', header: header ? getComputedStyle(header).display : 'missing' }; })()`); }
async function answerAndOpenFeedback() {
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Me ensine'))?.click()`);
  await waitFor("!Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Enviar resposta'))?.disabled");
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Enviar resposta'))?.click()`);
  await waitFor("document.body.innerText.includes('RESULTADO REGISTRADO')");
}
async function openDashboard() {
  await evaluate(`document.querySelector('button[aria-label="Ver notificações"]')?.click()`);
  await waitFor("document.body.innerText.includes('Evidências, cobertura e próxima ação')");
}

const devices = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "tablet", width: 768, height: 1024, mobile: true },
  { name: "mobile", width: 390, height: 844, mobile: true },
];
const report = {};

try {
  await command("Page.enable"); await command("Runtime.enable");
  for (const device of devices) {
    await setViewport(device.width, device.height, device.mobile);
    await logoutAndOpenAccess();
    const auth = await snapshot(`(() => ({ width: innerWidth, form: Boolean(document.querySelector('form')), confirmation: Boolean(document.querySelector('#password-confirmation')), hero: Boolean(document.querySelector('.auth-hero')) }))()`);
    assert(`acesso ${device.name}`, auth, value => value.width === device.width && value.form && value.confirmation && value.hero);
    await capture(`auth-${device.name}`);

    await registerAndOpenStudy(`ui-breakpoint-${device.name}-${runId}@example.test`);
    const study = await studyLayout();
    const desktop = device.name === "desktop";
    assert(`estudo ${device.name}`, study, value => value.width === device.width && value.answers === 4 && (desktop ? value.card > 600 && value.sidebar !== 'none' : value.card > 300 && value.sidebar === 'none' && value.header !== 'none'));
    await capture(`study-${device.name}`);

    await answerAndOpenFeedback();
    const feedback = await snapshot(`(() => ({ feedback: document.body.innerText.includes('RESULTADO REGISTRADO'), next: Boolean(Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Próxima questão'))) }))()`);
    assert(`retorno ${device.name}`, feedback, value => value.feedback && value.next);
    await capture(`feedback-${device.name}`);

    await openDashboard();
    const dashboard = await snapshot(`(() => ({ dashboard: document.body.innerText.includes('Evidências, cobertura e próxima ação'), instruments: document.querySelectorAll('svg').length, cards: document.querySelectorAll('main .cad-frame').length, width: innerWidth }))()`);
    assert(`prontidão ${device.name}`, dashboard, value => value.width === device.width && value.dashboard && value.instruments >= 4 && value.cards >= 5);
    await capture(`dashboard-${device.name}`);
    report[device.name] = { auth, study, feedback, dashboard };
  }
  await writeFile("/tmp/ppa-ui-breakpoint-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { socket.close(); }
