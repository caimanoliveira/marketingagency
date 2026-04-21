import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, signToken, verifyToken } from "../../src/worker/auth";

describe("hashPassword / verifyPassword", () => {
  it("hashes differently each call and verifies correctly", async () => {
    const h1 = await hashPassword("hunter2");
    const h2 = await hashPassword("hunter2");
    expect(h1).not.toEqual(h2);
    expect(await verifyPassword("hunter2", h1)).toBe(true);
    expect(await verifyPassword("hunter2", h2)).toBe(true);
    expect(await verifyPassword("wrong", h1)).toBe(false);
  });
});

describe("signToken / verifyToken", () => {
  const SECRET = "test-secret-at-least-32-chars-long-xxxxxx";

  it("signs and verifies a token with userId payload", async () => {
    const token = await signToken({ userId: "u_123" }, SECRET);
    const payload = await verifyToken(token, SECRET);
    expect(payload?.userId).toBe("u_123");
  });

  it("returns null for tampered token", async () => {
    const token = await signToken({ userId: "u_123" }, SECRET);
    const tampered = token.slice(0, -2) + "xx";
    const payload = await verifyToken(tampered, SECRET);
    expect(payload).toBeNull();
  });

  it("returns null for wrong secret", async () => {
    const token = await signToken({ userId: "u_123" }, SECRET);
    const payload = await verifyToken(token, "different-secret-xxxxxxxxxxxxxxxxxxxx");
    expect(payload).toBeNull();
  });
});
