import { describe, it, expect, beforeAll } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword } from "../../src/worker/auth";

const TEST_EMAIL = "caiman@test.dev";
const TEST_PASSWORD = "hunter2hunter2";

beforeAll(async () => {
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)"
  );
  const hash = await hashPassword(TEST_PASSWORD);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind("u_test", TEST_EMAIL, hash, Date.now())
    .run();
});

async function call(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://x${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("POST /api/auth/login", () => {
  it("400 when body missing fields", async () => {
    const res = await call("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("401 on wrong password", async () => {
    const res = await call("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("200 + Set-Cookie on correct credentials", async () => {
    const res = await call("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });
});

describe("GET /api/auth/me", () => {
  it("401 without cookie", async () => {
    const res = await call("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("200 with valid cookie after login", async () => {
    const login = await call("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const setCookie = login.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(";")[0];
    const me = await call("/api/auth/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { userId: string; email: string };
    expect(body.email).toBe(TEST_EMAIL);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears cookie", async () => {
    const res = await call("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/session=;/);
  });
});
