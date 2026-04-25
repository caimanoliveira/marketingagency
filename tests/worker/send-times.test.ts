import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";
import { getBestSendTimes } from "../../src/worker/db/queries";

const USER = "u_send";
const OTHER = "u_send_other";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, pillar_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
];

function tsAt(weekday: number, hour: number): number {
  // Build a UTC date in the past matching given weekday (0=Sun) and hour
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7 + ((weekday - now.getUTCDay() + 7) % 7), hour, 0, 0));
  return d.getTime();
}

async function insertPublished(opts: { id: string; userId: string; network: string; publishedAt: number; engagement: number | null }) {
  await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'x', 'published', ?, ?)")
    .bind(opts.id, opts.userId, opts.publishedAt, opts.publishedAt).run();
  await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, ?, 'published', ?)")
    .bind(`t_${opts.id}`, opts.id, opts.network, opts.publishedAt).run();
  await env.DB.prepare(
    "INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, engagement_rate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(`m_${opts.id}`, opts.id, `t_${opts.id}`, opts.network, opts.publishedAt, opts.engagement, opts.publishedAt).run();
}

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  const hash = await hashPassword("x");
  for (const u of [USER, OTHER]) {
    await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(u, `${u}@t.dev`, hash, Date.now()).run();
  }
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_metrics").run();
  await env.DB.prepare("DELETE FROM post_targets").run();
  await env.DB.prepare("DELETE FROM posts").run();
});

async function authedCall(path: string) {
  const token = await signToken({ userId: USER }, env.JWT_SECRET);
  const ctx = createExecutionContext();
  const headers = new Headers();
  headers.set("cookie", `session=${token}`);
  const res = await worker.fetch(new Request(`http://x${path}`, { headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("getBestSendTimes", () => {
  it("aggregates by (weekday, hour, network)", async () => {
    await insertPublished({ id: "p1", userId: USER, network: "linkedin", publishedAt: tsAt(3, 14), engagement: 0.10 });
    await insertPublished({ id: "p2", userId: USER, network: "linkedin", publishedAt: tsAt(3, 14), engagement: 0.20 });
    await insertPublished({ id: "p3", userId: USER, network: "instagram", publishedAt: tsAt(3, 14), engagement: 0.05 });

    const rows = await getBestSendTimes(env.DB, USER, null, 30);
    const byKey = Object.fromEntries(rows.map((r) => [`${r.weekday}-${r.hour}-${r.network}`, r]));
    expect(byKey["3-14-linkedin"].sample_size).toBe(2);
    expect(byKey["3-14-linkedin"].avg_engagement_rate).toBeCloseTo(0.15, 5);
    expect(byKey["3-14-instagram"].sample_size).toBe(1);
  });

  it("filters by network when provided", async () => {
    await insertPublished({ id: "p1", userId: USER, network: "linkedin", publishedAt: tsAt(3, 14), engagement: 0.10 });
    await insertPublished({ id: "p2", userId: USER, network: "instagram", publishedAt: tsAt(3, 14), engagement: 0.20 });

    const rows = await getBestSendTimes(env.DB, USER, "linkedin", 30);
    expect(rows).toHaveLength(1);
    expect(rows[0].network).toBe("linkedin");
  });

  it("excludes published_at older than window", async () => {
    const oldTs = Date.now() - 60 * 86_400_000;
    await insertPublished({ id: "p_old", userId: USER, network: "linkedin", publishedAt: oldTs, engagement: 0.10 });
    const rows = await getBestSendTimes(env.DB, USER, null, 30);
    expect(rows).toHaveLength(0);
  });

  it("isolates between users", async () => {
    await insertPublished({ id: "p_mine", userId: USER, network: "linkedin", publishedAt: tsAt(3, 14), engagement: 0.10 });
    await insertPublished({ id: "p_other", userId: OTHER, network: "linkedin", publishedAt: tsAt(3, 14), engagement: 0.99 });

    const rows = await getBestSendTimes(env.DB, USER, null, 30);
    expect(rows).toHaveLength(1);
    expect(rows[0].avg_engagement_rate).toBeCloseTo(0.10, 5);
  });
});

describe("GET /api/analytics/send-times", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/analytics/send-times"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("returns aggregated buckets and accepts network filter", async () => {
    await insertPublished({ id: "p1", userId: USER, network: "linkedin", publishedAt: tsAt(2, 9), engagement: 0.30 });

    const all = await authedCall("/api/analytics/send-times");
    expect(all.status).toBe(200);
    const allBody = (await all.json()) as { items: Array<{ network: string; weekday: number; hour: number; avgEngagementRate: number | null }>; network: string | null; window: number };
    expect(allBody.items).toHaveLength(1);
    expect(allBody.items[0].weekday).toBe(2);
    expect(allBody.items[0].hour).toBe(9);
    expect(allBody.items[0].avgEngagementRate).toBeCloseTo(0.30, 5);

    const filtered = await authedCall("/api/analytics/send-times?network=instagram");
    const filteredBody = (await filtered.json()) as { items: unknown[] };
    expect(filteredBody.items).toEqual([]);
  });
});
