import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { collectMetrics } from "../../src/worker/analytics/collect";

const USER = "u_ccollect";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS linkedin_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, linkedin_member_id TEXT NOT NULL, linkedin_member_name TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT, expires_at INTEGER NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meta_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, fb_user_id TEXT NOT NULL, fb_user_name TEXT NOT NULL, access_token TEXT NOT NULL, expires_at INTEGER NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS instagram_accounts (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, ig_user_id TEXT NOT NULL, ig_username TEXT NOT NULL, fb_page_id TEXT NOT NULL, fb_page_name TEXT NOT NULL, fb_page_access_token TEXT NOT NULL, profile_picture_url TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_metrics (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, account_ref TEXT NOT NULL, snapshot_date TEXT NOT NULL, followers INTEGER, impressions INTEGER, reach INTEGER, profile_views INTEGER, extra_json TEXT, created_at INTEGER NOT NULL, UNIQUE(user_id, network, account_ref, snapshot_date))`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS competitors (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, username TEXT NOT NULL, display_name TEXT, profile_picture_url TEXT, added_at INTEGER NOT NULL, last_snapshot_at INTEGER, UNIQUE(user_id, network, username))`,
  `CREATE TABLE IF NOT EXISTS competitor_snapshots (id TEXT PRIMARY KEY, competitor_id TEXT NOT NULL, snapshot_date TEXT NOT NULL, followers INTEGER, media_count INTEGER, recent_avg_likes REAL, recent_avg_comments REAL, recent_posts_sampled INTEGER, extra_json TEXT, created_at INTEGER NOT NULL, UNIQUE(competitor_id, snapshot_date))`,
];

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(USER, "cc@test.dev", "x", Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM competitor_snapshots").run();
  await env.DB.prepare("DELETE FROM competitors WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM instagram_accounts WHERE connection_id LIKE 'mc_%'").run();
  await env.DB.prepare("DELETE FROM meta_connections WHERE user_id = ?").bind(USER).run();
});

describe("collectMetrics — competitors", () => {
  it("collects snapshot for each competitor with business_discovery payload", async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO meta_connections (id, user_id, fb_user_id, fb_user_name, access_token, expires_at, scopes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(`mc_${USER}`, USER, "fb1", "FB", "tok", now + 3600_000, "s", now, now).run();
    await env.DB.prepare("INSERT INTO instagram_accounts (id, connection_id, ig_user_id, ig_username, fb_page_id, fb_page_name, fb_page_access_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind("iga_cc", `mc_${USER}`, "my_ig", "mine", "page1", "Page", "page_tok", now).run();
    await env.DB.prepare("INSERT INTO competitors (id, user_id, network, username, added_at) VALUES (?, ?, 'instagram', ?, ?)")
      .bind("cmp_1", USER, "competitoraa", now).run();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/my_ig?fields=business_discovery")) {
        return new Response(JSON.stringify({
          business_discovery: {
            username: "competitoraa",
            name: "Competitor AA",
            profile_picture_url: "https://cdn.example/pic.jpg",
            followers_count: 12345,
            media_count: 200,
            media: {
              data: [
                { like_count: 100, comments_count: 10 },
                { like_count: 200, comments_count: 20 },
                { like_count: 150, comments_count: 15 },
              ],
            },
          },
        }), { status: 200 });
      }
      // IG account metrics (expected calls during collect loop)
      if (url.includes("/my_ig?fields=followers_count")) {
        return new Response(JSON.stringify({ followers_count: 500 }), { status: 200 });
      }
      if (url.includes("/my_ig/insights")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    try {
      const r = await collectMetrics(env);
      expect(r.errors).toEqual([]);
      const snap = await env.DB.prepare("SELECT followers, media_count, recent_avg_likes, recent_avg_comments, recent_posts_sampled FROM competitor_snapshots WHERE competitor_id = 'cmp_1'")
        .first<{ followers: number; media_count: number; recent_avg_likes: number; recent_avg_comments: number; recent_posts_sampled: number }>();
      expect(snap?.followers).toBe(12345);
      expect(snap?.media_count).toBe(200);
      expect(snap?.recent_avg_likes).toBeCloseTo(150);
      expect(snap?.recent_avg_comments).toBeCloseTo(15);
      expect(snap?.recent_posts_sampled).toBe(3);

      const comp = await env.DB.prepare("SELECT display_name, profile_picture_url FROM competitors WHERE id = 'cmp_1'")
        .first<{ display_name: string; profile_picture_url: string }>();
      expect(comp?.display_name).toBe("Competitor AA");
      expect(comp?.profile_picture_url).toBe("https://cdn.example/pic.jpg");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("skips gracefully when business_discovery returns 404 (competitor not found / private)", async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO meta_connections (id, user_id, fb_user_id, fb_user_name, access_token, expires_at, scopes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(`mc_${USER}`, USER, "fb1", "FB", "tok", now + 3600_000, "s", now, now).run();
    await env.DB.prepare("INSERT INTO instagram_accounts (id, connection_id, ig_user_id, ig_username, fb_page_id, fb_page_name, fb_page_access_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind("iga_cc2", `mc_${USER}`, "my_ig", "mine", "page1", "Page", "page_tok", now).run();
    await env.DB.prepare("INSERT INTO competitors (id, user_id, network, username, added_at) VALUES (?, ?, 'instagram', ?, ?)")
      .bind("cmp_bad", USER, "notfound", now).run();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("not found", { status: 404 }));
    try {
      const r = await collectMetrics(env);
      expect(r.errors).toEqual([]);
      const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM competitor_snapshots WHERE competitor_id = 'cmp_bad'").first<{ c: number }>();
      expect(count?.c).toBe(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
