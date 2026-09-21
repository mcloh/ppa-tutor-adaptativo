import { randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { findOrCreateGoogleUser } from "./db";
import { createSession, setSessionCookie } from "./auth";
import { normalizeEmail } from "./domain/password";

const GOOGLE_STATE_COOKIE = "ppa_google_oauth_state";
const GOOGLE_REDIRECT_URI = "https://ppa.simulados.apia.app.br/api/auth/google/callback";
const GOOGLE_SCOPE = "openid email profile";

type GooglePayload = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  nonce?: string;
};

type GoogleIdentity = { subject: string; email: string; name?: string };

function configuredClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("A integração Google não está configurada.");
  return new OAuth2Client(clientId, clientSecret, GOOGLE_REDIRECT_URI);
}

export function validGoogleState(expected: string | undefined, received: string | undefined) {
  if (!expected || !received || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function createGoogleAuthorization(email?: string) {
  const normalizedEmail = email ? normalizeEmail(email) : undefined;
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const url = configuredClient().generateAuthUrl({
    access_type: "online",
    include_granted_scopes: false,
    nonce,
    prompt: "select_account",
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    state,
    ...(normalizedEmail ? { login_hint: normalizedEmail } : {}),
  });
  return { state, nonce, url };
}

export async function verifyGoogleIdentity(idToken: string, expectedNonce: string, client = configuredClient()): Promise<GoogleIdentity> {
  const audience = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const ticket = await client.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload() as GooglePayload | undefined;
  const email = normalizeEmail(payload?.email ?? "");
  if (!payload?.sub || !email || !payload.email_verified || !validGoogleState(expectedNonce, payload.nonce)) {
    throw new Error("A identidade Google não possui um e-mail verificado.");
  }
  return { subject: payload.sub, email, name: payload.name };
}

function encodeFlowCookie(input: { state: string; nonce: string }) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function decodeFlowCookie(value: string | undefined) {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<{ state: string; nonce: string }>;
    return typeof decoded.state === "string" && typeof decoded.nonce === "string" ? { state: decoded.state, nonce: decoded.nonce } : null;
  } catch {
    return null;
  }
}

function clearStateCookie(res: Response) {
  res.clearCookie(GOOGLE_STATE_COOKIE, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
}

export function registerGoogleAuthRoutes(app: Express) {
  app.get("/api/auth/google/start", (req: Request, res: Response) => {
    try {
      const email = typeof req.query.email === "string" ? req.query.email : undefined;
      const { state, nonce, url } = createGoogleAuthorization(email);
      res.cookie(GOOGLE_STATE_COOKIE, encodeFlowCookie({ state, nonce }), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60 * 1000,
      });
      res.redirect(302, url);
    } catch {
      res.redirect(302, "/?auth=google-unavailable");
    }
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const flow = decodeFlowCookie(parseCookieHeader(req.headers.cookie ?? "")[GOOGLE_STATE_COOKIE]);
    const nonce = flow?.nonce;
    clearStateCookie(res);
    if (!code || !nonce || !validGoogleState(flow?.state, state)) {
      res.redirect(302, "/?auth=google-error");
      return;
    }
    try {
      const client = configuredClient();
      const tokenResponse = await client.getToken({ code, redirect_uri: GOOGLE_REDIRECT_URI });
      if (!tokenResponse.tokens.id_token) throw new Error("Google não retornou um ID token.");
      const identity = await verifyGoogleIdentity(tokenResponse.tokens.id_token, nonce, client);
      const { user } = await findOrCreateGoogleUser(identity);
      if (user.passwordChangeRequired) {
        res.redirect(302, "/?auth=google-password-pending");
        return;
      }
      setSessionCookie(req, res, await createSession(user.id));
      res.redirect(302, "/?auth=google-success");
    } catch {
      res.redirect(302, "/?auth=google-error");
    }
  });
}
