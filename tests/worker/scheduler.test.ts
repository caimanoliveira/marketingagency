/// <reference types="@cloudflare/workers-types" />
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
    .bind("u_sched_test", "sched@test.dev", "x", Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_sched_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'p_sched_%'").run();
});

function envWithMockQueue(sent: PublishJob[]): Env {
  const queue = { send: async (msg: PublishJob) => { sent.push(msg); } } as unknown as Queue<PublishJob>;
  return { ...env, PUBLISH_QUEUE: queue } as Env;
}

async function makeScheduledPost(id: string, network: string, scheduledAt: number) {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
    .bind(id, "u_sched_test", "test", now, now).run();
  await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, scheduled_at, attempts) VALUES (?, ?, ?, 'scheduled', ?, 0)")
    .bind(`t_${id}_${network}`, id, network, scheduledAt).run();
}

describe("scanAndEnqueue", () => {
  it("enqueues scheduled targets whose time has passed", async () => {
    const past = Date.now() - 60_000;
    await makeScheduledPost("p_sched_past", "linkedin", past);
    const sent: PublishJob[] = [];
    const n = await scanAndEnqueue(envWithMockQueue(sent));
    expect(n).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].network).toBe("linkedin");
    expect(sent[0].postId).toBe("p_sched_past");

    // Status should have moved to 'publishing'
    const row = await env.DB.prepare("SELECT status FROM post_targets WHERE post_id = ?")
      .bind("p_sched_past").first<{ status: string }>();
    expect(row?.status).toBe("publishing");
  });

  it("does not enqueue future-scheduled targets", async () => {
    const future = Date.now() + 60_000;
    await makeScheduledPost("p_sched_future", "linkedin", future);
    const sent: PublishJob[] = [];
    const n = await scanAndEnqueue(envWithMockQueue(sent));
    expect(n).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("does not re-enqueue targets already in 'publishing' status", async () => {
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
      .bind("p_sched_running", "u_sched_test", "x", Date.now(), Date.now()).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, scheduled_at) VALUES (?, ?, ?, 'publishing', ?)")
      .bind("t_sched_running", "p_sched_running", "linkedin", Date.now() - 10_000).run();
    const sent: PublishJob[] = [];
    const n = await scanAndEnqueue(envWithMockQueue(sent));
    expect(n).toBe(0);
  });
});
