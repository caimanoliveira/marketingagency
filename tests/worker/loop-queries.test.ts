import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  createPost,
  hookPerformance,
  publishedEngagementMedian,
  heaters,
} from "../../src/worker/db/queries";

const USER = "u_loop";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, hook_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
];

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(USER, "loop@test.dev", "x", Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_metrics WHERE post_id LIKE 'pl_%'").run();
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'pl_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'pl_%'").run();
});

// Helper: published post with a single target carrying `likes` engagement.
async function publishedPost(id: string, opts: { hookId?: string | null; likes: number; ageDays?: number }) {
  const publishedAt = Date.now() - (opts.ageDays ?? 1) * 24 * 3600 * 1000;
  await env.DB.prepare("INSERT INTO posts (id, user_id, body, hook_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'published', ?, ?)")
    .bind(id, USER, `body ${id}`, opts.hookId ?? null, publishedAt, publishedAt).run();
  const tId = `t_${id}`;
  await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, 'instagram', 'published', ?)")
    .bind(tId, id, publishedAt).run();
  await env.DB.prepare("INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, likes, comments, shares, saved, reach, created_at) VALUES (?, ?, ?, 'instagram', ?, ?, 0, 0, 0, 0, ?)")
    .bind(`m_${id}`, id, tId, Date.now(), opts.likes, Date.now()).run();
}

describe("createPost with hook attribution", () => {
  it("stores hook_id", async () => {
    await createPost(env.DB, { id: "pl_a", userId: USER, body: "x", mediaId: null, hookId: "hook_x" });
    const row = await env.DB.prepare("SELECT hook_id FROM posts WHERE id = 'pl_a'").first<{ hook_id: string | null }>();
    expect(row?.hook_id).toBe("hook_x");
  });

  it("defaults hook_id to null when omitted", async () => {
    await createPost(env.DB, { id: "pl_b", userId: USER, body: "x", mediaId: null });
    const row = await env.DB.prepare("SELECT hook_id FROM posts WHERE id = 'pl_b'").first<{ hook_id: string | null }>();
    expect(row?.hook_id).toBeNull();
  });
});

describe("publishedEngagementMedian", () => {
  it("computes the median engagement across published posts", async () => {
    await publishedPost("pl_1", { likes: 10 });
    await publishedPost("pl_2", { likes: 20 });
    await publishedPost("pl_3", { likes: 60 });
    const med = await publishedEngagementMedian(env.DB, USER, 90);
    expect(med).toBe(20);
  });
});

describe("hookPerformance", () => {
  it("aggregates per-hook posts, average, and best engagement", async () => {
    await publishedPost("pl_1", { hookId: "h1", likes: 60 });
    await publishedPost("pl_2", { hookId: "h1", likes: 20 });
    await publishedPost("pl_3", { hookId: "h2", likes: 10 });
    const perf = await hookPerformance(env.DB, USER);
    expect(perf.get("h1")).toEqual({ hookId: "h1", postsPublished: 2, avgEngagement: 40, bestEngagement: 60 });
    expect(perf.get("h2")).toEqual({ hookId: "h2", postsPublished: 1, avgEngagement: 10, bestEngagement: 10 });
  });

  it("ignores posts without a hook_id", async () => {
    await publishedPost("pl_1", { likes: 100 }); // no hook
    const perf = await hookPerformance(env.DB, USER);
    expect(perf.size).toBe(0);
  });
});

describe("heaters", () => {
  it("flags posts beating the median by the multiplier", async () => {
    await publishedPost("pl_1", { likes: 10 });
    await publishedPost("pl_2", { likes: 20 });
    await publishedPost("pl_3", { hookId: "h1", likes: 60 });
    const { median, items } = await heaters(env.DB, USER, { days: 30, multiplier: 2 });
    expect(median).toBe(20);
    expect(items).toHaveLength(1);
    expect(items[0].postId).toBe("pl_3");
    expect(items[0].hookId).toBe("h1");
    expect(items[0].ratio).toBe(3);
    expect(items[0].networks).toEqual(["instagram"]);
  });

  it("returns nothing when no post clears the threshold", async () => {
    await publishedPost("pl_1", { likes: 10 });
    await publishedPost("pl_2", { likes: 11 });
    await publishedPost("pl_3", { likes: 12 });
    const { items } = await heaters(env.DB, USER, { days: 30, multiplier: 2 });
    expect(items).toHaveLength(0);
  });

  it("respects the days window", async () => {
    await publishedPost("pl_old", { likes: 100, ageDays: 60 });
    await publishedPost("pl_new", { likes: 100, ageDays: 1 });
    const { items } = await heaters(env.DB, USER, { days: 30, multiplier: 2 });
    // Only pl_new is in-window; with a single post the median equals it, so it is not 2x itself.
    expect(items).toHaveLength(0);
  });
});
