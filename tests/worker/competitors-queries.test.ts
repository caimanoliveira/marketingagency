import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  addCompetitor,
  listCompetitors,
  removeCompetitor,
  upsertCompetitorSnapshot,
  listCompetitorSnapshots,
  topPosts,
  summaryForRange,
  insertPostMetrics,
} from "../../src/worker/db/queries";

const USER = "u_w8";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_metrics (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, account_ref TEXT NOT NULL, snapshot_date TEXT NOT NULL, followers INTEGER, impressions INTEGER, reach INTEGER, profile_views INTEGER, extra_json TEXT, created_at INTEGER NOT NULL, UNIQUE(user_id, network, account_ref, snapshot_date))`,
  `CREATE TABLE IF NOT EXISTS competitors (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, username TEXT NOT NULL, display_name TEXT, profile_picture_url TEXT, added_at INTEGER NOT NULL, last_snapshot_at INTEGER, UNIQUE(user_id, network, username))`,
  `CREATE TABLE IF NOT EXISTS competitor_snapshots (id TEXT PRIMARY KEY, competitor_id TEXT NOT NULL, snapshot_date TEXT NOT NULL, followers INTEGER, media_count INTEGER, recent_avg_likes REAL, recent_avg_comments REAL, recent_posts_sampled INTEGER, extra_json TEXT, created_at INTEGER NOT NULL, UNIQUE(competitor_id, snapshot_date))`,
];

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(USER, "w8@test.dev", "x", Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM competitor_snapshots").run();
  await env.DB.prepare("DELETE FROM competitors WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM post_metrics WHERE post_id LIKE 'p_w8_%'").run();
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_w8_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'p_w8_%'").run();
});

describe("competitors CRUD", () => {
  it("adds, lists, removes", async () => {
    await addCompetitor(env.DB, { id: "c1", userId: USER, network: "instagram", username: "cristiano", displayName: "Cristiano", profilePictureUrl: null });
    await addCompetitor(env.DB, { id: "c2", userId: USER, network: "instagram", username: "neymarjr", displayName: "Neymar", profilePictureUrl: null });
    const list = await listCompetitors(env.DB, USER);
    expect(list.map((c) => c.username).sort()).toEqual(["cristiano", "neymarjr"]);
    const removed = await removeCompetitor(env.DB, USER, "c1");
    expect(removed).toBe(true);
    const list2 = await listCompetitors(env.DB, USER);
    expect(list2).toHaveLength(1);
  });

  it("remove returns false for nonexistent/other user's competitor", async () => {
    const r = await removeCompetitor(env.DB, USER, "c_nonexistent");
    expect(r).toBe(false);
  });
});

describe("competitor snapshots", () => {
  it("upsert is idempotent per date", async () => {
    await addCompetitor(env.DB, { id: "cs1", userId: USER, network: "instagram", username: "test", displayName: null, profilePictureUrl: null });
    await upsertCompetitorSnapshot(env.DB, { id: "sn1", competitorId: "cs1", snapshotDate: "2026-04-23", followers: 1000, mediaCount: 50, recentAvgLikes: 120.5, recentAvgComments: 8.2, recentPostsSampled: 9 });
    await upsertCompetitorSnapshot(env.DB, { id: "sn2", competitorId: "cs1", snapshotDate: "2026-04-23", followers: 1010, mediaCount: 51, recentAvgLikes: 125.0, recentAvgComments: 9.0, recentPostsSampled: 9 });
    const snaps = await listCompetitorSnapshots(env.DB, "cs1", 30);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].followers).toBe(1010);
  });

  it("list returns recent snapshots in asc date order", async () => {
    await addCompetitor(env.DB, { id: "cs2", userId: USER, network: "instagram", username: "test2", displayName: null, profilePictureUrl: null });
    await upsertCompetitorSnapshot(env.DB, { id: "snA", competitorId: "cs2", snapshotDate: "2026-04-20", followers: 100, mediaCount: 10, recentAvgLikes: 5, recentAvgComments: 1, recentPostsSampled: 3 });
    await upsertCompetitorSnapshot(env.DB, { id: "snB", competitorId: "cs2", snapshotDate: "2026-04-22", followers: 110, mediaCount: 11, recentAvgLikes: 6, recentAvgComments: 1, recentPostsSampled: 3 });
    const snaps = await listCompetitorSnapshots(env.DB, "cs2", 90);
    expect(snaps.map((s) => s.date)).toEqual(["2026-04-20", "2026-04-22"]);
  });
});

describe("topPosts", () => {
  it("ranks by latest metrics", async () => {
    const now = Date.now();
    // 3 published posts with different metrics
    for (const [i, likes, comments] of [[1, 100, 10], [2, 50, 5], [3, 200, 20]] as const) {
      await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'published', ?, ?)")
        .bind(`p_w8_top${i}`, USER, `post ${i}`, now - 10000, now - 10000).run();
      await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at, external_id) VALUES (?, ?, 'instagram', 'published', ?, ?)")
        .bind(`t_w8_top${i}`, `p_w8_top${i}`, now - 10000, `ig_${i}`).run();
      await insertPostMetrics(env.DB, {
        id: `pm_w8_top${i}`, postId: `p_w8_top${i}`, targetId: `t_w8_top${i}`, network: "instagram",
        snapshotAt: now - 1000, likes, comments, shares: null, saved: null, reach: 500, impressions: null, engagementRate: (likes + comments) / 500, extra: null,
      });
    }

    const byEngagement = await topPosts(env.DB, USER, { limit: 10, by: "likes" });
    expect(byEngagement).toHaveLength(3);
    expect(byEngagement[0].postId).toBe("p_w8_top3");      // 200 likes
    expect(byEngagement[1].postId).toBe("p_w8_top1");      // 100
    expect(byEngagement[2].postId).toBe("p_w8_top2");      // 50
  });

  it("excludes unpublished posts", async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'draft', 'draft', ?, ?)")
      .bind("p_w8_draft", USER, now, now).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status) VALUES (?, ?, 'instagram', 'pending')")
      .bind("t_w8_draft", "p_w8_draft").run();
    const tops = await topPosts(env.DB, USER, { limit: 10, by: "likes" });
    expect(tops.map((t) => t.postId)).not.toContain("p_w8_draft");
  });
});

describe("summaryForRange", () => {
  it("aggregates posts published in the given range only", async () => {
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;
    // Post in range (2 days ago)
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'x', 'published', ?, ?)")
      .bind("p_w8_r1", USER, now - 2*dayMs, now - 2*dayMs).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, 'instagram', 'published', ?)")
      .bind("t_w8_r1", "p_w8_r1", now - 2*dayMs).run();
    await insertPostMetrics(env.DB, { id: "pm_w8_r1", postId: "p_w8_r1", targetId: "t_w8_r1", network: "instagram",
      snapshotAt: now - 1000, likes: 10, comments: 2, shares: 1, saved: 1, reach: 100, impressions: null, engagementRate: null, extra: null });
    // Post outside range (10 days ago)
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'y', 'published', ?, ?)")
      .bind("p_w8_r2", USER, now - 10*dayMs, now - 10*dayMs).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, 'linkedin', 'published', ?)")
      .bind("t_w8_r2", "p_w8_r2", now - 10*dayMs).run();
    await insertPostMetrics(env.DB, { id: "pm_w8_r2", postId: "p_w8_r2", targetId: "t_w8_r2", network: "linkedin",
      snapshotAt: now - 1000, likes: 50, comments: 5, shares: null, saved: null, reach: 500, impressions: null, engagementRate: null, extra: null });

    const summary = await summaryForRange(env.DB, USER, now - 7*dayMs, now);
    expect(summary.postsPublished).toBe(1);
    expect(summary.totalEngagement).toBe(10 + 2 + 1 + 1);   // only in-range post
    expect(summary.totalReach).toBe(100);
  });
});
