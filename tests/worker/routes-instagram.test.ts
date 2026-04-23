import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

vi.mock("../../src/worker/integrations/meta", async () => {
  return {
    buildOAuthUrl: vi.fn(() => "https://www.facebook.com/v20.0/dialog/oauth?mock=1"),
    exchangeCodeForToken: vi.fn(),
    exchangeForLongLivedToken: vi.fn(),
    fetchMetaUserInfo: vi.fn(),
    resolveInstagramAccounts: vi.fn(),
  };
});

import * as metaModule from "../../src/worker/integrations/meta";
const exchangeCodeForToken = metaModule.exchangeCodeForToken as unknown as ReturnType<typeof vi.fn>;
const exchangeForLongLivedToken = metaModule.exchangeForLongLivedToken as unknown as ReturnType<typeof vi.fn>;
const fetchMetaUserInfo = metaModule.fetchMetaUserInfo as unknown as ReturnType<typeof vi.fn>;
const resolveInstagramAccounts = metaModule.resolveInstagramAccounts as unknown as ReturnType<typeof vi.fn>;

const TEST_USER = "u_ig_test";
const TEST_EMAIL = "ig@test.dev";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, redirect_to TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meta_connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, fb_user_id TEXT NOT NULL, fb_user_name TEXT NOT NULL, access_token TEXT NOT NULL, expires_at INTEGER NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS instagram_accounts (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, ig_user_id TEXT NOT NULL, ig_username TEXT NOT NULL, fb_page_id TEXT NOT NULL, fb_page_name TEXT NOT NULL, fb_page_access_token TEXT NOT NULL, profile_picture_url TEXT, created_at INTEGER NOT NULL, UNIQUE(connection_id, ig_user_id))`,
];

async function authedCall(path: string, init?: RequestInit) {
  const token = await signToken({ userId: TEST_USER }, env.JWT_SECRET);
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  headers.set("cookie", `session=${token}`);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers, redirect: "manual" }), env, ctx);
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
  exchangeCodeForToken.mockReset();
  exchangeForLongLivedToken.mockReset();
  fetchMetaUserInfo.mockReset();
  resolveInstagramAccounts.mockReset();
  await env.DB.prepare("DELETE FROM instagram_accounts WHERE connection_id LIKE 'mc_%'").run();
  await env.DB.prepare("DELETE FROM meta_connections WHERE user_id = ?").bind(TEST_USER).run();
  await env.DB.prepare("DELETE FROM oauth_states WHERE user_id = ?").bind(TEST_USER).run();
});

describe("GET /api/connections/instagram (status)", () => {
  it("returns connected:false when no connection", async () => {
    const res = await authedCall("/api/connections/instagram");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: boolean };
    expect(body.connected).toBe(false);
  });

  it("returns connected:true with accounts after manual seed", async () => {
    const connId = `mc_${TEST_USER}`;
    const now = Date.now();
    await env.DB.prepare("INSERT INTO meta_connections (id, user_id, fb_user_id, fb_user_name, access_token, expires_at, scopes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(connId, TEST_USER, "fb_123", "Caiman Test", "tok", now + 60_000_000, "instagram_basic", now, now).run();
    await env.DB.prepare("INSERT INTO instagram_accounts (id, connection_id, ig_user_id, ig_username, fb_page_id, fb_page_name, fb_page_access_token, profile_picture_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind("iga1", connId, "ig_999", "test_user", "page_1", "Test Page", "page_tok", null, now).run();

    const res = await authedCall("/api/connections/instagram");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: boolean; accounts: Array<{ igUsername: string }> };
    expect(body.connected).toBe(true);
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0].igUsername).toBe("test_user");
  });

  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/connections/instagram"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });
});

describe("OAuth callback", () => {
  it("invalid_state on bad state", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/connections/instagram/callback?code=abc&state=invalid"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("invalid_state");
  });

  it("missing_params with no code/state", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/connections/instagram/callback"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });

  it("happy path: exchanges code, saves connection + accounts, redirects", async () => {
    const state = "test-state-xyz";
    await env.DB.prepare("INSERT INTO oauth_states (state, user_id, network, redirect_to, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(state, TEST_USER, "instagram", "/settings", Date.now()).run();

    exchangeCodeForToken.mockResolvedValueOnce({ accessToken: "short_tok", expiresIn: 3600 });
    exchangeForLongLivedToken.mockResolvedValueOnce({ accessToken: "long_tok", expiresIn: 5_184_000 });
    fetchMetaUserInfo.mockResolvedValueOnce({ id: "fb_456", name: "Real User" });
    resolveInstagramAccounts.mockResolvedValueOnce([
      { igUserId: "ig_888", igUsername: "real_user", fbPageId: "page_42", fbPageName: "Empresa", fbPageAccessToken: "page_tok2", profilePictureUrl: null },
    ]);

    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request(`http://x/api/connections/instagram/callback?code=abc&state=${state}`, { redirect: "manual" }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/settings");

    const conn = await env.DB.prepare("SELECT fb_user_name FROM meta_connections WHERE user_id = ?").bind(TEST_USER).first<{ fb_user_name: string }>();
    expect(conn?.fb_user_name).toBe("Real User");
    const acct = await env.DB.prepare("SELECT ig_username FROM instagram_accounts WHERE connection_id = ?").bind(`mc_${TEST_USER}`).first<{ ig_username: string }>();
    expect(acct?.ig_username).toBe("real_user");
  });
});

describe("DELETE /api/connections/instagram", () => {
  it("removes connection", async () => {
    const connId = `mc_${TEST_USER}`;
    const now = Date.now();
    await env.DB.prepare("INSERT INTO meta_connections (id, user_id, fb_user_id, fb_user_name, access_token, expires_at, scopes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(connId, TEST_USER, "fb_x", "X", "t", now + 1000, "s", now, now).run();
    const res = await authedCall("/api/connections/instagram", { method: "DELETE" });
    expect(res.status).toBe(200);
    const after = await env.DB.prepare("SELECT id FROM meta_connections WHERE user_id = ?").bind(TEST_USER).first();
    expect(after).toBeNull();
  });
});
