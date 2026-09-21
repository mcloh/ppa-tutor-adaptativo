import mysql from "mysql2/promise";

const base = process.env.PPA_BASE_URL ?? "http://localhost:3000";
const email = `auth-recovery-${Date.now()}@example.test`;
const password = "SenhaSegura2026";

async function call(path, input, cookie, method = "POST") {
  const response = await fetch(`${base}/api/trpc/${path}?batch=1`, {
    method,
    headers: { ...(method === "POST" ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: method === "POST" ? JSON.stringify({ 0: { json: input ?? null } }) : undefined,
  });
  const payload = await response.json();
  return { result: payload[0]?.result?.data?.json, error: payload[0]?.error?.json, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

const db = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const mismatch = await call("auth.register", { name: "Teste", email, password, passwordConfirmation: "SenhaDiferente2026" });
  if (!mismatch.error?.message?.includes("senhas não coincidem")) throw new Error("O servidor aceitou confirmação de senha divergente.");

  const registered = await call("auth.register", { name: "Teste", email, password, passwordConfirmation: password });
  if (registered.error || !registered.cookie) throw new Error(`Cadastro não iniciou sessão: ${registered.error?.message ?? "cookie ausente"}`);
  const sessionAfterRegister = await call("auth.me", undefined, registered.cookie, "GET");
  if (!sessionAfterRegister.result?.email || sessionAfterRegister.result.email !== email) throw new Error("A sessão não ficou disponível após cadastro.");

  const loggedOut = await call("auth.logout", undefined, registered.cookie);
  if (loggedOut.error || !loggedOut.result?.success) throw new Error("O logout não foi concluído.");
  const sessionAfterLogout = await call("auth.me", undefined, registered.cookie, "GET");
  if (sessionAfterLogout.result !== null) throw new Error("A sessão anterior continuou válida após logout.");

  const loggedIn = await call("auth.login", { email, password });
  if (loggedIn.error || !loggedIn.cookie) throw new Error(`O login falhou: ${loggedIn.error?.message ?? "cookie ausente"}`);
  const sessionAfterLogin = await call("auth.me", undefined, loggedIn.cookie, "GET");
  if (sessionAfterLogin.result?.email !== email) throw new Error("A sessão não ficou disponível após login.");

  const recovered = await call("auth.register", { name: "Teste", email, password, passwordConfirmation: password });
  if (recovered.error || !recovered.cookie) throw new Error("O recadastro com a mesma senha não recuperou a sessão.");
  const conflict = await call("auth.register", { name: "Teste", email, password: "OutraSenha2026", passwordConfirmation: "OutraSenha2026" });
  if (!conflict.error?.message?.includes("já possui uma conta")) throw new Error("O conflito de conta existente não foi comunicado de forma orientativa.");
  console.log(JSON.stringify({ passwordConfirmation: "rejected_when_mismatched", registerSession: "active", logout: "revoked", loginSession: "active", retryRegister: "recovered" }, null, 2));
} finally {
  await db.execute("DELETE FROM users WHERE email = ?", [email]);
  await db.end();
}
