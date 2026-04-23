import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";
import { upsertAccountMetrics, insertPostMetrics } from "../../src/worker/db/queries";

const USER = "u_an_api";
const EMAIL = "an_api@test.dev";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS account_metrics (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, account_ref TEXT NOT NULL, snapshot_date TEXT NOT NULL, followers INTEGER, impressions INTEGER, reach INTEGER, profile_views INTEGER, extra_json TEXT, created_at INTEGER NOT NULL, UNIQUE(user_id, network, account_ref, snapshot_date))`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
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
    .bind(USER, EMAIL, hash, Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_metrics").run();
  await env.DB.prepare("DELETE FROM account_metrics WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_an_api_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'p_an_api_%'").run();
});

describe("GET /api/analytics/summary", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/analytics/summary?period=30"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("400 invalid period", async () => {
    const res = await authedCall("/api/analytics/summary?period=500");
    expect(res.status).toBe(400);
  });

  it("200 with zero data returns empty shape", async () => {
    const res = await authedCall("/api/analytics/summary?period=7");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { periodDays: number; postsPublished: number; totalEngagement: number };
    expect(body.periodDays).toBe(7);
    expect(body.postsPublished).toBe(0);
    expect(body.totalEngagement).toBe(0);
  });

  it("200 with data aggregates correctly", async () => {
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'x', 'published', ?, ?)")
      .bind("p_an_api_1", USER, now - 5*dayMs, now - 5*dayMs).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, 'instagram', 'published', ?)")
      .bind("t_an_api_1", "p_an_api_1", now - 5*dayMs).run();
    await insertPostMetrics(env.DB, { id: "pm_api_1", postId: "p_an_api_1", targetId: "t_an_api_1", network: "instagram",
      snapshotAt: now - 1000, likes: 100, comments: 10, shares: 5, saved: 2, reach: 500, impressions: 800, engagementRate: 0.234, extra: null });

    const res = await authedCall("/api/analytics/summary?period=30");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { postsPublished: number; totalReach: number; totalEngagement: number; contentMix: Array<{ network: string; count: number }> };
    expect(body.postsPublished).toBe(1);
    expect(body.totalReach).toBe(500);
    expect(body.totalEngagement).toBe(100 + 10 + 5 + 2);
    expect(body.contentMix.find((c) => c.network === "instagram")?.count).toBe(1);
  });
});

describe("GET /api/analytics/account-timeseries", () => {
  it("returns daily points", async () => {
    await upsertAccountMetrics(env.DB, { id: "am_t1", userId: USER, network: "instagram", accountRef: "ig_1",
      snapshotDate: "2026-04-20", followers: 100, impressions: null, reach: null, profileViews: null, extra: null });
    await upsertAccountMetrics(env.DB, { id: "am_t2", userId: USER, network: "instagram", accountRef: "ig_1",
      snapshotDate: "2026-04-22", followers: 120, impressions: null, reach: null, profileViews: null, extra: null });

    const res = await authedCall("/api/analytics/account-timeseries?network=instagram&field=followers&days=90");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { points: Array<{ date: string; value: number }> };
    expect(body.points.length).toBeGreaterThanOrEqual(2);
    const p1 = body.points.find((p) => p.date === "2026-04-20");
    const p2 = body.points.find((p) => p.date === "2026-04-22");
    expect(p1?.value).toBe(100);
    expect(p2?.value).toBe(120);
  });

  it("400 invalid field", async () => {
    const res = await authedCall("/api/analytics/account-timeseries?network=instagram&field=garbage&days=30");
    expect(res.status).toBe(400);
  });

  it("400 invalid network", async () => {
    const res = await authedCall("/api/analytics/account-timeseries?network=twitter&field=followers&days=30");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/analytics/post-performance", () => {
  it("returns published posts with latest metrics", async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'post 1', 'published', ?, ?)")
      .bind("p_an_api_pp", USER, now - 100_000, now - 100_000).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at, external_id) VALUES (?, ?, 'instagram', 'published', ?, 'ig_xyz')")
      .bind("t_an_api_pp", "p_an_api_pp", now - 100_000).run();
    await insertPostMetrics(env.DB, { id: "pm_pp_old", postId: "p_an_api_pp", targetId: "t_an_api_pp", network: "instagram",
      snapshotAt: now - 60_000, likes: 20, comments: 3, shares: null, saved: null, reach: 200, impressions: null, engagementRate: null, extra: null });
    await insertPostMetrics(env.DB, { id: "pm_pp_new", postId: "p_an_api_pp", targetId: "t_an_api_pp", network: "instagram",
      snapshotAt: now - 1000, likes: 50, comments: 8, shares: null, saved: null, reach: 400, impressions: null, engagementRate: null, extra: null });

    const res = await authedCall("/api/analytics/post-performance");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ postId: string; network: string; likes: number | null; comments: number | null }> };
    const item = body.items.find((i) => i.postId === "p_an_api_pp" && i.network === "instagram");
    expect(item).toBeDefined();
    expect(item?.likes).toBe(50); // latest
    expect(item?.comments).toBe(8);
  });

  it("includes posts with no metrics (nulls)", async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'no metrics', 'published', ?, ?)")
      .bind("p_an_api_nm", USER, now, now).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at, external_id) VALUES (?, ?, 'linkedin', 'published', ?, 'urn:x')")
      .bind("t_an_api_nm", "p_an_api_nm", now).run();

    const res = await authedCall("/api/analytics/post-performance");
    const body = (await res.json()) as { items: Array<{ postId: string; likes: number | null }> };
    const item = body.items.find((i) => i.postId === "p_an_api_nm");
    expect(item).toBeDefined();
    expect(item?.likes).toBeNull();
  });
});
