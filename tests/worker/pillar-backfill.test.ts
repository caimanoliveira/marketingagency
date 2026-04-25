import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

vi.mock("../../src/worker/ai/claude", async () => ({
  MODEL: "mock-model",
  FAST_MODEL: "mock-haiku",
  callClaudeJson: vi.fn(),
}));

import * as claudeModule from "../../src/worker/ai/claude";
const callClaudeJson = claudeModule.callClaudeJson as unknown as ReturnType<typeof vi.fn>;

const USER = "u_backfill";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS content_pillars (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, color TEXT, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, pillar_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
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
    .bind(USER, "backfill@test.dev", hash, Date.now()).run();
});

beforeEach(async () => {
  callClaudeJson.mockReset();
  await env.DB.prepare("DELETE FROM posts WHERE user_id = ?").bind(USER).run();
  await env.DB.prepare("DELETE FROM content_pillars WHERE user_id = ?").bind(USER).run();
});

describe("POST /api/strategy/backfill-pillars", () => {
  it("returns zeros when no pillars exist", async () => {
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, 'hi', 'draft', ?, ?)")
      .bind("p_lone", USER, Date.now(), Date.now()).run();
    const res = await authedCall("/api/strategy/backfill-pillars", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { attempted: number; classified: number };
    expect(body.attempted).toBe(0);
    expect(body.classified).toBe(0);
    expect(callClaudeJson).not.toHaveBeenCalled();
  });

  it("classifies unclassified posts using returned assignments", async () => {
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, color, position, created_at) VALUES (?, ?, 'Edu', '#111', 0, ?)")
      .bind("pEdu", USER, Date.now()).run();
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, color, position, created_at) VALUES (?, ?, 'Bastidores', '#222', 1, ?)")
      .bind("pBas", USER, Date.now()).run();

    for (let i = 1; i <= 3; i++) {
      await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
        .bind(`p${i}`, USER, `post body ${i}`, Date.now(), Date.now()).run();
    }

    callClaudeJson.mockResolvedValueOnce({
      data: {
        assignments: [
          { postId: "p1", pillarId: "pEdu" },
          { postId: "p2", pillarId: "pBas" },
          { postId: "p3", pillarId: null }, // no match
        ],
      },
      usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
      durationMs: 200,
    });

    const res = await authedCall("/api/strategy/backfill-pillars", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { attempted: number; classified: number; skipped: number };
    expect(body.attempted).toBe(3);
    expect(body.classified).toBe(2);
    expect(body.skipped).toBe(1);

    // Verify fast model was used
    expect(callClaudeJson).toHaveBeenCalledTimes(1);
    const callArg = callClaudeJson.mock.calls[0][1];
    expect(callArg.model).toBe("mock-haiku");

    const rows = await env.DB.prepare("SELECT id, pillar_id FROM posts WHERE user_id = ? ORDER BY id").bind(USER).all<{ id: string; pillar_id: string | null }>();
    const byId = Object.fromEntries((rows.results ?? []).map((r: { id: string; pillar_id: string | null }) => [r.id, r.pillar_id]));
    expect(byId.p1).toBe("pEdu");
    expect(byId.p2).toBe("pBas");
    expect(byId.p3).toBeNull();
  });

  it("skips hallucinated pillarIds and fake postIds", async () => {
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, color, position, created_at) VALUES (?, ?, 'Edu', '#111', 0, ?)")
      .bind("pEdu", USER, Date.now()).run();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES ('p_real', ?, 'hello', 'draft', ?, ?)")
      .bind(USER, Date.now(), Date.now()).run();

    callClaudeJson.mockResolvedValueOnce({
      data: {
        assignments: [
          { postId: "p_real", pillarId: "pil_hallucinated" }, // invalid pillar
          { postId: "p_never_existed", pillarId: "pEdu" },    // invalid post
        ],
      },
      usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
      durationMs: 200,
    });

    const res = await authedCall("/api/strategy/backfill-pillars", { method: "POST" });
    const body = (await res.json()) as { attempted: number; classified: number; skipped: number };
    expect(body.classified).toBe(0);
    expect(body.skipped).toBe(2);

    const row = await env.DB.prepare("SELECT pillar_id FROM posts WHERE id = 'p_real'").first<{ pillar_id: string | null }>();
    expect(row?.pillar_id).toBeNull();
  });

  it("ignores posts with empty body and does not count them", async () => {
    await env.DB.prepare("INSERT INTO content_pillars (id, user_id, title, color, position, created_at) VALUES (?, ?, 'Edu', '#111', 0, ?)")
      .bind("pEdu", USER, Date.now()).run();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, '', 'draft', ?, ?)")
      .bind("p_empty", USER, Date.now(), Date.now()).run();

    callClaudeJson.mockResolvedValueOnce({
      data: { assignments: [] },
      usage: { inputTokens: 10, outputTokens: 2, cachedTokens: 0 },
      durationMs: 50,
    });

    const res = await authedCall("/api/strategy/backfill-pillars", { method: "POST" });
    const body = (await res.json()) as { attempted: number };
    // Empty body posts are filtered out by listUnclassifiedPosts — attempted=0 means Claude wasn't even called
    expect(body.attempted).toBe(0);
    expect(callClaudeJson).not.toHaveBeenCalled();
  });
});
