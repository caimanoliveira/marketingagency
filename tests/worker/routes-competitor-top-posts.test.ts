import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

vi.mock("../../src/worker/integrations/meta", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/worker/integrations/meta")>();
  return { ...actual, fetchCompetitorRecentPosts: vi.fn() };
});

import * as metaModule from "../../src/worker/integrations/meta";
const fetchCompetitorRecentPosts = metaModule.fetchCompetitorRecentPosts as unknown as ReturnType<typeof vi.fn>;

const TEST_USER = "u_ctp_test";
const TEST_EMAIL = "ctp@test.dev";
const COMP_ID = "cmp_ctp_1";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS competitors (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, username TEXT NOT NULL, display_name TEXT, profile_picture_url TEXT, added_at INTEGER NOT NULL, last_snapshot_at INTEGER, UNIQUE (user_id, network, username))`,
  `CREATE TABLE IF NOT EXISTS meta_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, fb_user_id TEXT NOT NULL, fb_user_name TEXT NOT NULL, access_token TEXT NOT NULL, expires_at INTEGER NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS instagram_accounts (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, ig_user_id TEXT NOT NULL, ig_username TEXT NOT NULL, fb_page_id TEXT NOT NULL, fb_page_name TEXT NOT NULL, fb_page_access_token TEXT NOT NULL, profile_picture_url TEXT, created_at INTEGER NOT NULL, UNIQUE(connection_id, ig_user_id))`,
];

async function authedCall(path: string, init?: RequestInit) {
  const token = await signToken({ userId: TEST_USER }, env.JWT_SECRET);
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  headers.set("cookie", `session=${token}`);
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeAll(async () => {
  for (const sql of SCHEMA_STATEMENTS) await env.DB.prepare(sql).run();
  const hash = await hashPassword("x");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(TEST_USER, TEST_EMAIL, hash, Date.now()).run();
  await env.DB.prepare("INSERT OR REPLACE INTO competitors (id, user_id, network, username, added_at) VALUES (?, ?, 'instagram', 'rival', ?)")
    .bind(COMP_ID, TEST_USER, Date.now()).run();
});

beforeEach(async () => {
  fetchCompetitorRecentPosts.mockReset();
  await env.DB.prepare("DELETE FROM instagram_accounts WHERE connection_id LIKE 'mc_ctp_%'").run();
  await env.DB.prepare("DELETE FROM meta_connections WHERE user_id = ?").bind(TEST_USER).run();
});

async function connectInstagram() {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO meta_connections (id, user_id, fb_user_id, fb_user_name, access_token, expires_at, scopes, created_at, updated_at) VALUES ('mc_ctp_1', ?, 'fb1', 'FB User', 'tok', ?, 'scopes', ?, ?)")
    .bind(TEST_USER, now + 86400000, now, now).run();
  await env.DB.prepare("INSERT INTO instagram_accounts (id, connection_id, ig_user_id, ig_username, fb_page_id, fb_page_name, fb_page_access_token, created_at) VALUES ('ia_ctp_1', 'mc_ctp_1', 'ig1', 'rivalme', 'pg1', 'Page', 'ptok', ?)")
    .bind(now).run();
}

describe("GET /api/competitors/:id/top-posts", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request(`http://x/api/competitors/${COMP_ID}/top-posts`), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("404 for unknown competitor", async () => {
    const res = await authedCall("/api/competitors/nope/top-posts");
    expect(res.status).toBe(404);
  });

  it("409 when Instagram is not connected", async () => {
    const res = await authedCall(`/api/competitors/${COMP_ID}/top-posts`);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("instagram_not_connected");
  });

  it("200 returns posts from business_discovery", async () => {
    await connectInstagram();
    fetchCompetitorRecentPosts.mockResolvedValueOnce([
      { caption: "post viral do rival", likes: 500, comments: 40, mediaType: "REEL", permalink: "https://ig/x", timestamp: "2026-07-01T00:00:00Z" },
    ]);
    const res = await authedCall(`/api/competitors/${COMP_ID}/top-posts`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ caption: string; likes: number }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].caption).toBe("post viral do rival");
    expect(fetchCompetitorRecentPosts).toHaveBeenCalledWith("ig1", "ptok", "rival");
  });

  it("502 when upstream fails", async () => {
    await connectInstagram();
    fetchCompetitorRecentPosts.mockResolvedValueOnce(null);
    const res = await authedCall(`/api/competitors/${COMP_ID}/top-posts`);
    expect(res.status).toBe(502);
  });
});
