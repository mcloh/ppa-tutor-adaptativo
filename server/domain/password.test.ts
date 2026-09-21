import { describe, expect, it } from "vitest";
import { hashPassword, normalizeEmail, verifyPassword } from "./password";

describe("credenciais locais", () => {
  it("normaliza e-mail e nunca preserva senha em formato aberto", async () => {
    const password = "Segura2026Plano";
    const stored = await hashPassword(password);
    expect(normalizeEmail(" Aluno@EXAMPLE.com ")).toBe("aluno@example.com");
    expect(stored).toMatch(/^scrypt\$32768\$/);
    expect(stored).not.toContain(password);
    await expect(verifyPassword(password, stored)).resolves.toBe(true);
    await expect(verifyPassword("outra-senha-2026", stored)).resolves.toBe(false);
  });
});
