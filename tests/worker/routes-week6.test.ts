import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

const TEST_USER = "u_w6_test";
const TEST_EMAIL = "w6@test.dev";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0, UNIQUE(post_id, network))`,
];

async function authedCall(path: string, init?: RequestInit) {
  const token = await signToken({ userId: TEST_USER }, env.JWT_SECRET);
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
    .bind(TEST_USER, TEST_EMAIL, hash, Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_w6_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'p_w6_%'").run();
});

async function makePost(id: string, status = "draft") {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, TEST_USER, `body of ${id}`, status, now, now).run();
}

async function makeTarget(id: string, postId: string, network: string, status: string, scheduledAt: number | null, lastError: string | null = null) {
  await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, scheduled_at, last_error, attempts) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, postId, network, status, scheduledAt, lastError, lastError ? 3 : 0).run();
}

describe("GET /api/posts/by-month", () => {
  it("returns posts with targets scheduled in the range", async () => {
    const may1 = new Date(2026, 4, 1).getTime();   // May 1, 2026 (month index 4)
    const may15 = new Date(2026, 4, 15).getTime();
    const jun1 = new Date(2026, 5, 1).getTime();

    await makePost("p_w6_in_range");
    await makeTarget("t_in_1", "p_w6_in_range", "linkedin", "scheduled", may15);

    await makePost("p_w6_out_range");
    await makeTarget("t_out_1", "p_w6_out_range", "linkedin", "scheduled", jun1 + 86400000); // way out

    const res = await authedCall(`/api/posts/by-month?from=${may1}&to=${jun1}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; scheduledAt: number }> };
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain("p_w6_in_range");
    expect(ids).not.toContain("p_w6_out_range");
  });

  it("400 when missing from/to", async () => {
    const res = await authedCall("/api/posts/by-month");
    expect(res.status).toBe(400);
  });

  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/posts/by-month?from=1&to=2"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/posts/failures", () => {
  it("returns only failed targets", async () => {
    await makePost("p_w6_fail");
    await makeTarget("t_fail_1", "p_w6_fail", "linkedin", "failed", Date.now() - 1000, "linkedin_500_internal");
    await makeTarget("t_ok_1", "p_w6_fail", "instagram", "published", Date.now() - 1000);

    const res = await authedCall("/api/posts/failures");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ network: string; lastError: string; attempts: number }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].network).toBe("linkedin");
    expect(body.items[0].lastError).toContain("linkedin_500");
    expect(body.items[0].attempts).toBe(3);
  });

  it("returns empty when no failures", async () => {
    const res = await authedCall("/api/posts/failures");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });
});

describe("POST /api/posts/:id/targets/:network/retry", () => {
  it("resets failed target to scheduled with cleared error", async () => {
    await makePost("p_w6_retry");
    await makeTarget("t_retry_1", "p_w6_retry", "linkedin", "failed", Date.now() - 60_000, "transient_error");

    const res = await authedCall("/api/posts/p_w6_retry/targets/linkedin/retry", { method: "POST" });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT status, last_error, scheduled_at FROM post_targets WHERE id = ?")
      .bind("t_retry_1").first<{ status: string; last_error: string | null; scheduled_at: number }>();
    expect(row?.status).toBe("scheduled");
    expect(row?.last_error).toBeNull();
    // scheduled_at should be at most "now" (so cron picks it up immediately)
    expect(row?.scheduled_at).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("404 for non-existent post", async () => {
    const res = await authedCall("/api/posts/p_nonexistent/targets/linkedin/retry", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("404 for non-existent target", async () => {
    await makePost("p_w6_retry_no_target");
    const res = await authedCall("/api/posts/p_w6_retry_no_target/targets/instagram/retry", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/posts/:id with status", () => {
  it("updates status (used by Kanban)", async () => {
    await makePost("p_w6_kanban", "draft");

    const res = await authedCall(`/api/posts/p_w6_kanban`, {
      method: "PATCH",
      body: JSON.stringify({ status: "scheduled" }),
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT status FROM posts WHERE id = ?").bind("p_w6_kanban").first<{ status: string }>();
    expect(row?.status).toBe("scheduled");
  });

  it("rejects invalid status value", async () => {
    await makePost("p_w6_kanban_bad", "draft");
    const res = await authedCall(`/api/posts/p_w6_kanban_bad`, {
      method: "PATCH",
      body: JSON.stringify({ status: "garbage" }),
    });
    expect(res.status).toBe(400);
  });
});
