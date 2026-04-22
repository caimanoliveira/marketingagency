import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

// Mock publishOnce to avoid calling real LinkedIn
vi.mock("../../src/worker/publishOnce", () => ({
  publishOnce: vi.fn(),
}));
import * as publishOnceModule from "../../src/worker/publishOnce";
const publishOnce = publishOnceModule.publishOnce as unknown as ReturnType<typeof vi.fn>;

const TEST_USER = "u_publish_test";
const TEST_EMAIL = "publish@test.dev";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0, UNIQUE(post_id, network))`,
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
});

beforeEach(async () => {
  publishOnce.mockReset();
  // Clean posts + targets
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_pubtest_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'p_pubtest_%'").run();
});

async function insertPostWithTarget(postId: string, network: string, status = "pending") {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
    .bind(postId, TEST_USER, "test copy", now, now).run();
  const targetId = `t_${postId}_${network}`;
  await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, attempts) VALUES (?, ?, ?, ?, 0)")
    .bind(targetId, postId, network, status).run();
  return targetId;
}

describe("POST /api/publish/:postId/:network", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/publish/p_any/linkedin", { method: "POST" }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("400 invalid network", async () => {
    const res = await authedCall("/api/publish/p_any/twitter", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("404 post not found", async () => {
    const res = await authedCall("/api/publish/p_nonexistent/linkedin", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("400 target not selected for the network", async () => {
    const postId = "p_pubtest_notarget";
    const now = Date.now();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
      .bind(postId, TEST_USER, "x", now, now).run();
    const res = await authedCall(`/api/publish/${postId}/linkedin`, { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("200 marks target published on success", async () => {
    const postId = "p_pubtest_success";
    const targetId = await insertPostWithTarget(postId, "linkedin");
    publishOnce.mockResolvedValueOnce({ externalId: "urn:li:ugc:fake123" });
    const res = await authedCall(`/api/publish/${postId}/linkedin`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { externalId: string };
    expect(body.externalId).toBe("urn:li:ugc:fake123");
    expect(publishOnce).toHaveBeenCalledWith(expect.anything(), TEST_USER, postId, targetId);
  });

  it("502 on publish failure marks target failed with last_error", async () => {
    const postId = "p_pubtest_fail";
    const targetId = await insertPostWithTarget(postId, "linkedin");
    publishOnce.mockRejectedValueOnce(new Error("linkedin_500_rate_limit"));
    const res = await authedCall(`/api/publish/${postId}/linkedin`, { method: "POST" });
    expect(res.status).toBe(502);
    const row = await env.DB.prepare("SELECT status, last_error, attempts FROM post_targets WHERE id = ?")
      .bind(targetId).first<{ status: string; last_error: string; attempts: number }>();
    expect(row?.status).toBe("failed");
    expect(row?.last_error).toContain("linkedin_500");
    expect(row?.attempts).toBe(1);
  });
});
