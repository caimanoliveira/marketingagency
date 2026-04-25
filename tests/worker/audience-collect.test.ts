import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

vi.mock("../../src/worker/integrations/meta", async () => ({
  fetchIgMediaComments: vi.fn(),
}));

import * as metaModule from "../../src/worker/integrations/meta";
const fetchIgMediaComments = metaModule.fetchIgMediaComments as unknown as ReturnType<typeof vi.fn>;

const USER = "u_aud_collect";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, pillar_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS post_comments_raw (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, external_comment_id TEXT, commenter_handle TEXT, body TEXT NOT NULL, posted_at INTEGER, fetched_at INTEGER NOT NULL, sentiment TEXT, topics_json TEXT, classified_at INTEGER, UNIQUE (network, external_comment_id))`,
  `CREATE TABLE IF NOT EXISTS meta_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, fb_user_id TEXT NOT NULL, fb_user_name TEXT NOT NULL, access_token TEXT NOT NULL, expires_at INTEGER NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS instagram_accounts (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, ig_user_id TEXT NOT NULL, ig_username TEXT NOT NULL, fb_page_id TEXT NOT NULL, fb_page_name TEXT NOT NULL, fb_page_access_token TEXT NOT NULL, profile_picture_url TEXT, created_at INTEGER NOT NULL)`,
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
    .bind(USER, "ac@test.dev", hash, Date.now()).run();
});

beforeEach(async () => {
  fetchIgMediaComments.mockReset();
  await env.DB.prepare("DELETE FROM post_comments_raw").run();
  await env.DB.prepare("DELETE FROM post_targets").run();
  await env.DB.prepare("DELETE FROM posts WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM instagram_accounts").run();
  await env.DB.prepare("DELETE FROM meta_connections WHERE user_id = ?").bind(USER).run();
});

async function seedConnection() {
  await env.DB.prepare("INSERT INTO meta_connections (id, user_id, fb_user_id, fb_user_name, access_token, expires_at, scopes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind("mc_1", USER, "fb_1", "Bob", "tok", Date.now() + 99999999, "scope", Date.now(), Date.now()).run();
  await env.DB.prepare("INSERT INTO instagram_accounts (id, connection_id, ig_user_id, ig_username, fb_page_id, fb_page_name, fb_page_access_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind("ig_1", "mc_1", "ig_user_1", "biz", "page_1", "Page", "page_token", Date.now()).run();
}

async function seedPublishedPost(id: string, externalId: string) {
  const ts = Date.now();
  await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'x', 'published', ?, ?)").bind(id, USER, ts, ts).run();
  await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, external_id, published_at) VALUES (?, ?, 'instagram', 'published', ?, ?)")
    .bind(`t_${id}`, id, externalId, ts).run();
}

describe("POST /api/audience/collect-now", () => {
  it("ingests comments for each published IG post", async () => {
    await seedConnection();
    await seedPublishedPost("p1", "ig_media_1");
    await seedPublishedPost("p2", "ig_media_2");

    fetchIgMediaComments.mockImplementation(async (mediaId: string) => {
      if (mediaId === "ig_media_1") {
        return [
          { externalId: "c_a", username: "alice", body: "amei", postedAt: Date.now() },
          { externalId: "c_b", username: "bob", body: "ok", postedAt: Date.now() },
        ];
      }
      if (mediaId === "ig_media_2") {
        return [{ externalId: "c_c", username: "carla", body: "horrível", postedAt: Date.now() }];
      }
      return [];
    });

    const res = await authedCall("/api/audience/collect-now", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { commentsIngested: number; usersProcessed: number };
    expect(body.commentsIngested).toBe(3);
    expect(body.usersProcessed).toBeGreaterThan(0);

    const rows = await env.DB.prepare("SELECT body, commenter_handle FROM post_comments_raw WHERE user_id = ? ORDER BY commenter_handle").bind(USER).all<{ body: string; commenter_handle: string }>();
    expect(rows.results).toHaveLength(3);
    const handles = (rows.results ?? []).map((r: { commenter_handle: string }) => r.commenter_handle);
    expect(handles).toContain("alice");
    expect(handles).toContain("carla");
  });

  it("upsert dedupes the same external_comment_id on a re-run", async () => {
    await seedConnection();
    await seedPublishedPost("p1", "ig_media_1");

    fetchIgMediaComments.mockResolvedValue([
      { externalId: "same_id", username: "alice", body: "v1", postedAt: Date.now() },
    ]);
    await authedCall("/api/audience/collect-now", { method: "POST" });

    fetchIgMediaComments.mockResolvedValue([
      { externalId: "same_id", username: "alice", body: "v2 edited", postedAt: Date.now() },
    ]);
    await authedCall("/api/audience/collect-now", { method: "POST" });

    const rows = await env.DB.prepare("SELECT body FROM post_comments_raw WHERE user_id = ?").bind(USER).all<{ body: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results![0].body).toBe("v2 edited");
  });

  it("skips users without IG connection without erroring", async () => {
    // No connection seeded
    const res = await authedCall("/api/audience/collect-now", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { commentsIngested: number; errors: string[] };
    expect(body.commentsIngested).toBe(0);
    expect(body.errors).toEqual([]);
    expect(fetchIgMediaComments).not.toHaveBeenCalled();
  });
});
