import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

const TEST_USER = "u_pm_test";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0, UNIQUE(post_id, network))`,
];

async function authedCall(path: string, init?: RequestInit) {
  const token = await signToken({ userId: TEST_USER }, env.JWT_SECRET);
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  headers.set("cookie", `session=${token}`);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeAll(async () => {
  for (const sql of SCHEMA_STATEMENTS) await env.DB.prepare(sql).run();
  const hash = await hashPassword("x");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(TEST_USER, "pm@test.dev", hash, Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_pm_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'p_pm_%'").run();
});

async function makeReadyToPostTarget(postId: string, network: string) {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
    .bind(postId, TEST_USER, `copy for ${postId}`, now, now).run();
  await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, scheduled_at, attempts) VALUES (?, ?, ?, 'ready_to_post', ?, 0)")
    .bind(`t_${postId}_${network}`, postId, network, now - 10_000).run();
  return `t_${postId}_${network}`;
}

describe("GET /api/posts/pending-manual", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/posts/pending-manual"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("returns ready_to_post targets for the user", async () => {
    await makeReadyToPostTarget("p_pm_a", "tiktok");
    await makeReadyToPostTarget("p_pm_b", "tiktok");
    const res = await authedCall("/api/posts/pending-manual");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: Array<{ postId: string; network: string; body: string }> };
    expect(data.items.length).toBeGreaterThanOrEqual(2);
    const postIds = data.items.map((i) => i.postId);
    expect(postIds).toContain("p_pm_a");
    expect(postIds).toContain("p_pm_b");
    for (const it of data.items) {
      if (it.postId === "p_pm_a") expect(it.body).toBe("copy for p_pm_a");
    }
  });

  it("excludes targets in other statuses", async () => {
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
      .bind("p_pm_other", TEST_USER, "x", Date.now(), Date.now()).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status) VALUES (?, ?, ?, 'pending')")
      .bind("t_pm_other", "p_pm_other", "tiktok").run();
    const res = await authedCall("/api/posts/pending-manual");
    const data = (await res.json()) as { items: Array<{ postId: string }> };
    expect(data.items.find((i) => i.postId === "p_pm_other")).toBeUndefined();
  });
});

describe("POST /api/posts/:id/targets/:network/mark-published", () => {
  it("flips status to published with optional URL", async () => {
    const tid = await makeReadyToPostTarget("p_pm_mark", "tiktok");
    const res = await authedCall("/api/posts/p_pm_mark/targets/tiktok/mark-published", {
      method: "POST",
      body: JSON.stringify({ externalUrl: "https://www.tiktok.com/@me/video/123" }),
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT status, external_id FROM post_targets WHERE id = ?")
      .bind(tid).first<{ status: string; external_id: string }>();
    expect(row?.status).toBe("published");
    expect(row?.external_id).toBe("https://www.tiktok.com/@me/video/123");
  });

  it("404 for foreign user post", async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind("u_pm_other_user", "other@test.dev", "x", Date.now()).run();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
      .bind("p_pm_foreign", "u_pm_other_user", "x", Date.now(), Date.now()).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status) VALUES (?, ?, ?, 'ready_to_post')")
      .bind("t_pm_foreign", "p_pm_foreign", "tiktok").run();

    const res = await authedCall("/api/posts/p_pm_foreign/targets/tiktok/mark-published", {
      method: "POST", body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});
