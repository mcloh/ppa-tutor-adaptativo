import { writeFile } from "node:fs/promises";

const browserInfo = await (await fetch("http://127.0.0.1:9222/json/version")).json();
const socket = new WebSocket(browserInfo.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  const callback = pending.get(message.id);
  if (callback) {
    pending.delete(message.id);
    callback(message);
  }
});
function command(method, params = {}, sessionId) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
}
const context = await command("Target.createBrowserContext");
const page = await command("Target.createTarget", { url: "http://127.0.0.1:3000/", browserContextId: context.browserContextId });
const attached = await command("Target.attachToTarget", { targetId: page.targetId, flatten: true });
const sessionId = attached.sessionId;
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  return result.result.value;
}
async function waitFor(expression, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Tempo excedido: ${expression}`);
}

try {
  await command("Page.enable", {}, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await command("Page.reload", { ignoreCache: true }, sessionId);
  await waitFor("Boolean(document.querySelector('.auth-public-plans-link'))");
  await new Promise(resolve => setTimeout(resolve, 260));
  const assessment = JSON.parse(await evaluate(`JSON.stringify((() => {
    const link = document.querySelector('.auth-public-plans-link');
    const form = document.querySelector('.auth-form');
    const linkRect = link.getBoundingClientRect();
    const formRect = form.getBoundingClientRect();
    const style = getComputedStyle(link);
    return { path: location.pathname, bottomGap: Math.round(formRect.top - linkRect.bottom), minHeight: Math.round(linkRect.height), background: style.backgroundColor, fontWeight: style.fontWeight, fontSize: style.fontSize };
  })())`));
  if (assessment.path !== "/" || assessment.bottomGap < 32 || assessment.minHeight < 54 || Number(assessment.fontWeight) < 700) {
    throw new Error(`Destaque público móvel não atende ao contrato: ${JSON.stringify(assessment)}`);
  }
  const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId);
  await writeFile("/tmp/ppa-public-auth-link-mobile.png", Buffer.from(screenshot.data, "base64"));
  console.log(JSON.stringify(assessment, null, 2));
} finally {
  try { await command("Target.closeTarget", { targetId: page.targetId }); } catch { /* Context is temporary. */ }
  try { await command("Target.disposeBrowserContext", { browserContextId: context.browserContextId }); } catch { /* Context is temporary. */ }
  socket.close();
}
