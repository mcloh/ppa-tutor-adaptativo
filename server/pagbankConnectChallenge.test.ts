import { createServer } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PAGBANK_CONNECT_PUBLIC_KEY_PATH, readPagBankConnectKeyConfig, registerPagBankConnectChallengeRoute } from "./pagbankConnectChallenge";

let server: ReturnType<typeof createServer>;
let origin = "";
const testKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const testEnv = {
  PAGBANK_CONNECT_PUBLIC_KEY: testKeys.publicKey,
  PAGBANK_CONNECT_PRIVATE_KEY: testKeys.privateKey,
  PAGBANK_CONNECT_KEY_CREATED_AT: "1789043130440",
};

beforeAll(async () => {
  const app = express();
  registerPagBankConnectChallengeRoute(app, testEnv);
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Servidor de teste sem porta disponível.");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

describe("Connect Token Challenge PagBank", () => {
  it("expõe somente a chave pública configurada por endpoint GET JSON", async () => {
    const config = readPagBankConnectKeyConfig(testEnv);
    expect(config, "o par de chaves de teste deve ser íntegro").not.toBeNull();
    if (!config) return;

    const response = await fetch(`${origin}${PAGBANK_CONNECT_PUBLIC_KEY_PATH}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({ public_key: config.publicKey, created_at: config.createdAt });
    expect(JSON.stringify(body)).not.toContain(config.privateKey);
  });

  it("recusa expor qualquer chave quando a configuração não é íntegra", async () => {
    const malformed = { ...testEnv, PAGBANK_CONNECT_PRIVATE_KEY: "invalid" };
    expect(readPagBankConnectKeyConfig(malformed)).toBeNull();
  });

  it("aceita PEM com quebras de linha escapadas por uma variável de ambiente", () => {
    const escapedLineBreaks = {
      ...testEnv,
      PAGBANK_CONNECT_PUBLIC_KEY: testEnv.PAGBANK_CONNECT_PUBLIC_KEY.replace(/\n/g, "\\n"),
      PAGBANK_CONNECT_PRIVATE_KEY: testEnv.PAGBANK_CONNECT_PRIVATE_KEY.replace(/\n/g, "\\n"),
    };
    expect(readPagBankConnectKeyConfig(escapedLineBreaks)).toEqual(expect.objectContaining({
      publicKey: testEnv.PAGBANK_CONNECT_PUBLIC_KEY,
      createdAt: 1789043130440,
    }));
  });

  it("prioriza Base64 de linha única para ambientes que não preservam PEM multilinha", () => {
    const base64Encoded = {
      ...testEnv,
      PAGBANK_CONNECT_PUBLIC_KEY_BASE64: Buffer.from(testEnv.PAGBANK_CONNECT_PUBLIC_KEY, "utf8").toString("base64"),
      PAGBANK_CONNECT_PRIVATE_KEY_BASE64: Buffer.from(testEnv.PAGBANK_CONNECT_PRIVATE_KEY, "utf8").toString("base64"),
    };
    expect(readPagBankConnectKeyConfig(base64Encoded)).toEqual(expect.objectContaining({
      publicKey: testEnv.PAGBANK_CONNECT_PUBLIC_KEY.trim(),
      createdAt: 1789043130440,
    }));
  });
});
