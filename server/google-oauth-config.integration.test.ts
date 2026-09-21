import { describe, expect, it } from "vitest";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REDIRECT_URI =
  "https://ppa.simulados.apia.app.br/api/auth/google/callback";

function requiredEnv(name: "GOOGLE_OAUTH_CLIENT_ID" | "GOOGLE_OAUTH_CLIENT_SECRET") {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`${name} não está configurado.`);
  }
  return value;
}

describe("configuração Google OAuth", () => {
  it("aceita as credenciais do cliente no endpoint de token sem iniciar login", async () => {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
        client_secret: requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
        code: "ppa-configuration-validation-no-authorization-code",
        grant_type: "authorization_code",
        redirect_uri: GOOGLE_REDIRECT_URI,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const result = (await response.json()) as { error?: string };

    // Um código deliberadamente inexistente deve produzir invalid_grant. O endpoint
    // retorna invalid_client se a identidade confidencial do cliente for rejeitada.
    expect(response.status).toBe(400);
    expect(result.error).toBe("invalid_grant");
  });
});
