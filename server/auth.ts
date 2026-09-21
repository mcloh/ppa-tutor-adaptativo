import type { Request, Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { authSessions, users } from "../drizzle/schema";
import { getDb } from "./db";
import { createOpaqueToken, hashOpaqueToken } from "./domain/password";

export const SESSION_COOKIE = "ppa_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

function secureRequest(req: Request) {
  return req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureRequest(req),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: secureRequest(req),
    sameSite: "lax",
    path: "/",
    maxAge: -1,
  });
}

function cookieValue(req: Request) {
  const header = req.headers.cookie ?? "";
  return header
    .split(";")
    .map(pair => pair.trim())
    .find(pair => pair.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(`${SESSION_COOKIE}=`.length);
}

export async function createSession(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
  await db.insert(authSessions).values({
    id: nanoid(),
    userId,
    tokenHash: hashOpaqueToken(token),
    expiresAt,
  });
  return token;
}

export async function getAuthenticatedUser(req: Request) {
  const token = cookieValue(req);
  if (!token) return null;
  const db = await getDb();
  if (!db) return null;
  const records = await db
    .select({ user: users })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(eq(authSessions.tokenHash, hashOpaqueToken(token)), gt(authSessions.expiresAt, new Date()), isNull(authSessions.revokedAt)))
    .limit(1);
  return records[0]?.user ?? null;
}

export async function revokeCurrentSession(req: Request) {
  const token = cookieValue(req);
  if (!token) return;
  const db = await getDb();
  if (!db) return;
  await db.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.tokenHash, hashOpaqueToken(token)));
}
