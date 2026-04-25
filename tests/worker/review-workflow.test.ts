import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

const USER = "u_review";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, pillar_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS content_pillars (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, color TEXT, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS review_links (token TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL, workspace_id TEXT, expires_at INTEGER NOT NULL, used_at INTEGER, decision TEXT, comment TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_comments (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT, workspace_id TEXT, author_label TEXT NOT NULL DEFAULT 'owner', body TEXT NOT NULL, created_at INTEGER NOT NULL)`,
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

async function publicCall(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeAll(async () => {
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  const hash = await hashPassword("x");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(USER, "review@test.dev", hash, Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_comments").run();
  await env.DB.prepare("DELETE FROM review_links").run();
  await env.DB.prepare("DELETE FROM post_targets").run();
  await env.DB.prepare("DELETE FROM posts WHERE user_id = ?").bind(USER).run();
});

async function createPost(body = "hello world"): Promise<string> {
  const res = await authedCall("/api/posts", { method: "POST", body: JSON.stringify({ body, networks: ["linkedin"] }) });
  const post = (await res.json()) as { id: string };
  return post.id;
}

describe("POST /api/posts/:id/request-review", () => {
  it("creates link, flips status to needs_review, returns shareable URL", async () => {
    const postId = await createPost();
    const res = await authedCall(`/api/posts/${postId}/request-review`, { method: "POST" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; url: string; expiresAt: number };
    expect(body.token).toMatch(/^[0-9a-f]{48}$/);
    expect(body.url).toContain(`/review/${body.token}`);
    expect(body.expiresAt).toBeGreaterThan(Date.now());

    const post = await env.DB.prepare("SELECT status FROM posts WHERE id = ?").bind(postId).first<{ status: string }>();
    expect(post?.status).toBe("needs_review");
  });

  it("404 for unknown post", async () => {
    const res = await authedCall("/api/posts/p_never/request-review", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("public review endpoints", () => {
  it("GET /api/review/:token returns post details", async () => {
    const postId = await createPost("review me");
    const linkRes = await authedCall(`/api/posts/${postId}/request-review`, { method: "POST" });
    const { token } = (await linkRes.json()) as { token: string };

    const res = await publicCall(`/api/review/${token}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { postId: string; body: string; networks: string[]; expired: boolean };
    expect(body.postId).toBe(postId);
    expect(body.body).toBe("review me");
    expect(body.networks).toContain("linkedin");
    expect(body.expired).toBe(false);
  });

  it("GET 404 for unknown token", async () => {
    const res = await publicCall("/api/review/nope");
    expect(res.status).toBe(404);
  });

  it("approve flow flips post to scheduled and stores comment", async () => {
    const postId = await createPost();
    const linkRes = await authedCall(`/api/posts/${postId}/request-review`, { method: "POST" });
    const { token } = (await linkRes.json()) as { token: string };

    const decision = await publicCall(`/api/review/${token}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision: "approved", comment: "lgtm" }),
    });
    expect(decision.status).toBe(200);

    const post = await env.DB.prepare("SELECT status FROM posts WHERE id = ?").bind(postId).first<{ status: string }>();
    expect(post?.status).toBe("scheduled");

    const cmt = await env.DB.prepare("SELECT body, author_label FROM post_comments WHERE post_id = ?").bind(postId).first<{ body: string; author_label: string }>();
    expect(cmt?.body).toBe("lgtm");
    expect(cmt?.author_label).toContain("approved");
  });

  it("reject flow flips post back to draft", async () => {
    const postId = await createPost();
    const linkRes = await authedCall(`/api/posts/${postId}/request-review`, { method: "POST" });
    const { token } = (await linkRes.json()) as { token: string };

    const decision = await publicCall(`/api/review/${token}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision: "rejected", comment: "tom errado" }),
    });
    expect(decision.status).toBe(200);

    const post = await env.DB.prepare("SELECT status FROM posts WHERE id = ?").bind(postId).first<{ status: string }>();
    expect(post?.status).toBe("draft");
  });

  it("token cannot be replayed", async () => {
    const postId = await createPost();
    const linkRes = await authedCall(`/api/posts/${postId}/request-review`, { method: "POST" });
    const { token } = (await linkRes.json()) as { token: string };

    const first = await publicCall(`/api/review/${token}/decision`, { method: "POST", body: JSON.stringify({ decision: "approved" }) });
    expect(first.status).toBe(200);
    const second = await publicCall(`/api/review/${token}/decision`, { method: "POST", body: JSON.stringify({ decision: "approved" }) });
    expect(second.status).toBe(409);
  });

  it("expired token rejects decision with 410", async () => {
    const postId = await createPost();
    const token = "expired_token_aaa";
    await env.DB.prepare(
      "INSERT INTO review_links (token, post_id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(token, postId, USER, Date.now() - 1000, Date.now() - 86400000).run();

    const res = await publicCall(`/api/review/${token}/decision`, { method: "POST", body: JSON.stringify({ decision: "approved" }) });
    expect(res.status).toBe(410);
  });
});

describe("POST /api/posts/:id/comments", () => {
  it("owner can post + read comments", async () => {
    const postId = await createPost();
    const post = await authedCall(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ body: "lembrar de revisar" }) });
    expect(post.status).toBe(201);
    const list = await authedCall(`/api/posts/${postId}/comments`);
    const body = (await list.json()) as { items: Array<{ body: string; authorLabel: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].body).toBe("lembrar de revisar");
    expect(body.items[0].authorLabel).toBe("owner");
  });
});
