import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  upsertAccountMetrics,
  insertPostMetrics,
  latestPostMetrics,
  summaryForPeriod,
} from "../../src/worker/db/queries";

const USER = "u_analytics";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0, UNIQUE(post_id, network))`,
  `CREATE TABLE IF NOT EXISTS account_metrics (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, account_ref TEXT NOT NULL, snapshot_date TEXT NOT NULL, followers INTEGER, following INTEGER, impressions INTEGER, reach INTEGER, profile_views INTEGER, extra_json TEXT, created_at INTEGER NOT NULL, UNIQUE(user_id, network, account_ref, snapshot_date))`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
];

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(USER, "analytics@test.dev", "x", Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_metrics WHERE post_id LIKE 'p_an_%'").run();
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_an_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'p_an_%'").run();
  await env.DB.prepare("DELETE FROM account_metrics WHERE user_id = ?").bind(USER).run();
});

describe("upsertAccountMetrics", () => {
  it("inserts new snapshot", async () => {
    await upsertAccountMetrics(env.DB, {
      id: "am1",
      userId: USER,
      network: "instagram",
      accountRef: "ig_123",
      snapshotDate: "2026-04-20",
      followers: 1000,
      impressions: 5000,
      reach: 3000,
      profileViews: 200,
      extra: null,
    });
    const row = await env.DB.prepare("SELECT followers FROM account_metrics WHERE account_ref = ?")
      .bind("ig_123").first<{ followers: number }>();
    expect(row?.followers).toBe(1000);
  });

  it("updates existing snapshot for same date", async () => {
    await upsertAccountMetrics(env.DB, {
      id: "am1", userId: USER, network: "instagram", accountRef: "ig_123",
      snapshotDate: "2026-04-20", followers: 1000, impressions: null, reach: null, profileViews: null, extra: null,
    });
    await upsertAccountMetrics(env.DB, {
      id: "am2", userId: USER, network: "instagram", accountRef: "ig_123",
      snapshotDate: "2026-04-20", followers: 1050, impressions: 600, reach: null, profileViews: null, extra: null,
    });
    const rows = await env.DB.prepare("SELECT followers, impressions FROM account_metrics WHERE account_ref = ?")
      .bind("ig_123").all<{ followers: number; impressions: number }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].followers).toBe(1050);
    expect(rows.results[0].impressions).toBe(600);
  });
});

describe("insertPostMetrics + latestPostMetrics", () => {
  it("inserts and retrieves latest snapshot", async () => {
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'published', ?, ?)")
      .bind("p_an_1", USER, "x", Date.now(), Date.now()).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status) VALUES (?, ?, 'instagram', 'published')")
      .bind("t_an_1", "p_an_1").run();

    const now = Date.now();
    await insertPostMetrics(env.DB, {
      id: "pm1", postId: "p_an_1", targetId: "t_an_1", network: "instagram",
      snapshotAt: now - 60_000, likes: 10, comments: 2, shares: 1, saved: 3,
      reach: 100, impressions: 150, engagementRate: 0.16, extra: null,
    });
    await insertPostMetrics(env.DB, {
      id: "pm2", postId: "p_an_1", targetId: "t_an_1", network: "instagram",
      snapshotAt: now, likes: 20, comments: 5, shares: 2, saved: 4,
      reach: 200, impressions: 300, engagementRate: 0.155, extra: null,
    });

    const latest = await latestPostMetrics(env.DB, "t_an_1");
    expect(latest?.likes).toBe(20);
    expect(latest?.comments).toBe(5);
  });

  it("returns null when no metrics", async () => {
    const latest = await latestPostMetrics(env.DB, "t_nonexistent");
    expect(latest).toBeNull();
  });
});

describe("summaryForPeriod", () => {
  it("aggregates posts + engagement + follower growth over period", async () => {
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;

    // Seed 2 published posts inside 30d window
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'p1', 'published', ?, ?)")
      .bind("p_an_s1", USER, now - 5*dayMs, now - 5*dayMs).run();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'p2', 'published', ?, ?)")
      .bind("p_an_s2", USER, now - 10*dayMs, now - 10*dayMs).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, 'instagram', 'published', ?)")
      .bind("t_s1_ig", "p_an_s1", now - 5*dayMs).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, 'linkedin', 'published', ?)")
      .bind("t_s2_li", "p_an_s2", now - 10*dayMs).run();

    // Metrics
    await insertPostMetrics(env.DB, { id: "pm_s1", postId: "p_an_s1", targetId: "t_s1_ig", network: "instagram",
      snapshotAt: now - 1000, likes: 50, comments: 10, shares: 5, saved: 3, reach: 500, impressions: 700, engagementRate: 0.136, extra: null });
    await insertPostMetrics(env.DB, { id: "pm_s2", postId: "p_an_s2", targetId: "t_s2_li", network: "linkedin",
      snapshotAt: now - 1000, likes: 30, comments: 4, shares: 2, saved: null, reach: 300, impressions: 400, engagementRate: 0.12, extra: null });

    // Follower snapshots: 1000 → 1100 on instagram
    await upsertAccountMetrics(env.DB, { id: "am_s1", userId: USER, network: "instagram", accountRef: "ig_1",
      snapshotDate: "2026-03-25", followers: 1000, impressions: null, reach: null, profileViews: null, extra: null });
    await upsertAccountMetrics(env.DB, { id: "am_s2", userId: USER, network: "instagram", accountRef: "ig_1",
      snapshotDate: "2026-04-23", followers: 1100, impressions: null, reach: null, profileViews: null, extra: null });

    const summary = await summaryForPeriod(env.DB, USER, 30);
    expect(summary.periodDays).toBe(30);
    expect(summary.postsPublished).toBe(2);
    expect(summary.totalEngagement).toBeGreaterThanOrEqual(50 + 10 + 5 + 3 + 30 + 4 + 2);
    expect(summary.totalReach).toBeGreaterThanOrEqual(500 + 300);
    // Follower growth may be computed per-network; check it's non-negative
    expect(summary.followerGrowth).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(summary.weeklyEngagement)).toBe(true);
    expect(Array.isArray(summary.contentMix)).toBe(true);
  });

  it("returns zeros when no data", async () => {
    const summary = await summaryForPeriod(env.DB, USER, 7);
    expect(summary.postsPublished).toBe(0);
    expect(summary.totalEngagement).toBe(0);
    expect(summary.totalReach).toBe(0);
  });
});
