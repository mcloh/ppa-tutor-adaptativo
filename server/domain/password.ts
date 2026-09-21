import { createHash, randomBytes, randomInt, timingSafeEqual, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const KEY_LENGTH = 64;
const SCRYPT_COST = 32_768;

const scrypt = (password: string, salt: string, keyLength: number, cost: number) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, { N: cost, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });

export const normalizeEmail = (email: string) => email.trim().toLocaleLowerCase("en-US");

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT_COST);
  return `scrypt$${SCRYPT_COST}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, cost, salt, expected] = storedHash.split("$");
  if (algorithm !== "scrypt" || !cost || !salt || !expected) return false;

  const expectedBuffer = Buffer.from(expected, "hex");
  const derived = await scrypt(password, salt, expectedBuffer.length, Number(cost));

  return derived.length === expectedBuffer.length && timingSafeEqual(derived, expectedBuffer);
}

export const createOpaqueToken = () => randomBytes(32).toString("base64url");
export const hashOpaqueToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

/** Senha transitória legível, forte e compatível com a mesma política da senha definitiva. */
export function createTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const suffix = Array.from({ length: 18 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `PPA${randomInt(10)}${suffix}`;
}
