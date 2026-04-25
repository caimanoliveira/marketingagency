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

const USER = "u_appr";

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
  `CREATE TABLE IF NOT EXISTS ai_variant_outcomes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT, tone TEXT, variant_text TEXT NOT NULL, post_id TEXT, applied_at INTEGER NOT NULL)`,
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

async function seedSuggestion(
  weekStart: string,
  posts: Array<{ day: string; time: string; network: string; body: string; pillarId?: string | null }>
) {
  callClaudeJson.mockResolvedValueOnce({
    data: {
      rationale: "r",
      posts: posts.map((p) => ({ day: p.day, time: p.time, network: p.network, pillarId: p.pillarId ?? null, format: "post", hook: "h", body: p.body, media_suggestion: "m" })),
    },
    usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 80 },
    durationMs: 200,
  });
  const res = await authedCall("/api/strategy/generate", { method: "POST", body: JSON.stringify({ weekStart }) });
  const body = (await res.json()) as { id: string };
  return body.id;
}

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  const hash = await hashPassword("x");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(USER, "appr@test.dev", hash, Date.now()).run();
});

beforeEach(async () => {
  callClaudeJson.mockReset();
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_appr_%' OR post_id IN (SELECT id FROM posts WHERE user_id = ?)").bind(USER).run();
  await env.DB.prepare("DELETE FROM posts WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM weekly_suggestions WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM content_pillars WHERE user_id = ?").bind(USER).run();
});

describe("POST /api/strategy/weekly-suggestions/:id/approve", () => {
  it("creates drafts for all posts when acceptIndices omitted", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const futureStartIso = `${futureDate.getUTCFullYear()}-${String(futureDate.getUTCMonth() + 1).padStart(2, "0")}-${String(futureDate.getUTCDate()).padStart(2, "0")}`;
    const id = await seedSuggestion(futureStartIso, [
      { day: "seg", time: "09:00", network: "linkedin", body: "Post 1" },
      { day: "qua", time: "10:00", network: "instagram", body: "Post 2" },
      { day: "sex", time: "11:00", network: "linkedin", body: "Post 3" },
    ]);

    const res = await authedCall(`/api/strategy/weekly-suggestions/${id}/approve`, {
      method: "POST", body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { createdPostIds: string[] };
    expect(body.createdPostIds).toHaveLength(3);

    // All posts created
    const postsCount = await env.DB.prepare("SELECT COUNT(*) AS c FROM posts WHERE user_id = ?").bind(USER).first<{ c: number }>();
    expect(postsCount?.c).toBe(3);

    // Each has a target with scheduled_at in the future and status='scheduled'
    const targets = await env.DB.prepare(
      "SELECT t.network, t.status, t.scheduled_at FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE p.user_id = ?"
    ).bind(USER).all<{ network: string; status: string; scheduled_at: number }>();
    expect(targets.results?.length).toBe(3);
    for (const t of targets.results ?? []) {
      expect(t.status).toBe("scheduled");
      expect(t.scheduled_at).toBeGreaterThan(Date.now());
    }

    // Suggestion marked approved
    const sug = await env.DB.prepare("SELECT status, approved_at FROM weekly_suggestions WHERE id = ?").bind(id).first<{ status: string; approved_at: number }>();
    expect(sug?.status).toBe("approved");
    expect(sug?.approved_at).toBeTruthy();
  });

  it("accepts only specified indices", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const futureStartIso = `${futureDate.getUTCFullYear()}-${String(futureDate.getUTCMonth() + 1).padStart(2, "0")}-${String(futureDate.getUTCDate()).padStart(2, "0")}`;
    const id = await seedSuggestion(futureStartIso, [
      { day: "seg", time: "09:00", network: "linkedin", body: "A" },
      { day: "ter", time: "10:00", network: "instagram", body: "B" },
      { day: "qua", time: "11:00", network: "linkedin", body: "C" },
    ]);
    const res = await authedCall(`/api/strategy/weekly-suggestions/${id}/approve`, {
      method: "POST", body: JSON.stringify({ acceptIndices: [0, 2] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { createdPostIds: string[] };
    expect(body.createdPostIds).toHaveLength(2);

    const bodies = await env.DB.prepare("SELECT body FROM posts WHERE user_id = ?").bind(USER).all<{ body: string }>();
    const set = new Set((bodies.results ?? []).map((r) => r.body));
    expect(set).toEqual(new Set(["A", "C"]));
  });

  it("past weekStart results in pending status (not scheduled)", async () => {
    const pastStart = "2024-01-01";
    const id = await seedSuggestion(pastStart, [
      { day: "seg", time: "09:00", network: "linkedin", body: "old post" },
    ]);
    const res = await authedCall(`/api/strategy/weekly-suggestions/${id}/approve`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const t = await env.DB.prepare(
      "SELECT t.status FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE p.user_id = ?"
    ).bind(USER).first<{ status: string }>();
    expect(t?.status).toBe("pending");
  });

  it("404 for unknown suggestion", async () => {
    const res = await authedCall("/api/strategy/weekly-suggestions/wsg_nope/approve", { method: "POST", body: "{}" });
    expect(res.status).toBe(404);
  });

  it("persists valid pillarId on created drafts and drops invalid ids to null", async () => {
    await env.DB.prepare(
      "INSERT INTO content_pillars (id, user_id, title, position, created_at) VALUES (?, ?, ?, 0, ?)"
    ).bind("pil_real", USER, "Real", Date.now()).run();

    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const futureStartIso = `${futureDate.getUTCFullYear()}-${String(futureDate.getUTCMonth() + 1).padStart(2, "0")}-${String(futureDate.getUTCDate()).padStart(2, "0")}`;
    const id = await seedSuggestion(futureStartIso, [
      { day: "seg", time: "09:00", network: "linkedin", body: "good pillar", pillarId: "pil_real" },
      { day: "ter", time: "10:00", network: "instagram", body: "bad pillar", pillarId: "pil_hallucinated" },
      { day: "qua", time: "11:00", network: "linkedin", body: "no pillar", pillarId: null },
    ]);
    const res = await authedCall(`/api/strategy/weekly-suggestions/${id}/approve`, {
      method: "POST", body: "{}",
    });
    expect(res.status).toBe(200);

    const rows = await env.DB.prepare(
      "SELECT body, pillar_id FROM posts WHERE user_id = ? ORDER BY body"
    ).bind(USER).all<{ body: string; pillar_id: string | null }>();
    const byBody = Object.fromEntries((rows.results ?? []).map((r: { body: string; pillar_id: string | null }) => [r.body, r.pillar_id]));
    expect(byBody["good pillar"]).toBe("pil_real");
    expect(byBody["bad pillar"]).toBeNull();
    expect(byBody["no pillar"]).toBeNull();
  });

  it("400 when suggestion has no accepted posts (empty indices and empty suggestion)", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const futureStartIso = `${futureDate.getUTCFullYear()}-${String(futureDate.getUTCMonth() + 1).padStart(2, "0")}-${String(futureDate.getUTCDate()).padStart(2, "0")}`;
    const id = await seedSuggestion(futureStartIso, [
      { day: "seg", time: "09:00", network: "linkedin", body: "X" },
    ]);
    const res = await authedCall(`/api/strategy/weekly-suggestions/${id}/approve`, {
      method: "POST", body: JSON.stringify({ acceptIndices: [] }),
    });
    expect(res.status).toBe(400);
  });
});
