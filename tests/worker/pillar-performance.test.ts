import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  createPost, updatePost, getPostById,
  upsertPillar,
  getPillarPerformance, getPillarPerformanceWeekly,
  listUnclassifiedPosts, setPostPillar,
} from "../../src/worker/db/queries";

const USER = "u_perf";
const OTHER = "u_other_perf";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS content_pillars (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, color TEXT, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, pillar_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0, UNIQUE (post_id, network))`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
];

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  for (const uid of [USER, OTHER]) {
    await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(uid, `${uid}@t.dev`, "x", Date.now()).run();
  }
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_metrics").run();
  await env.DB.prepare("DELETE FROM post_targets").run();
  await env.DB.prepare("DELETE FROM posts").run();
  await env.DB.prepare("DELETE FROM content_pillars").run();
});

async function insertMetric(
  params: { id: string; postId: string; targetId: string; network: string; snapshotAt: number; likes?: number; comments?: number; reach?: number; engagementRate?: number }
) {
  await env.DB.prepare(
    `INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, likes, comments, reach, engagement_rate, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    params.id, params.postId, params.targetId, params.network, params.snapshotAt,
    params.likes ?? null, params.comments ?? null, params.reach ?? null,
    params.engagementRate ?? null, Date.now()
  ).run();
}

async function insertTarget(id: string, postId: string, network: string) {
  await env.DB.prepare(
    `INSERT INTO post_targets (id, post_id, network, status) VALUES (?, ?, ?, 'published')`
  ).bind(id, postId, network).run();
}

describe("createPost / updatePost with pillarId", () => {
  it("createPost persists pillarId", async () => {
    await upsertPillar(env.DB, { id: "pil1", userId: USER, title: "A", description: null, color: "#aaa", position: 0 });
    await createPost(env.DB, { id: "p_a", userId: USER, body: "hello", mediaId: null, pillarId: "pil1" });
    const row = await getPostById(env.DB, USER, "p_a");
    expect(row?.pillar_id).toBe("pil1");
  });

  it("updatePost sets pillarId and clears it", async () => {
    await upsertPillar(env.DB, { id: "pil1", userId: USER, title: "A", description: null, color: null, position: 0 });
    await createPost(env.DB, { id: "p_b", userId: USER, body: "x", mediaId: null });
    expect((await getPostById(env.DB, USER, "p_b"))?.pillar_id).toBeNull();

    await updatePost(env.DB, USER, "p_b", { pillarId: "pil1" });
    expect((await getPostById(env.DB, USER, "p_b"))?.pillar_id).toBe("pil1");

    await updatePost(env.DB, USER, "p_b", { pillarId: null });
    expect((await getPostById(env.DB, USER, "p_b"))?.pillar_id).toBeNull();
  });
});

describe("getPillarPerformance", () => {
  it("returns every pillar with zeros when no posts", async () => {
    await upsertPillar(env.DB, { id: "pA", userId: USER, title: "A", description: null, color: "#111", position: 0 });
    await upsertPillar(env.DB, { id: "pB", userId: USER, title: "B", description: null, color: "#222", position: 1 });
    const rows = await getPillarPerformance(env.DB, USER, 30);
    expect(rows).toHaveLength(2);
    expect(rows[0].post_count).toBe(0);
    expect(rows[0].avg_engagement_rate).toBeNull();
    expect(rows[0].total_reach).toBeNull();
  });

  it("aggregates engagement across posts in a pillar", async () => {
    await upsertPillar(env.DB, { id: "pA", userId: USER, title: "A", description: null, color: null, position: 0 });
    await upsertPillar(env.DB, { id: "pB", userId: USER, title: "B", description: null, color: null, position: 1 });

    // pillar A: 2 posts, engagement 0.10 and 0.20 -> avg 0.15
    await createPost(env.DB, { id: "p1", userId: USER, body: "x", mediaId: null, pillarId: "pA" });
    await createPost(env.DB, { id: "p2", userId: USER, body: "x", mediaId: null, pillarId: "pA" });
    await insertTarget("t1", "p1", "linkedin");
    await insertTarget("t2", "p2", "instagram");
    await insertMetric({ id: "m1", postId: "p1", targetId: "t1", network: "linkedin", snapshotAt: Date.now(), likes: 10, comments: 2, reach: 100, engagementRate: 0.10 });
    await insertMetric({ id: "m2", postId: "p2", targetId: "t2", network: "instagram", snapshotAt: Date.now(), likes: 20, comments: 4, reach: 200, engagementRate: 0.20 });

    // pillar B: 1 post, no metrics
    await createPost(env.DB, { id: "p3", userId: USER, body: "x", mediaId: null, pillarId: "pB" });
    await insertTarget("t3", "p3", "linkedin");

    const rows = await getPillarPerformance(env.DB, USER, 30);
    const byId = Object.fromEntries(rows.map((r) => [r.pillar_id, r]));
    expect(byId.pA.post_count).toBe(2);
    expect(byId.pA.avg_engagement_rate).toBeCloseTo(0.15, 5);
    expect(byId.pA.total_reach).toBe(300);
    expect(byId.pA.total_likes).toBe(30);
    expect(byId.pB.post_count).toBe(1);
    expect(byId.pB.avg_engagement_rate).toBeNull();
  });

  it("excludes posts older than window", async () => {
    await upsertPillar(env.DB, { id: "pA", userId: USER, title: "A", description: null, color: null, position: 0 });
    const oldTs = Date.now() - 40 * 86_400_000;
    await env.DB.prepare(
      `INSERT INTO posts (id, user_id, body, pillar_id, status, created_at, updated_at) VALUES (?, ?, 'x', ?, 'published', ?, ?)`
    ).bind("p_old", USER, "pA", oldTs, oldTs).run();

    const rows = await getPillarPerformance(env.DB, USER, 30);
    expect(rows[0].post_count).toBe(0);
  });

  it("isolates between users", async () => {
    await upsertPillar(env.DB, { id: "pA", userId: USER, title: "A", description: null, color: null, position: 0 });
    await upsertPillar(env.DB, { id: "pA_other", userId: OTHER, title: "A", description: null, color: null, position: 0 });
    await createPost(env.DB, { id: "p1", userId: USER, body: "x", mediaId: null, pillarId: "pA" });
    await createPost(env.DB, { id: "p2", userId: OTHER, body: "x", mediaId: null, pillarId: "pA_other" });

    const mine = await getPillarPerformance(env.DB, USER, 30);
    expect(mine).toHaveLength(1);
    expect(mine[0].pillar_id).toBe("pA");
    expect(mine[0].post_count).toBe(1);
  });
});

describe("getPillarPerformanceWeekly", () => {
  it("buckets by week_start and returns per-pillar rows", async () => {
    await upsertPillar(env.DB, { id: "pA", userId: USER, title: "A", description: null, color: null, position: 0 });
    await createPost(env.DB, { id: "p1", userId: USER, body: "x", mediaId: null, pillarId: "pA" });
    await insertTarget("t1", "p1", "linkedin");
    await insertMetric({ id: "m1", postId: "p1", targetId: "t1", network: "linkedin", snapshotAt: Date.now(), engagementRate: 0.1, reach: 100 });

    const rows = await getPillarPerformanceWeekly(env.DB, USER, 4);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].pillar_id).toBe("pA");
    expect(rows[0].post_count).toBeGreaterThanOrEqual(1);
  });
});

describe("listUnclassifiedPosts / setPostPillar", () => {
  it("lists only posts without pillar and with non-empty body", async () => {
    await upsertPillar(env.DB, { id: "pA", userId: USER, title: "A", description: null, color: null, position: 0 });
    await createPost(env.DB, { id: "p1", userId: USER, body: "hello", mediaId: null });
    await createPost(env.DB, { id: "p2", userId: USER, body: "world", mediaId: null, pillarId: "pA" });
    await createPost(env.DB, { id: "p3", userId: USER, body: "", mediaId: null });

    const rows = await listUnclassifiedPosts(env.DB, USER, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("p1");
  });

  it("setPostPillar enforces user ownership", async () => {
    await upsertPillar(env.DB, { id: "pA", userId: USER, title: "A", description: null, color: null, position: 0 });
    await createPost(env.DB, { id: "p1", userId: USER, body: "x", mediaId: null });
    const ok = await setPostPillar(env.DB, USER, "p1", "pA");
    expect(ok).toBe(true);
    const row = await getPostById(env.DB, USER, "p1");
    expect(row?.pillar_id).toBe("pA");

    const bad = await setPostPillar(env.DB, OTHER, "p1", "pA");
    expect(bad).toBe(false);
  });
});
