import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { generateWeeklyPlanForAllUsers } from "../../src/worker/scheduler/strategy-cron";

vi.mock("../../src/worker/ai/claude", async () => ({
  MODEL: "mock-model",
  callClaudeJson: vi.fn(),
}));

import * as claudeModule from "../../src/worker/ai/claude";
const callClaudeJson = claudeModule.callClaudeJson as unknown as ReturnType<typeof vi.fn>;

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
  `CREATE TABLE IF NOT EXISTS post_comments_raw (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, external_comment_id TEXT, commenter_handle TEXT, body TEXT NOT NULL, posted_at INTEGER, fetched_at INTEGER NOT NULL, sentiment TEXT, topics_json TEXT, classified_at INTEGER)`,
];

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
});

beforeEach(async () => {
  callClaudeJson.mockReset();
  await env.DB.prepare("DELETE FROM weekly_suggestions").run();
  await env.DB.prepare("DELETE FROM content_pillars").run();
  await env.DB.prepare("DELETE FROM inspiration_sources").run();
  await env.DB.prepare("DELETE FROM users WHERE id LIKE 'u_cron_%'").run();
});

describe("generateWeeklyPlanForAllUsers", () => {
  it("generates for users with pillars, skips users without activity", async () => {
    // User A has a pillar
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, 'x', ?)")
      .bind("u_cron_a", "a@t.d", Date.now()).run();
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, position, created_at) VALUES (?, ?, ?, 0, ?)")
      .bind("pil_a", "u_cron_a", "Bastidores", Date.now()).run();

    // User B — no strategy activity, should be skipped
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, 'x', ?)")
      .bind("u_cron_b", "b@t.d", Date.now()).run();

    // User C — has a prior weekly_suggestion
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, 'x', ?)")
      .bind("u_cron_c", "c@t.d", Date.now()).run();
    await env.DB.prepare("INSERT INTO weekly_suggestions (id, user_id, week_start, suggestions_json, model, created_at) VALUES (?, ?, ?, ?, 'mock', ?)")
      .bind("wsg_hist", "u_cron_c", "2026-04-20", "[]", Date.now()).run();

    callClaudeJson.mockResolvedValue({
      data: {
        rationale: "r",
        posts: [{ day: "seg", time: "09:00", network: "linkedin", pillarId: null, format: "post", hook: "h", body: "b", media_suggestion: "m" }],
      },
      usage: { inputTokens: 50, outputTokens: 20, cachedTokens: 10 },
      durationMs: 100,
    });

    const res = await generateWeeklyPlanForAllUsers(env);
    expect(res.ok).toBe(2);     // A + C
    expect(res.failed).toBe(0);
    expect(callClaudeJson).toHaveBeenCalledTimes(2);

    const suggCount = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM weekly_suggestions WHERE user_id IN ('u_cron_a', 'u_cron_c')"
    ).first<{ c: number }>();
    // u_cron_c already had 1 historical row + 1 new = 2
    // u_cron_a gets 1 new = 1
    // Total >= 3
    expect(suggCount?.c).toBeGreaterThanOrEqual(3);

    const bCount = await env.DB.prepare("SELECT COUNT(*) AS c FROM weekly_suggestions WHERE user_id = ?")
      .bind("u_cron_b").first<{ c: number }>();
    expect(bCount?.c).toBe(0);
  });

  it("counts failures without aborting the loop", async () => {
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, 'x', ?)")
      .bind("u_cron_ok", "ok@t.d", Date.now()).run();
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, position, created_at) VALUES (?, ?, 'p', 0, ?)")
      .bind("pil_ok", "u_cron_ok", Date.now()).run();

    await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, 'x', ?)")
      .bind("u_cron_bad", "bad@t.d", Date.now()).run();
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, position, created_at) VALUES (?, ?, 'p', 0, ?)")
      .bind("pil_bad", "u_cron_bad", Date.now()).run();

    callClaudeJson
      .mockResolvedValueOnce({
        data: { rationale: "r", posts: [{ day: "seg", time: "09:00", network: "linkedin", pillarId: null, format: "post", hook: "h", body: "b", media_suggestion: "m" }] },
        usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 }, durationMs: 50,
      })
      .mockRejectedValueOnce(new Error("boom"));

    const res = await generateWeeklyPlanForAllUsers(env);
    expect(res.ok + res.failed).toBe(2);
    expect(res.failed).toBe(1);
    expect(res.ok).toBe(1);
  });
});
