import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";
import { scanAndEnqueue } from "../../src/worker/scheduler/cron";
import type { PublishJob } from "../../src/shared/types";
import type { Env } from "../../src/worker/index";

const TEST_USER = "u_tiktok_test";
const TEST_EMAIL = "tiktok@test.dev";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0, UNIQUE(post_id, network))`,
];

function envWithMockQueue(sent: PublishJob[]): Env {
  const queue = { send: async (msg: PublishJob) => { sent.push(msg); } } as unknown as Queue<PublishJob>;
  return { ...env, PUBLISH_QUEUE: queue } as Env;
}

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
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  const hash = await hashPassword("x");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(TEST_USER, TEST_EMAIL, hash, Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_tt_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'p_tt_%'").run();
});

describe("scanAndEnqueue with tiktok", () => {
  it("moves tiktok target to ready_to_post (does NOT enqueue)", async () => {
    const past = Date.now() - 60_000;
    const postId = "p_tt_1";
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
      .bind(postId, TEST_USER, "vai pro tiktok", past, past).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, scheduled_at) VALUES (?, ?, 'tiktok', 'scheduled', ?)")
      .bind("t_tt_1", postId, past).run();

    const sent: PublishJob[] = [];
    await scanAndEnqueue(envWithMockQueue(sent));

    expect(sent).toHaveLength(0);
    const row = await env.DB.prepare("SELECT status FROM post_targets WHERE id = ?").bind("t_tt_1").first<{ status: string }>();
    expect(row?.status).toBe("ready_to_post");
  });

  it("still enqueues linkedin in same batch", async () => {
    const past = Date.now() - 60_000;
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
      .bind("p_tt_mix", TEST_USER, "mix", past, past).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, scheduled_at) VALUES (?, ?, 'tiktok', 'scheduled', ?)")
      .bind("t_tt_mix_tt", "p_tt_mix", past).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, scheduled_at) VALUES (?, ?, 'linkedin', 'scheduled', ?)")
      .bind("t_tt_mix_li", "p_tt_mix", past).run();

    const sent: PublishJob[] = [];
    await scanAndEnqueue(envWithMockQueue(sent));

    expect(sent).toHaveLength(1);
    expect(sent[0].network).toBe("linkedin");
    const tt = await env.DB.prepare("SELECT status FROM post_targets WHERE id = ?").bind("t_tt_mix_tt").first<{ status: string }>();
    expect(tt?.status).toBe("ready_to_post");
    const li = await env.DB.prepare("SELECT status FROM post_targets WHERE id = ?").bind("t_tt_mix_li").first<{ status: string }>();
    expect(li?.status).toBe("publishing");
  });
});

describe("GET /api/posts/pending-manual", () => {
  it("returns only ready_to_post targets", async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
      .bind("p_tt_pm", TEST_USER, "manual!", now, now).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, scheduled_at) VALUES (?, ?, 'tiktok', 'ready_to_post', ?)")
      .bind("t_tt_pm", "p_tt_pm", now - 1000).run();

    const res = await authedCall("/api/posts/pending-manual");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ network: string; body: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].network).toBe("tiktok");
    expect(body.items[0].body).toBe("manual!");
  });
});

describe("POST /api/posts/:id/targets/:network/mark-published", () => {
  it("flips status to published", async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
      .bind("p_tt_mp", TEST_USER, "x", now, now).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status) VALUES (?, ?, 'tiktok', 'ready_to_post')")
      .bind("t_tt_mp", "p_tt_mp").run();

    const res = await authedCall("/api/posts/p_tt_mp/targets/tiktok/mark-published", {
      method: "POST",
      body: JSON.stringify({ externalUrl: "https://www.tiktok.com/@user/video/123" }),
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT status, external_id FROM post_targets WHERE id = ?").bind("t_tt_mp").first<{ status: string; external_id: string }>();
    expect(row?.status).toBe("published");
    expect(row?.external_id).toContain("tiktok.com");
  });

  it("404 for non-existent post", async () => {
    const res = await authedCall("/api/posts/p_nonex/targets/tiktok/mark-published", {
      method: "POST", body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});
