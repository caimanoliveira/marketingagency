import { describe, it, expect, beforeAll } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

const USER_ID = "u_reporttest";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT, period_days INTEGER NOT NULL DEFAULT 30, token TEXT NOT NULL UNIQUE, snapshot TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS linkedin_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, linkedin_member_id TEXT NOT NULL, linkedin_member_name TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT, expires_at INTEGER NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meta_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, fb_user_id TEXT NOT NULL, fb_user_name TEXT NOT NULL, access_token TEXT NOT NULL, expires_at INTEGER NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS instagram_accounts (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, ig_user_id TEXT NOT NULL, ig_username TEXT NOT NULL, fb_page_id TEXT NOT NULL, fb_page_name TEXT NOT NULL, fb_page_access_token TEXT NOT NULL, profile_picture_url TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', UNIQUE(post_id, network))`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS account_metrics (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, account_ref TEXT NOT NULL, snapshot_date TEXT NOT NULL, followers INTEGER, following INTEGER, impressions INTEGER, reach INTEGER, profile_views INTEGER, extra_json TEXT, created_at INTEGER NOT NULL, UNIQUE(user_id, network, account_ref, snapshot_date))`,
];

async function authedCall(path: string, init?: RequestInit) {
  const token = await signToken({ userId: USER_ID }, env.JWT_SECRET);
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  headers.set("cookie", `session=${token}`);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function publicCall(path: string) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://x${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  const hash = await hashPassword("hunter2");
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
  ).bind(USER_ID, "reporttest@lume.io", hash, Date.now()).run();
});

describe("Reports API", () => {
  it("POST /api/reports creates a report and returns shareUrl", async () => {
    const res = await authedCall("/api/reports", {
      method: "POST",
      body: JSON.stringify({ periodDays: 30, title: "April Report" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { report: { id: string; token: string; shareUrl: string; periodDays: number } };
    expect(body.report.shareUrl).toMatch(/\/r\//);
    expect(body.report.periodDays).toBe(30);
  });

  it("GET /api/reports lists created reports", async () => {
    const res = await authedCall("/api/reports");
    expect(res.status).toBe(200);
    const body = await res.json() as { reports: unknown[] };
    expect(body.reports.length).toBeGreaterThan(0);
  });

  it("public token route returns snapshot without auth", async () => {
    const createRes = await authedCall("/api/reports", {
      method: "POST",
      body: JSON.stringify({ periodDays: 7 }),
    });
    const { report } = await createRes.json() as { report: { token: string } };
    const pubRes = await publicCall(`/api/reports/public/${report.token}`);
    expect(pubRes.status).toBe(200);
    const data = await pubRes.json() as { snapshot: { periodDays: number } };
    expect(data.snapshot.periodDays).toBe(7);
  });

  it("DELETE /api/reports/:id deletes a report", async () => {
    const createRes = await authedCall("/api/reports", {
      method: "POST",
      body: JSON.stringify({ periodDays: 30 }),
    });
    const { report } = await createRes.json() as { report: { id: string } };
    const delRes = await authedCall(`/api/reports/${report.id}`, { method: "DELETE" });
    expect(delRes.status).toBe(200);
  });

  it("returns 404 for unknown or expired token", async () => {
    const res = await publicCall("/api/reports/public/nonexistent-token-xyz-abc");
    expect(res.status).toBe(404);
  });
});
