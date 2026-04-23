import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { scanAndEnqueue } from "../../src/worker/scheduler/cron";
import type { PublishJob } from "../../src/shared/types";
import type { Env } from "../../src/worker/index";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0, UNIQUE(post_id, network))`,
];

beforeAll(async () => {
  for (const sql of SCHEMA_STATEMENTS) await env.DB.prepare(sql).run();
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind("u_tt", "tt@test.dev", "x", Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_tt_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'p_tt_%'").run();
});

function envWithMockQueue(sent: PublishJob[]): Env {
  const queue = { send: async (msg: PublishJob) => { sent.push(msg); } } as unknown as Queue<PublishJob>;
  return { ...env, PUBLISH_QUEUE: queue } as Env;
}

async function makeScheduledPost(id: string, network: string, scheduledAt: number) {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
    .bind(id, "u_tt", "tiktok test copy", now, now).run();
  await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, scheduled_at, attempts) VALUES (?, ?, ?, 'scheduled', ?, 0)")
    .bind(`t_${id}_${network}`, id, network, scheduledAt).run();
}

describe("scanAndEnqueue tiktok handling", () => {
  it("moves due tiktok target to ready_to_post (no queue)", async () => {
    const past = Date.now() - 60_000;
    await makeScheduledPost("p_tt_due", "tiktok", past);
    const sent: PublishJob[] = [];
    const n = await scanAndEnqueue(envWithMockQueue(sent));
    expect(n).toBe(1);
    expect(sent).toHaveLength(0); // No queue message for tiktok

    const row = await env.DB.prepare("SELECT status FROM post_targets WHERE post_id = ?")
      .bind("p_tt_due").first<{ status: string }>();
    expect(row?.status).toBe("ready_to_post");
  });

  it("does not touch tiktok scheduled in future", async () => {
    const future = Date.now() + 60_000;
    await makeScheduledPost("p_tt_future", "tiktok", future);
    const sent: PublishJob[] = [];
    const n = await scanAndEnqueue(envWithMockQueue(sent));
    expect(n).toBe(0);

    const row = await env.DB.prepare("SELECT status FROM post_targets WHERE post_id = ?")
      .bind("p_tt_future").first<{ status: string }>();
    expect(row?.status).toBe("scheduled");
  });

  it("handles mixed batch: tiktok → ready_to_post, linkedin → enqueued", async () => {
    const past = Date.now() - 30_000;
    await makeScheduledPost("p_tt_mix1", "tiktok", past);
    await makeScheduledPost("p_tt_mix2", "linkedin", past);
    const sent: PublishJob[] = [];
    const n = await scanAndEnqueue(envWithMockQueue(sent));
    expect(n).toBe(2);
    expect(sent).toHaveLength(1);
    expect(sent[0].network).toBe("linkedin");

    const tt = await env.DB.prepare("SELECT status FROM post_targets WHERE post_id = ?")
      .bind("p_tt_mix1").first<{ status: string }>();
    expect(tt?.status).toBe("ready_to_post");

    const ln = await env.DB.prepare("SELECT status FROM post_targets WHERE post_id = ?")
      .bind("p_tt_mix2").first<{ status: string }>();
    expect(ln?.status).toBe("publishing");
  });
});
