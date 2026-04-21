import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

vi.mock("../../src/worker/ai/claude", async () => ({
  MODEL: "mock-model",
  callClaudeJson: vi.fn(),
}));

import * as claudeModule from "../../src/worker/ai/claude";
const callClaudeJson = claudeModule.callClaudeJson as unknown as ReturnType<typeof vi.fn>;

const TEST_USER = "u_ai_test";
const TEST_EMAIL = "ai@test.dev";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ai_generations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER, cost_cents INTEGER, model TEXT NOT NULL, duration_ms INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
];

async function authedCall(path: string, init?: RequestInit) {
  const token = await signToken({ userId: TEST_USER }, env.JWT_SECRET);
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  headers.set("cookie", `session=${token}`);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeAll(async () => {
  for (const sql of SCHEMA_STATEMENTS) {
    await env.DB.prepare(sql).run();
  }
  const hash = await hashPassword("x");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(TEST_USER, TEST_EMAIL, hash, Date.now()).run();
});

beforeEach(() => {
  callClaudeJson.mockReset();
});

describe("POST /api/ai/variations", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/ai/variations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief: "test" }),
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("400 on short brief", async () => {
    const res = await authedCall("/api/ai/variations", {
      method: "POST",
      body: JSON.stringify({ brief: "ab" }),
    });
    expect(res.status).toBe(400);
  });

  it("200 returns 3 variations on mocked response", async () => {
    callClaudeJson.mockResolvedValueOnce({
      data: { variations: ["v1", "v2", "v3"] },
      usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 80 },
      durationMs: 500,
    });
    const res = await authedCall("/api/ai/variations", {
      method: "POST",
      body: JSON.stringify({ brief: "lance de produto novo", network: "linkedin", tone: "direct" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { variations: string[] };
    expect(body.variations).toHaveLength(3);
    expect(body.variations[0]).toBe("v1");

    const log = await env.DB.prepare(
      "SELECT kind, input_tokens FROM ai_generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
    ).bind(TEST_USER).first<{ kind: string; input_tokens: number }>();
    expect(log?.kind).toBe("variations");
    expect(log?.input_tokens).toBe(100);
  });

  it("502 if model returns fewer than 3 variations", async () => {
    callClaudeJson.mockResolvedValueOnce({
      data: { variations: ["only one"] },
      usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 },
      durationMs: 100,
    });
    const res = await authedCall("/api/ai/variations", {
      method: "POST",
      body: JSON.stringify({ brief: "teste" }),
    });
    expect(res.status).toBe(502);
  });

  it("502 on upstream error", async () => {
    callClaudeJson.mockRejectedValueOnce(new Error("anthropic_failed"));
    const res = await authedCall("/api/ai/variations", {
      method: "POST",
      body: JSON.stringify({ brief: "teste" }),
    });
    expect(res.status).toBe(502);
  });
});

describe("POST /api/ai/rewrite", () => {
  it("200 rewrites for network", async () => {
    callClaudeJson.mockResolvedValueOnce({
      data: { rewritten: "LinkedIn-ready copy" },
      usage: { inputTokens: 50, outputTokens: 20, cachedTokens: 30 },
      durationMs: 300,
    });
    const res = await authedCall("/api/ai/rewrite", {
      method: "POST",
      body: JSON.stringify({ body: "copy original", network: "linkedin" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rewritten: string };
    expect(body.rewritten).toBe("LinkedIn-ready copy");
  });

  it("400 on missing network", async () => {
    const res = await authedCall("/api/ai/rewrite", {
      method: "POST",
      body: JSON.stringify({ body: "oi" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ai/tone", () => {
  it("200 adjusts tone", async () => {
    callClaudeJson.mockResolvedValueOnce({
      data: { adjusted: "texto mais formal" },
      usage: { inputTokens: 30, outputTokens: 15, cachedTokens: 20 },
      durationMs: 200,
    });
    const res = await authedCall("/api/ai/tone", {
      method: "POST",
      body: JSON.stringify({ body: "eae galera", tone: "formal" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { adjusted: string };
    expect(body.adjusted).toBe("texto mais formal");
  });

  it("400 on invalid tone", async () => {
    const res = await authedCall("/api/ai/tone", {
      method: "POST",
      body: JSON.stringify({ body: "oi", tone: "sarcastic" }),
    });
    expect(res.status).toBe(400);
  });
});
