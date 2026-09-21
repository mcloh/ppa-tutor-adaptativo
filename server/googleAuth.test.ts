import { describe, expect, it } from "vitest";
import type { OAuth2Client } from "google-auth-library";
import { createGoogleAuthorization, validGoogleState, verifyGoogleIdentity } from "./googleAuth";

function verifier(payload: Record<string, unknown>) {
  return {
    verifyIdToken: async () => ({ getPayload: () => payload }),
  } as unknown as OAuth2Client;
}

describe("identidade Google", () => {
  it("inicia a escolha de conta sem exigir e-mail prévio e aceita hint de conta Workspace", () => {
    const authorization = createGoogleAuthorization();
    expect(authorization.url).toContain("accounts.google.com");
    expect(authorization.url).toContain("nonce=");
    expect(createGoogleAuthorization("aluno@apia.app.br").url).toContain("login_hint=aluno%40apia.app.br");
  });

  it("requer state e nonce correspondentes", () => {
    expect(validGoogleState("state-seguro", "state-seguro")).toBe(true);
    expect(validGoogleState("state-seguro", "outro-state")).toBe(false);
    expect(validGoogleState(undefined, "state-seguro")).toBe(false);
  });

  it("aceita uma identidade Google verificada com subject estável", async () => {
    await expect(verifyGoogleIdentity("token", "nonce-seguro", verifier({ sub: "google-subject-1", email: "aluno@instituto.edu.br", email_verified: true, nonce: "nonce-seguro", name: "Aluno" }))).resolves.toEqual({
      subject: "google-subject-1",
      email: "aluno@instituto.edu.br",
      name: "Aluno",
    });
  });

  it("rejeita e-mail ausente, não verificado ou nonce divergente", async () => {
    await expect(verifyGoogleIdentity("token", "nonce-seguro", verifier({ sub: "subject", email_verified: true, nonce: "nonce-seguro" }))).rejects.toThrow();
    await expect(verifyGoogleIdentity("token", "nonce-seguro", verifier({ sub: "subject", email: "aluno@gmail.com", email_verified: false, nonce: "nonce-seguro" }))).rejects.toThrow();
    await expect(verifyGoogleIdentity("token", "nonce-seguro", verifier({ sub: "subject", email: "aluno@gmail.com", email_verified: true, nonce: "outro" }))).rejects.toThrow();
  });
});
