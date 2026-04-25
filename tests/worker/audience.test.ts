import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";
import { upsertRawComment, listUnclassifiedComments, setCommentClassification, getTopEngagers, getSentimentSummary } from "../../src/worker/db/queries";

vi.mock("../../src/worker/ai/claude", async () => ({
  MODEL: "mock-model",
  FAST_MODEL: "mock-haiku",
  callClaudeJson: vi.fn(),
}));

import * as claudeModule from "../../src/worker/ai/claude";
const callClaudeJson = claudeModule.callClaudeJson as unknown as ReturnType<typeof vi.fn>;

const USER = "u_aud";
const OTHER = "u_aud_other";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, pillar_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_comments_raw (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, external_comment_id TEXT, commenter_handle TEXT, body TEXT NOT NULL, posted_at INTEGER, fetched_at INTEGER NOT NULL, sentiment TEXT, topics_json TEXT, classified_at INTEGER, UNIQUE (network, external_comment_id))`,
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
  for (const u of [USER, OTHER]) {
    await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(u, `${u}@t.dev`, hash, Date.now()).run();
  }
  await env.DB.prepare("INSERT OR REPLACE INTO posts (id, user_id, body, status, created_at, updated_at) VALUES ('p_a', ?, 'x', 'published', ?, ?)").bind(USER, Date.now(), Date.now()).run();
});

beforeEach(async () => {
  callClaudeJson.mockReset();
  await env.DB.prepare("DELETE FROM post_comments_raw").run();
});

describe("upsertRawComment + classification", () => {
  it("upsert is unique on (network, external_comment_id)", async () => {
    await upsertRawComment(env.DB, { id: "c1", userId: USER, postId: "p_a", targetId: "t_a", network: "instagram", externalCommentId: "ext1", commenterHandle: "alice", body: "amei", postedAt: Date.now() });
    await upsertRawComment(env.DB, { id: "c2", userId: USER, postId: "p_a", targetId: "t_a", network: "instagram", externalCommentId: "ext1", commenterHandle: "alice", body: "amei muito", postedAt: Date.now() });
    const rows = await env.DB.prepare("SELECT id, body FROM post_comments_raw WHERE user_id = ?").bind(USER).all<{ id: string; body: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results![0].body).toBe("amei muito");
  });

  it("listUnclassified returns only NULL classified_at rows", async () => {
    await upsertRawComment(env.DB, { id: "c1", userId: USER, postId: "p_a", targetId: "t_a", network: "instagram", externalCommentId: "ext1", commenterHandle: "alice", body: "amei", postedAt: Date.now() });
    await upsertRawComment(env.DB, { id: "c2", userId: USER, postId: "p_a", targetId: "t_a", network: "instagram", externalCommentId: "ext2", commenterHandle: "bob", body: "horrível", postedAt: Date.now() });
    await setCommentClassification(env.DB, "c1", "positive", ["agradecimento"]);
    const list = await listUnclassifiedComments(env.DB, USER, 10);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("c2");
  });
});

describe("getTopEngagers", () => {
  it("ranks handles by comment count and counts sentiment", async () => {
    for (let i = 1; i <= 3; i++) {
      await upsertRawComment(env.DB, { id: `c_a${i}`, userId: USER, postId: "p_a", targetId: "t_a", network: "instagram", externalCommentId: `eAa${i}`, commenterHandle: "alice", body: "boa", postedAt: Date.now() });
    }
    await upsertRawComment(env.DB, { id: "c_b", userId: USER, postId: "p_a", targetId: "t_a", network: "instagram", externalCommentId: "eBb1", commenterHandle: "bob", body: "ok", postedAt: Date.now() });
    await setCommentClassification(env.DB, "c_a1", "positive", []);
    await setCommentClassification(env.DB, "c_a2", "positive", []);
    await setCommentClassification(env.DB, "c_a3", "negative", []);

    const rows = await getTopEngagers(env.DB, USER, 30, 10);
    expect(rows[0].handle).toBe("alice");
    expect(rows[0].comment_count).toBe(3);
    expect(rows[0].positive_count).toBe(2);
    expect(rows[0].negative_count).toBe(1);
    expect(rows[1].handle).toBe("bob");
  });

  it("isolates between users", async () => {
    await upsertRawComment(env.DB, { id: "x", userId: OTHER, postId: "p_a", targetId: "t_a", network: "instagram", externalCommentId: "spy", commenterHandle: "spy", body: "y", postedAt: Date.now() });
    const rows = await getTopEngagers(env.DB, USER, 30, 10);
    expect(rows.find((r) => r.handle === "spy")).toBeUndefined();
  });
});

describe("getSentimentSummary", () => {
  it("groups by sentiment with NULL bucket", async () => {
    await upsertRawComment(env.DB, { id: "c1", userId: USER, postId: "p_a", targetId: "t_a", network: "instagram", externalCommentId: "e1", commenterHandle: "alice", body: "boa", postedAt: Date.now() });
    await upsertRawComment(env.DB, { id: "c2", userId: USER, postId: "p_a", targetId: "t_a", network: "instagram", externalCommentId: "e2", commenterHandle: "bob", body: "ok", postedAt: Date.now() });
    await setCommentClassification(env.DB, "c1", "positive", []);

    const dist = await getSentimentSummary(env.DB, USER, 30);
    const byKey = Object.fromEntries(dist.map((d) => [d.sentiment ?? "null", d.c]));
    expect(byKey.positive).toBe(1);
    expect(byKey.null).toBe(1);
  });
});

describe("POST /api/audience/classify-now", () => {
  it("classifies pending comments via FAST_MODEL", async () => {
    await upsertRawComment(env.DB, { id: "c1", userId: USER, postId: "p_a", targetId: "t_a", network: "instagram", externalCommentId: "z1", commenterHandle: "alice", body: "amei tudo", postedAt: Date.now() });
    await upsertRawComment(env.DB, { id: "c2", userId: USER, postId: "p_a", targetId: "t_a", network: "instagram", externalCommentId: "z2", commenterHandle: "bob", body: "que ruim", postedAt: Date.now() });

    callClaudeJson.mockResolvedValueOnce({
      data: { items: [
        { id: "c1", sentiment: "positive", topics: ["agradecimento"] },
        { id: "c2", sentiment: "negative", topics: ["insatisfação"] },
      ] },
      usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
      durationMs: 80,
    });

    const res = await authedCall("/api/audience/classify-now", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { attempted: number; classified: number };
    expect(body.attempted).toBe(2);
    expect(body.classified).toBe(2);
    expect(callClaudeJson).toHaveBeenCalledTimes(1);
    expect(callClaudeJson.mock.calls[0][1].model).toBe("mock-haiku");

    const rows = await env.DB.prepare("SELECT sentiment FROM post_comments_raw WHERE user_id = ? ORDER BY id").bind(USER).all<{ sentiment: string }>();
    const sentiments = (rows.results ?? []).map((r: { sentiment: string }) => r.sentiment).sort();
    expect(sentiments).toEqual(["negative", "positive"]);
  });

  it("ignores hallucinated ids and invalid sentiment values", async () => {
    await upsertRawComment(env.DB, { id: "c_real", userId: USER, postId: "p_a", targetId: "t_a", network: "instagram", externalCommentId: "real1", commenterHandle: "alice", body: "x", postedAt: Date.now() });
    callClaudeJson.mockResolvedValueOnce({
      data: { items: [
        { id: "c_real", sentiment: "extreme", topics: ["x"] },          // invalid sentiment
        { id: "c_never", sentiment: "positive", topics: [] },            // unknown id
      ] },
      usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 },
      durationMs: 20,
    });
    const res = await authedCall("/api/audience/classify-now", { method: "POST" });
    const body = (await res.json()) as { classified: number };
    expect(body.classified).toBe(0);
    const row = await env.DB.prepare("SELECT sentiment FROM post_comments_raw WHERE id = 'c_real'").first<{ sentiment: string | null }>();
    expect(row?.sentiment).toBeNull();
  });
});
