import { createPrivateKey, createPublicKey } from "node:crypto";
import type { Express, Request, Response } from "express";

export const PAGBANK_CONNECT_PUBLIC_KEY_PATH = "/api/pagbank/connect/public-key";

export type PagBankConnectKeyConfig = {
  publicKey: string;
  privateKey: string;
  createdAt: number;
};

function normalizedPublicKey(value: string) {
  return createPublicKey(value).export({ type: "spki", format: "pem" }).toString();
}

function readPemFromEnvironment(value: string | undefined, encodedValue: string | undefined) {
  if (encodedValue?.trim()) {
    return Buffer.from(encodedValue.trim(), "base64").toString("utf8").trim();
  }
  return value?.trim().replace(/\\n/g, "\n");
}

export function readPagBankConnectKeyConfig(env: NodeJS.ProcessEnv = process.env): PagBankConnectKeyConfig | null {
  const publicKey = readPemFromEnvironment(env.PAGBANK_CONNECT_PUBLIC_KEY, env.PAGBANK_CONNECT_PUBLIC_KEY_BASE64);
  const privateKey = readPemFromEnvironment(env.PAGBANK_CONNECT_PRIVATE_KEY, env.PAGBANK_CONNECT_PRIVATE_KEY_BASE64);
  const createdAt = Number(env.PAGBANK_CONNECT_KEY_CREATED_AT);
  if (!publicKey || !privateKey || !Number.isSafeInteger(createdAt) || createdAt <= 0) return null;

  try {
    const fromPrivateKey = createPublicKey(createPrivateKey(privateKey)).export({ type: "spki", format: "pem" }).toString();
    if (normalizedPublicKey(publicKey) !== fromPrivateKey) return null;
    return { publicKey, privateKey, createdAt };
  } catch {
    return null;
  }
}

export function registerPagBankConnectChallengeRoute(app: Express, env: NodeJS.ProcessEnv = process.env) {
  app.get(PAGBANK_CONNECT_PUBLIC_KEY_PATH, (_req: Request, res: Response) => {
    const config = readPagBankConnectKeyConfig(env);
    if (!config) {
      res.status(503).type("application/json").json({ error: "Connect Token Challenge temporariamente indisponível." });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).type("application/json").json({
      public_key: config.publicKey,
      created_at: config.createdAt,
    });
  });
}
