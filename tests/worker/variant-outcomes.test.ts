import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";
import { recordVariantOutcome, getWinningVariants } from "../../src/worker/db/queries";

const USER = "u_var";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, pillar_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ai_variant_outcomes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT, tone TEXT, variant_text TEXT NOT NULL, post_id TEXT, applied_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ai_generations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER, duration_ms INTEGER, created_at INTEGER NOT NULL)`,
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
    .bind(USER, "var@test.dev", hash, Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM ai_variant_outcomes WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM post_metrics").run();
  await env.DB.prepare("DELETE FROM post_targets").run();
  await env.DB.prepare("DELETE FROM posts WHERE user_id = ?").bind(USER).run();
});

describe("POST /api/ai/variants/applied", () => {
  it("persists a variant outcome", async () => {
    const res = await authedCall("/api/ai/variants/applied", {
      method: "POST",
      body: JSON.stringify({ variantText: "hook one", network: "linkedin", tone: "casual", postId: null }),
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT * FROM ai_variant_outcomes WHERE user_id = ?").bind(USER).first<{ variant_text: string; network: string; tone: string }>();
    expect(row?.variant_text).toBe("hook one");
    expect(row?.network).toBe("linkedin");
    expect(row?.tone).toBe("casual");
  });

  it("400 on invalid network", async () => {
    const res = await authedCall("/api/ai/variants/applied", {
      method: "POST",
      body: JSON.stringify({ variantText: "x", network: "twitter" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("getWinningVariants", () => {
  it("returns variants ordered by engagement_rate of their post, capped at limit", async () => {
    // Two posts with different engagement, each linked to a variant outcome
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES ('p1', ?, 'b1', 'published', ?, ?)").bind(USER, Date.now(), Date.now()).run();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES ('p2', ?, 'b2', 'published', ?, ?)").bind(USER, Date.now(), Date.now()).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status) VALUES ('t1', 'p1', 'linkedin', 'published')").run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status) VALUES ('t2', 'p2', 'linkedin', 'published')").run();
    await env.DB.prepare("INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, engagement_rate, created_at) VALUES ('m1', 'p1', 't1', 'linkedin', ?, 0.10, ?)").bind(Date.now(), Date.now()).run();
    await env.DB.prepare("INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, engagement_rate, created_at) VALUES ('m2', 'p2', 't2', 'linkedin', ?, 0.30, ?)").bind(Date.now(), Date.now()).run();

    await recordVariantOutcome(env.DB, { id: "v1", userId: USER, network: "linkedin", tone: null, variantText: "low engagement variant", postId: "p1" });
    await recordVariantOutcome(env.DB, { id: "v2", userId: USER, network: "linkedin", tone: null, variantText: "high engagement variant", postId: "p2" });

    const winners = await getWinningVariants(env.DB, USER, 30, 5);
    expect(winners[0].variant_text).toBe("high engagement variant");
    expect(winners[0].engagement_rate).toBeCloseTo(0.30, 5);
    expect(winners[1].variant_text).toBe("low engagement variant");
  });

  it("excludes variants with null post_id", async () => {
    await recordVariantOutcome(env.DB, { id: "v_orphan", userId: USER, network: null, tone: null, variantText: "no post", postId: null });
    const winners = await getWinningVariants(env.DB, USER, 30, 5);
    expect(winners).toHaveLength(0);
  });
});
