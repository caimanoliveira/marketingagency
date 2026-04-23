import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { collectMetrics } from "../../src/worker/analytics/collect";

const USER = "u_collect_test";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS linkedin_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, linkedin_member_id TEXT NOT NULL, linkedin_member_name TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT, expires_at INTEGER NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meta_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, fb_user_id TEXT NOT NULL, fb_user_name TEXT NOT NULL, access_token TEXT NOT NULL, expires_at INTEGER NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS instagram_accounts (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, ig_user_id TEXT NOT NULL, ig_username TEXT NOT NULL, fb_page_id TEXT NOT NULL, fb_page_name TEXT NOT NULL, fb_page_access_token TEXT NOT NULL, profile_picture_url TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_metrics (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, account_ref TEXT NOT NULL, snapshot_date TEXT NOT NULL, followers INTEGER, impressions INTEGER, reach INTEGER, profile_views INTEGER, extra_json TEXT, created_at INTEGER NOT NULL, UNIQUE(user_id, network, account_ref, snapshot_date))`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
];

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(USER, "collect@test.dev", "x", Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_metrics").run();
  await env.DB.prepare("DELETE FROM account_metrics WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_col_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'p_col_%'").run();
  await env.DB.prepare("DELETE FROM instagram_accounts WHERE connection_id LIKE 'mc_%'").run();
  await env.DB.prepare("DELETE FROM meta_connections WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM linkedin_connections WHERE user_id = ?").bind(USER).run();
});

describe("collectMetrics", () => {
  it("processes zero users cleanly (other test users exist, no connections)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    try {
      const result = await collectMetrics(env);
      expect(result.usersProcessed).toBeGreaterThan(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("collects IG account + post metrics when connection+account+published post exist", async () => {
    // Seed connection + IG account + published post
    const now = Date.now();
    await env.DB.prepare("INSERT INTO meta_connections (id, user_id, fb_user_id, fb_user_name, access_token, expires_at, scopes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(`mc_${USER}`, USER, "fb1", "FB User", "tok", now + 3600_000, "scopes", now, now).run();
    await env.DB.prepare("INSERT INTO instagram_accounts (id, connection_id, ig_user_id, ig_username, fb_page_id, fb_page_name, fb_page_access_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind("iga_1", `mc_${USER}`, "ig_999", "me", "page1", "Page", "page_tok", now).run();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'x', 'published', ?, ?)")
      .bind("p_col_1", USER, now, now).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, target_ref, external_id, published_at) VALUES (?, ?, 'instagram', 'published', ?, ?, ?)")
      .bind("t_col_1", "p_col_1", "ig_999", "ig_media_abc", now - 1000).run();

    // Mock fetch responses in order: basic, insights, post insights
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes(`/ig_999?fields=followers_count`)) {
        return new Response(JSON.stringify({ followers_count: 500, media_count: 12 }), { status: 200 });
      }
      if (url.includes(`/ig_999/insights`)) {
        return new Response(JSON.stringify({ data: [
          { name: "impressions", values: [{ value: 10000 }] },
          { name: "reach", values: [{ value: 7500 }] },
          { name: "profile_views", values: [{ value: 80 }] },
        ] }), { status: 200 });
      }
      if (url.includes(`/ig_media_abc/insights`)) {
        return new Response(JSON.stringify({ data: [
          { name: "likes", values: [{ value: 120 }] },
          { name: "comments", values: [{ value: 15 }] },
          { name: "saved", values: [{ value: 10 }] },
          { name: "reach", values: [{ value: 800 }] },
          { name: "impressions", values: [{ value: 1100 }] },
          { name: "shares", values: [{ value: 5 }] },
        ] }), { status: 200 });
      }
      // fallback
      return new Response("{}", { status: 200 });
    });

    try {
      const result = await collectMetrics(env);
      expect(result.errors).toEqual([]);

      const acct = await env.DB.prepare("SELECT followers, impressions, reach FROM account_metrics WHERE account_ref = 'ig_999'")
        .first<{ followers: number; impressions: number; reach: number }>();
      expect(acct?.followers).toBe(500);
      expect(acct?.impressions).toBe(10000);
      expect(acct?.reach).toBe(7500);

      const pm = await env.DB.prepare("SELECT likes, comments, reach FROM post_metrics WHERE target_id = 't_col_1'")
        .first<{ likes: number; comments: number; reach: number }>();
      expect(pm?.likes).toBe(120);
      expect(pm?.comments).toBe(15);
      expect(pm?.reach).toBe(800);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("collects LinkedIn post metrics", async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO linkedin_connections (id, user_id, linkedin_member_id, linkedin_member_name, access_token, expires_at, scopes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(`lic_${USER}`, USER, "urn:li:person:me", "Me", "tok_li", now + 3600_000, "w_member_social", now, now).run();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'x', 'published', ?, ?)")
      .bind("p_col_li", USER, now, now).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, external_id, published_at) VALUES (?, ?, 'linkedin', 'published', ?, ?)")
      .bind("t_col_li", "p_col_li", "urn:li:ugcPost:123", now - 1000).run();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/socialActions/") && url.includes("/likes")) {
        return new Response(JSON.stringify({ paging: { total: 42 } }), { status: 200 });
      }
      if (url.includes("/socialActions/") && url.includes("/comments")) {
        return new Response(JSON.stringify({ paging: { total: 7 } }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    try {
      const result = await collectMetrics(env);
      expect(result.errors).toEqual([]);
      const pm = await env.DB.prepare("SELECT likes, comments FROM post_metrics WHERE target_id = 't_col_li'")
        .first<{ likes: number; comments: number }>();
      expect(pm?.likes).toBe(42);
      expect(pm?.comments).toBe(7);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
