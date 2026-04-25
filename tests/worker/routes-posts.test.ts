import { describe, it, expect, beforeAll } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

const TEST_USER = "u_posts_test";
const TEST_EMAIL = "posts@test.dev";

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, r2_key TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, original_name TEXT NOT NULL, width INTEGER, height INTEGER, duration_ms INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, pillar_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0, UNIQUE(post_id, network))`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
];

async function authedCall(path: string, init?: RequestInit) {
  const token = await signToken({ userId: TEST_USER }, env.JWT_SECRET);
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  headers.set("cookie", `session=${token}`);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeAll(async () => {
  for (const s of SCHEMA_SQL) await env.DB.exec(s);
  const hash = await hashPassword("x");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").bind(TEST_USER, TEST_EMAIL, hash, Date.now()).run();
});

describe("POST /api/posts", () => {
  it("creates a draft with no networks", async () => {
    const res = await authedCall("/api/posts", { method: "POST", body: JSON.stringify({ body: "primeiro post" }) });
    expect(res.status).toBe(201);
    const post = (await res.json()) as { id: string; body: string; status: string; targets: unknown[] };
    expect(post.id).toMatch(/^p_/);
    expect(post.body).toBe("primeiro post");
    expect(post.status).toBe("draft");
    expect(post.targets).toEqual([]);
  });

  it("creates with networks producing matching targets", async () => {
    const res = await authedCall("/api/posts", { method: "POST", body: JSON.stringify({ body: "olá", networks: ["instagram", "linkedin"] }) });
    expect(res.status).toBe(201);
    const post = (await res.json()) as { targets: Array<{ network: string }> };
    const nets = post.targets.map((t) => t.network).sort();
    expect(nets).toEqual(["instagram", "linkedin"]);
  });
});

describe("GET /api/posts", () => {
  it("lists posts sorted by updated_at desc", async () => {
    const res = await authedCall("/api/posts");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; updatedAt: number }> };
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < body.items.length; i++) {
      expect(body.items[i - 1].updatedAt).toBeGreaterThanOrEqual(body.items[i].updatedAt);
    }
  });
});

describe("GET /api/posts/:id", () => {
  it("returns post with targets", async () => {
    const create = await authedCall("/api/posts", { method: "POST", body: JSON.stringify({ body: "get test", networks: ["tiktok"] }) });
    const { id } = (await create.json()) as { id: string };
    const res = await authedCall(`/api/posts/${id}`);
    expect(res.status).toBe(200);
    const post = (await res.json()) as { id: string; targets: Array<{ network: string }> };
    expect(post.id).toBe(id);
    expect(post.targets).toHaveLength(1);
    expect(post.targets[0].network).toBe("tiktok");
  });

  it("404 for unknown id", async () => {
    const res = await authedCall("/api/posts/p_nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/posts/:id", () => {
  it("updates body and bumps updated_at", async () => {
    const create = await authedCall("/api/posts", { method: "POST", body: JSON.stringify({ body: "v1" }) });
    const { id, updatedAt: u1 } = (await create.json()) as { id: string; updatedAt: number };
    await new Promise((r) => setTimeout(r, 10));
    const res = await authedCall(`/api/posts/${id}`, { method: "PATCH", body: JSON.stringify({ body: "v2" }) });
    expect(res.status).toBe(200);
    const post = (await res.json()) as { body: string; updatedAt: number };
    expect(post.body).toBe("v2");
    expect(post.updatedAt).toBeGreaterThan(u1);
  });
});

describe("PUT /api/posts/:id/targets", () => {
  it("replaces the target set", async () => {
    const create = await authedCall("/api/posts", { method: "POST", body: JSON.stringify({ body: "t", networks: ["instagram"] }) });
    const { id } = (await create.json()) as { id: string };
    const res = await authedCall(`/api/posts/${id}/targets`, { method: "PUT", body: JSON.stringify({ networks: ["linkedin", "tiktok"] }) });
    expect(res.status).toBe(200);
    const post = (await res.json()) as { targets: Array<{ network: string }> };
    const nets = post.targets.map((t) => t.network).sort();
    expect(nets).toEqual(["linkedin", "tiktok"]);
  });
});

describe("PATCH /api/posts/:id/targets/:network", () => {
  it("sets body_override", async () => {
    const create = await authedCall("/api/posts", { method: "POST", body: JSON.stringify({ body: "base", networks: ["linkedin"] }) });
    const { id } = (await create.json()) as { id: string };
    const res = await authedCall(`/api/posts/${id}/targets/linkedin`, { method: "PATCH", body: JSON.stringify({ bodyOverride: "versão LinkedIn" }) });
    expect(res.status).toBe(200);
    const get = await authedCall(`/api/posts/${id}`);
    const post = (await get.json()) as { targets: Array<{ network: string; bodyOverride: string | null }> };
    const ln = post.targets.find((t) => t.network === "linkedin")!;
    expect(ln.bodyOverride).toBe("versão LinkedIn");
  });
});

describe("DELETE /api/posts/:id", () => {
  it("deletes post and manually cascades targets", async () => {
    const create = await authedCall("/api/posts", { method: "POST", body: JSON.stringify({ body: "bye", networks: ["instagram", "tiktok"] }) });
    const { id } = (await create.json()) as { id: string };
    const res = await authedCall(`/api/posts/${id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const getAfter = await authedCall(`/api/posts/${id}`);
    expect(getAfter.status).toBe(404);
    const targets = await env.DB.prepare("SELECT COUNT(*) AS c FROM post_targets WHERE post_id = ?").bind(id).first<{ c: number }>();
    expect(targets?.c).toBe(0);
  });
});

describe("isolation", () => {
  it("user A cannot read user B's post", async () => {
    await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING")
      .bind("u_other_posts", "other-posts@test.dev", "x", Date.now()).run();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
      .bind("p_other_pub", "u_other_posts", "private", Date.now(), Date.now()).run();
    const res = await authedCall("/api/posts/p_other_pub");
    expect(res.status).toBe(404);
  });
});
