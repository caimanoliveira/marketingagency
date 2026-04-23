import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

const USER = "u_anlw8";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_metrics (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, account_ref TEXT NOT NULL, snapshot_date TEXT NOT NULL, followers INTEGER, impressions INTEGER, reach INTEGER, profile_views INTEGER, extra_json TEXT, created_at INTEGER NOT NULL, UNIQUE(user_id, network, account_ref, snapshot_date))`,
];

async function authedCall(path: string, init?: RequestInit) {
  const token = await signToken({ userId: USER }, env.JWT_SECRET);
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  headers.set("cookie", `session=${token}`);
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  const hash = await hashPassword("x");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(USER, "anlw8@test.dev", hash, Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_metrics WHERE post_id LIKE 'p_anl8_%'").run();
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_anl8_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'p_anl8_%'").run();
});

describe("GET /api/analytics/top-posts", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/analytics/top-posts"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("returns top posts ordered by likes+comments desc", async () => {
    const now = Date.now();
    for (const [i, likes, comments] of [[1, 50, 5], [2, 200, 20], [3, 100, 10]] as const) {
      await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'published', ?, ?)")
        .bind(`p_anl8_${i}`, USER, `post ${i}`, now - 5000, now - 5000).run();
      await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at, external_id) VALUES (?, ?, 'linkedin', 'published', ?, ?)")
        .bind(`t_anl8_${i}`, `p_anl8_${i}`, now - 5000, `lnk_${i}`).run();
      await env.DB.prepare("INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, likes, comments, reach, created_at) VALUES (?, ?, ?, 'linkedin', ?, ?, ?, ?, ?)")
        .bind(`pm_anl8_${i}`, `p_anl8_${i}`, `t_anl8_${i}`, now - 1000, likes, comments, 500, now).run();
    }
    const res = await authedCall("/api/analytics/top-posts?limit=10&by=likes");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ postId: string; score: number }> };
    expect(body.items[0].postId).toBe("p_anl8_2");
    expect(body.items[1].postId).toBe("p_anl8_3");
    expect(body.items[2].postId).toBe("p_anl8_1");
  });

  it("defaults to by=likes when invalid", async () => {
    const res = await authedCall("/api/analytics/top-posts?by=nonsense");
    expect(res.status).toBe(200);
  });

  it("respects limit", async () => {
    const now = Date.now();
    for (let i = 1; i <= 5; i++) {
      await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'published', ?, ?)")
        .bind(`p_anl8_lim_${i}`, USER, `x`, now - i*1000, now - i*1000).run();
      await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, 'linkedin', 'published', ?)")
        .bind(`t_anl8_lim_${i}`, `p_anl8_lim_${i}`, now - i*1000).run();
      await env.DB.prepare("INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, likes, comments, reach, created_at) VALUES (?, ?, ?, 'linkedin', ?, ?, ?, 100, ?)")
        .bind(`pm_anl8_lim_${i}`, `p_anl8_lim_${i}`, `t_anl8_lim_${i}`, now - 500, 10*i, i, now).run();
    }
    const res = await authedCall("/api/analytics/top-posts?limit=2");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(2);
  });
});

describe("GET /api/analytics/wow", () => {
  it("computes current vs previous 7d window with delta pcts", async () => {
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;

    // Post in current week (2 days ago): 100 likes
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'cur', 'published', ?, ?)")
      .bind("p_anl8_cur", USER, now - 2*dayMs, now - 2*dayMs).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, 'linkedin', 'published', ?)")
      .bind("t_anl8_cur", "p_anl8_cur", now - 2*dayMs).run();
    await env.DB.prepare("INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, likes, comments, reach, created_at) VALUES (?, ?, ?, 'linkedin', ?, 100, 10, 500, ?)")
      .bind("pm_anl8_cur", "p_anl8_cur", "t_anl8_cur", now - 500, now).run();

    // Post in previous week (10 days ago): 50 likes
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'prev', 'published', ?, ?)")
      .bind("p_anl8_prev", USER, now - 10*dayMs, now - 10*dayMs).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, 'linkedin', 'published', ?)")
      .bind("t_anl8_prev", "p_anl8_prev", now - 10*dayMs).run();
    await env.DB.prepare("INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, likes, comments, reach, created_at) VALUES (?, ?, ?, 'linkedin', ?, 50, 5, 200, ?)")
      .bind("pm_anl8_prev", "p_anl8_prev", "t_anl8_prev", now - 500, now).run();

    const res = await authedCall("/api/analytics/wow");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      current: { postsPublished: number; totalEngagement: number };
      previous: { postsPublished: number; totalEngagement: number };
      delta: { totalEngagementPct: number | null; postsPublishedPct: number | null };
    };
    expect(body.current.postsPublished).toBe(1);
    expect(body.previous.postsPublished).toBe(1);
    expect(body.current.totalEngagement).toBe(110);
    expect(body.previous.totalEngagement).toBe(55);
    // delta = (110-55)/55 * 100 = 100%
    expect(body.delta.totalEngagementPct).toBeCloseTo(100, 0);
  });

  it("handles zero previous (returns null pct)", async () => {
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'only', 'published', ?, ?)")
      .bind("p_anl8_only", USER, now - 2*dayMs, now - 2*dayMs).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, 'linkedin', 'published', ?)")
      .bind("t_anl8_only", "p_anl8_only", now - 2*dayMs).run();
    await env.DB.prepare("INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, likes, comments, reach, created_at) VALUES (?, ?, ?, 'linkedin', ?, 10, 2, 100, ?)")
      .bind("pm_anl8_only", "p_anl8_only", "t_anl8_only", now - 500, now).run();

    const res = await authedCall("/api/analytics/wow");
    const body = (await res.json()) as { delta: { totalEngagementPct: number | null; postsPublishedPct: number | null } };
    expect(body.delta.totalEngagementPct).toBeNull();
    expect(body.delta.postsPublishedPct).toBeNull();
  });
});
