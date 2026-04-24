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

const USER = "u_sgen";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, pillar_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS content_pillars (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, color TEXT, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inspiration_sources (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, username TEXT NOT NULL, note TEXT, added_at INTEGER NOT NULL, UNIQUE(user_id, network, username))`,
  `CREATE TABLE IF NOT EXISTS weekly_suggestions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, week_start TEXT NOT NULL, theme TEXT, status TEXT NOT NULL DEFAULT 'pending', suggestions_json TEXT NOT NULL, rationale TEXT, model TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER, created_at INTEGER NOT NULL, approved_at INTEGER, UNIQUE(user_id, week_start))`,
  `CREATE TABLE IF NOT EXISTS meta_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, fb_user_id TEXT NOT NULL, fb_user_name TEXT NOT NULL, access_token TEXT NOT NULL, expires_at INTEGER NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS instagram_accounts (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, ig_user_id TEXT NOT NULL, ig_username TEXT NOT NULL, fb_page_id TEXT NOT NULL, fb_page_name TEXT NOT NULL, fb_page_access_token TEXT NOT NULL, profile_picture_url TEXT, created_at INTEGER NOT NULL)`,
];

async function authedCall(path: string, init?: RequestInit) {
  const token = await signToken({ userId: USER }, env.JWT_SECRET);
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  headers.set("cookie", `session=${token}`);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  const hash = await hashPassword("x");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(USER, "sgen@test.dev", hash, Date.now()).run();
});

beforeEach(async () => {
  callClaudeJson.mockReset();
  await env.DB.prepare("DELETE FROM weekly_suggestions WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM content_pillars WHERE user_id = ?").bind(USER).run();
});

describe("POST /api/strategy/generate", () => {
  it("generates + persists a weekly suggestion", async () => {
    callClaudeJson.mockResolvedValueOnce({
      data: {
        rationale: "Mix de educativo e bastidores.",
        posts: [
          { day: "seg", time: "09:00", network: "linkedin", pillarId: null, format: "post", hook: "Hook 1", body: "Body 1", media_suggestion: "Foto 1" },
          { day: "qua", time: "10:00", network: "instagram", pillarId: null, format: "reels", hook: "Hook 2", body: "Body 2", media_suggestion: "Vídeo" },
          { day: "sex", time: "11:00", network: "linkedin", pillarId: null, format: "post", hook: "Hook 3", body: "Body 3", media_suggestion: "" },
        ],
      },
      usage: { inputTokens: 500, outputTokens: 200, cachedTokens: 400 },
      durationMs: 1200,
    });

    const res = await authedCall("/api/strategy/generate", {
      method: "POST",
      body: JSON.stringify({ theme: "Lançamento Q2", weekStart: "2026-04-27" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; posts: unknown[]; status: string; theme: string };
    expect(body.id).toMatch(/^wsg_/);
    expect(body.theme).toBe("Lançamento Q2");
    expect(body.posts).toHaveLength(3);
    expect(body.status).toBe("pending");
  });

  it("502 if model returns empty posts array", async () => {
    callClaudeJson.mockResolvedValueOnce({
      data: { rationale: "", posts: [] },
      usage: { inputTokens: 100, outputTokens: 10, cachedTokens: 0 },
      durationMs: 200,
    });
    const res = await authedCall("/api/strategy/generate", { method: "POST", body: "{}" });
    expect(res.status).toBe(502);
  });

  it("502 on upstream error", async () => {
    callClaudeJson.mockRejectedValueOnce(new Error("anthropic_rate_limit"));
    const res = await authedCall("/api/strategy/generate", { method: "POST", body: "{}" });
    expect(res.status).toBe(502);
  });

  it("400 invalid weekStart format", async () => {
    const res = await authedCall("/api/strategy/generate", {
      method: "POST",
      body: JSON.stringify({ weekStart: "invalid-date" }),
    });
    expect(res.status).toBe(400);
  });

  it("injects pillar performance into the prompt when signal exists", async () => {
    // Seed one pillar with 2 posts and metrics → avg engagement 0.15
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, color, position, created_at) VALUES (?, ?, ?, ?, 0, ?)")
      .bind("pil_hot", USER, "Hot Pillar", "#f00", Date.now()).run();
    for (let i = 1; i <= 2; i++) {
      await env.DB.prepare("INSERT INTO posts (id, user_id, body, pillar_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pil_hot', 'published', ?, ?)")
        .bind(`pp${i}`, USER, `x${i}`, Date.now(), Date.now()).run();
      await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, 'linkedin', 'published', ?)")
        .bind(`tp${i}`, `pp${i}`, Date.now()).run();
      await env.DB.prepare(
        "INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, likes, comments, engagement_rate, created_at) VALUES (?, ?, ?, 'linkedin', ?, ?, ?, ?, ?)"
      ).bind(`mp${i}`, `pp${i}`, `tp${i}`, Date.now(), 10 * i, 2 * i, 0.1 * i, Date.now()).run();
    }

    callClaudeJson.mockResolvedValueOnce({
      data: {
        rationale: "r",
        posts: [{ day: "seg", time: "09:00", network: "linkedin", pillarId: "pil_hot", format: "post", hook: "h", body: "b", media_suggestion: "m" }],
      },
      usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 },
      durationMs: 50,
    });

    await authedCall("/api/strategy/generate", { method: "POST", body: JSON.stringify({ weekStart: "2026-04-27" }) });

    expect(callClaudeJson).toHaveBeenCalledTimes(1);
    const callArgs = callClaudeJson.mock.calls[0];
    const userPrompt = callArgs[1].user as string;
    expect(userPrompt).toContain("Performance por pilar");
    expect(userPrompt).toContain("pil_hot");
    expect(userPrompt).toContain("Hot Pillar");
  });

  it("omits pillar performance section when no metrics yet", async () => {
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, color, position, created_at) VALUES (?, ?, ?, ?, 0, ?)")
      .bind("pil_cold", USER, "Cold Pillar", "#00f", Date.now()).run();

    callClaudeJson.mockResolvedValueOnce({
      data: {
        rationale: "r",
        posts: [{ day: "seg", time: "09:00", network: "linkedin", pillarId: null, format: "post", hook: "h", body: "b", media_suggestion: "m" }],
      },
      usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 },
      durationMs: 50,
    });

    await authedCall("/api/strategy/generate", { method: "POST", body: JSON.stringify({ weekStart: "2026-04-27" }) });
    const userPrompt = callClaudeJson.mock.calls[0][1].user as string;
    expect(userPrompt).not.toContain("Performance por pilar");
  });
});

describe("GET /api/strategy/weekly-suggestions", () => {
  it("lists + fetches by id", async () => {
    callClaudeJson.mockResolvedValueOnce({
      data: {
        rationale: "r",
        posts: [{ day: "seg", time: "09:00", network: "linkedin", pillarId: null, format: "post", hook: "h", body: "b", media_suggestion: "m" }],
      },
      usage: { inputTokens: 50, outputTokens: 20, cachedTokens: 10 },
      durationMs: 100,
    });
    const gen = await authedCall("/api/strategy/generate", { method: "POST", body: JSON.stringify({ weekStart: "2026-05-04" }) });
    const generated = (await gen.json()) as { id: string };

    const listRes = await authedCall("/api/strategy/weekly-suggestions?limit=5");
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { items: Array<{ id: string }> };
    expect(list.items.some((s) => s.id === generated.id)).toBe(true);

    const oneRes = await authedCall(`/api/strategy/weekly-suggestions/${generated.id}`);
    expect(oneRes.status).toBe(200);
    const one = (await oneRes.json()) as { id: string; posts: unknown[] };
    expect(one.id).toBe(generated.id);
    expect(one.posts).toHaveLength(1);
  });

  it("404 for unknown id", async () => {
    const res = await authedCall("/api/strategy/weekly-suggestions/wsg_nope");
    expect(res.status).toBe(404);
  });
});
