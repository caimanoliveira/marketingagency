import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

const USER = "u_comp_api";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meta_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, fb_user_id TEXT NOT NULL, fb_user_name TEXT NOT NULL, access_token TEXT NOT NULL, expires_at INTEGER NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS instagram_accounts (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, ig_user_id TEXT NOT NULL, ig_username TEXT NOT NULL, fb_page_id TEXT NOT NULL, fb_page_name TEXT NOT NULL, fb_page_access_token TEXT NOT NULL, profile_picture_url TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS competitors (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, username TEXT NOT NULL, display_name TEXT, profile_picture_url TEXT, added_at INTEGER NOT NULL, last_snapshot_at INTEGER, UNIQUE(user_id, network, username))`,
  `CREATE TABLE IF NOT EXISTS competitor_snapshots (id TEXT PRIMARY KEY, competitor_id TEXT NOT NULL, snapshot_date TEXT NOT NULL, followers INTEGER, media_count INTEGER, recent_avg_likes REAL, recent_avg_comments REAL, recent_posts_sampled INTEGER, extra_json TEXT, created_at INTEGER NOT NULL, UNIQUE(competitor_id, snapshot_date))`,
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
    .bind(USER, "comp_api@test.dev", hash, Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM competitor_snapshots").run();
  await env.DB.prepare("DELETE FROM competitors WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM instagram_accounts WHERE connection_id LIKE 'mc_%'").run();
  await env.DB.prepare("DELETE FROM meta_connections WHERE user_id = ?").bind(USER).run();
});

describe("GET /api/competitors", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/competitors"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("200 returns empty list initially", async () => {
    const res = await authedCall("/api/competitors");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });
});

describe("POST /api/competitors", () => {
  it("400 invalid username", async () => {
    const res = await authedCall("/api/competitors", { method: "POST", body: JSON.stringify({ username: "a b c!" }) });
    expect(res.status).toBe(400);
  });

  it("201 adds competitor without Meta connection (skips initial snapshot)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    try {
      const res = await authedCall("/api/competitors", { method: "POST", body: JSON.stringify({ username: "someprofile" }) });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; username: string };
      expect(body.username).toBe("someprofile");
      expect(body.id).toMatch(/^cmp_/);
    } finally { fetchSpy.mockRestore(); }
  });

  it("201 adds + fetches initial snapshot when Meta connected", async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO meta_connections (id, user_id, fb_user_id, fb_user_name, access_token, expires_at, scopes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(`mc_${USER}`, USER, "fb1", "FB", "tok", now + 3600_000, "s", now, now).run();
    await env.DB.prepare("INSERT INTO instagram_accounts (id, connection_id, ig_user_id, ig_username, fb_page_id, fb_page_name, fb_page_access_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind("iga_api", `mc_${USER}`, "my_ig_99", "me", "page1", "Page", "page_tok", now).run();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("business_discovery")) {
        return new Response(JSON.stringify({
          business_discovery: {
            username: "targetprof",
            name: "Target Prof",
            followers_count: 5000,
            media_count: 100,
            media: { data: [{ like_count: 20, comments_count: 2 }] },
          },
        }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    try {
      const res = await authedCall("/api/competitors", { method: "POST", body: JSON.stringify({ username: "targetprof" }) });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; displayName: string | null };
      expect(body.displayName).toBe("Target Prof");
      // snapshot should exist
      const snap = await env.DB.prepare("SELECT followers FROM competitor_snapshots WHERE competitor_id = ?").bind(body.id).first<{ followers: number }>();
      expect(snap?.followers).toBe(5000);
    } finally { fetchSpy.mockRestore(); }
  });

  it("409 duplicate", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    try {
      await authedCall("/api/competitors", { method: "POST", body: JSON.stringify({ username: "dupeme" }) });
      const res2 = await authedCall("/api/competitors", { method: "POST", body: JSON.stringify({ username: "dupeme" }) });
      expect(res2.status).toBe(409);
    } finally { fetchSpy.mockRestore(); }
  });
});

describe("DELETE /api/competitors/:id", () => {
  it("removes competitor + cascades snapshots", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    try {
      const addRes = await authedCall("/api/competitors", { method: "POST", body: JSON.stringify({ username: "todelete" }) });
      const { id } = (await addRes.json()) as { id: string };
      await env.DB.prepare("INSERT INTO competitor_snapshots (id, competitor_id, snapshot_date, followers, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind("snap_del", id, "2026-04-23", 100, Date.now()).run();
      const res = await authedCall(`/api/competitors/${id}`, { method: "DELETE" });
      expect(res.status).toBe(200);
      const snap = await env.DB.prepare("SELECT id FROM competitor_snapshots WHERE competitor_id = ?").bind(id).first();
      expect(snap).toBeNull();
    } finally { fetchSpy.mockRestore(); }
  });

  it("404 unknown id", async () => {
    const res = await authedCall("/api/competitors/cmp_nope", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/competitors/:id/snapshots", () => {
  it("returns snapshots array", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    try {
      const addRes = await authedCall("/api/competitors", { method: "POST", body: JSON.stringify({ username: "withdata" }) });
      const { id } = (await addRes.json()) as { id: string };
      await env.DB.prepare("INSERT INTO competitor_snapshots (id, competitor_id, snapshot_date, followers, media_count, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind("s1", id, "2026-04-20", 100, 50, Date.now()).run();
      await env.DB.prepare("INSERT INTO competitor_snapshots (id, competitor_id, snapshot_date, followers, media_count, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind("s2", id, "2026-04-22", 110, 51, Date.now()).run();
      const res = await authedCall(`/api/competitors/${id}/snapshots?days=30`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Array<{ date: string; followers: number | null }> };
      expect(body.items).toHaveLength(2);
      expect(body.items[0].date).toBe("2026-04-20");
      expect(body.items[1].followers).toBe(110);
    } finally { fetchSpy.mockRestore(); }
  });

  it("404 for other user's competitor", async () => {
    await env.DB.prepare("INSERT INTO competitors (id, user_id, network, username, added_at) VALUES (?, ?, 'instagram', ?, ?)")
      .bind("cmp_other", "u_other_user", "someoneelse", Date.now()).run();
    const res = await authedCall("/api/competitors/cmp_other/snapshots?days=30");
    expect(res.status).toBe(404);
  });
});
