import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

const USER = "u_strat_api";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS content_pillars (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, color TEXT, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inspiration_sources (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, network TEXT NOT NULL, username TEXT NOT NULL, note TEXT, added_at INTEGER NOT NULL, UNIQUE(user_id, network, username))`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, pillar_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0, UNIQUE (post_id, network))`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
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
    .bind(USER, "strat_api@test.dev", hash, Date.now()).run();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM post_metrics").run();
  await env.DB.prepare("DELETE FROM post_targets").run();
  await env.DB.prepare("DELETE FROM posts WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM content_pillars WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM inspiration_sources WHERE user_id = ?").bind(USER).run();
});

describe("pillars routes", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/strategy/pillars"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("POST creates pillar, GET lists, PATCH updates, DELETE removes", async () => {
    const createRes = await authedCall("/api/strategy/pillars", {
      method: "POST",
      body: JSON.stringify({ title: "Bastidores", description: "Dia a dia", color: "#E1306C", position: 0 }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; title: string };
    expect(created.id).toMatch(/^pil_/);
    expect(created.title).toBe("Bastidores");

    const listRes = await authedCall("/api/strategy/pillars");
    expect(listRes.status).toBe(200);
    const { items } = (await listRes.json()) as { items: Array<{ id: string; title: string; position: number }> };
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Bastidores");

    const patchRes = await authedCall(`/api/strategy/pillars/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Bastidores ✨", position: 3 }),
    });
    expect(patchRes.status).toBe(200);
    const updated = (await patchRes.json()) as { title: string; position: number };
    expect(updated.title).toBe("Bastidores ✨");
    expect(updated.position).toBe(3);

    const delRes = await authedCall(`/api/strategy/pillars/${created.id}`, { method: "DELETE" });
    expect(delRes.status).toBe(200);
  });

  it("POST 400 on missing title", async () => {
    const res = await authedCall("/api/strategy/pillars", {
      method: "POST",
      body: JSON.stringify({ color: "#000" }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE 404 for nonexistent", async () => {
    const res = await authedCall("/api/strategy/pillars/pil_nope", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("PATCH 404 for nonexistent", async () => {
    const res = await authedCall("/api/strategy/pillars/pil_nope", {
      method: "PATCH",
      body: JSON.stringify({ title: "X" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/strategy/pillars/performance", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/strategy/pillars/performance"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("returns empty items when no pillars", async () => {
    const res = await authedCall("/api/strategy/pillars/performance");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { window: number; items: unknown[] };
    expect(body.window).toBe(30);
    expect(body.items).toEqual([]);
  });

  it("returns pillars with aggregates and isolates between users", async () => {
    // Pillar A with 2 posts and metrics
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, color, position, created_at) VALUES (?, ?, 'A', '#111', 0, ?)")
      .bind("pA", USER, Date.now()).run();
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, color, position, created_at) VALUES (?, ?, 'B', '#222', 1, ?)")
      .bind("pB", USER, Date.now()).run();

    for (let i = 1; i <= 2; i++) {
      await env.DB.prepare("INSERT INTO posts (id, user_id, body, pillar_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pA', 'published', ?, ?)")
        .bind(`p${i}`, USER, `x${i}`, Date.now(), Date.now()).run();
      await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status) VALUES (?, ?, 'linkedin', 'published')")
        .bind(`t${i}`, `p${i}`).run();
      await env.DB.prepare(
        "INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, likes, comments, reach, engagement_rate, created_at) VALUES (?, ?, ?, 'linkedin', ?, ?, ?, ?, ?, ?)"
      ).bind(`m${i}`, `p${i}`, `t${i}`, Date.now(), i * 10, i * 2, i * 100, 0.1 * i, Date.now()).run();
    }

    // Another user's pillar should not leak
    await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind("u_other_api", "other_api@test.dev", "x", Date.now()).run();
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, color, position, created_at) VALUES (?, ?, 'NOT MINE', '#000', 0, ?)")
      .bind("pX", "u_other_api", Date.now()).run();

    const res = await authedCall("/api/strategy/pillars/performance?window=30");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ pillarId: string; title: string; postCount: number; avgEngagementRate: number | null; totalReach: number; weekly: unknown[] }>;
    };
    expect(body.items).toHaveLength(2);
    const byId = Object.fromEntries(body.items.map((i) => [i.pillarId, i]));
    expect(byId.pA.postCount).toBe(2);
    expect(byId.pA.avgEngagementRate).toBeCloseTo(0.15, 5);
    expect(byId.pA.totalReach).toBe(300);
    expect(byId.pB.postCount).toBe(0);
    expect(byId.pB.avgEngagementRate).toBeNull();
  });

  it("clamps invalid window to default", async () => {
    const res = await authedCall("/api/strategy/pillars/performance?window=abc");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { window: number };
    expect(body.window).toBe(30);
  });
});

describe("sources routes", () => {
  it("POST creates source", async () => {
    const res = await authedCall("/api/strategy/sources", {
      method: "POST",
      body: JSON.stringify({ network: "instagram", username: "garyvee", note: "copy ref" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; username: string };
    expect(body.username).toBe("garyvee");
  });

  it("POST 400 invalid network", async () => {
    const res = await authedCall("/api/strategy/sources", {
      method: "POST",
      body: JSON.stringify({ network: "twitter", username: "foo" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST 400 invalid username", async () => {
    const res = await authedCall("/api/strategy/sources", {
      method: "POST",
      body: JSON.stringify({ network: "instagram", username: "bad user!" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST 409 duplicate", async () => {
    await authedCall("/api/strategy/sources", {
      method: "POST",
      body: JSON.stringify({ network: "instagram", username: "dupez" }),
    });
    const res = await authedCall("/api/strategy/sources", {
      method: "POST",
      body: JSON.stringify({ network: "instagram", username: "dupez" }),
    });
    expect(res.status).toBe(409);
  });

  it("GET lists sources, DELETE removes", async () => {
    const createRes = await authedCall("/api/strategy/sources", {
      method: "POST",
      body: JSON.stringify({ network: "instagram", username: "listme" }),
    });
    const { id } = (await createRes.json()) as { id: string };

    const listRes = await authedCall("/api/strategy/sources");
    const list = (await listRes.json()) as { items: Array<{ id: string }> };
    expect(list.items.length).toBeGreaterThanOrEqual(1);

    const delRes = await authedCall(`/api/strategy/sources/${id}`, { method: "DELETE" });
    expect(delRes.status).toBe(200);
  });
});
