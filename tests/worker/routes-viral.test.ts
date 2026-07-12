import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../src/worker/index";
import { hashPassword, signToken } from "../../src/worker/auth";

vi.mock("../../src/worker/ai/claude", async () => ({
  MODEL: "mock-model",
  callClaudeJson: vi.fn(),
}));

import * as claudeModule from "../../src/worker/ai/claude";
const callClaudeJson = claudeModule.callClaudeJson as unknown as ReturnType<typeof vi.fn>;

const TEST_USER = "u_viral_test";
const TEST_EMAIL = "viral@test.dev";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ai_generations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER, cost_cents INTEGER, model TEXT NOT NULL, duration_ms INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS viral_generations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, niche TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', media_id TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, network TEXT NOT NULL, body_override TEXT, scheduled_at INTEGER, published_at INTEGER, external_id TEXT, status TEXT NOT NULL DEFAULT 'pending', target_ref TEXT, last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0, UNIQUE(post_id, network))`,
  `CREATE TABLE IF NOT EXISTS post_metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, target_id TEXT NOT NULL, network TEXT NOT NULL, snapshot_at INTEGER NOT NULL, likes INTEGER, comments INTEGER, shares INTEGER, saved INTEGER, reach INTEGER, impressions INTEGER, engagement_rate REAL, extra_json TEXT, created_at INTEGER NOT NULL)`,
];

const USAGE = { inputTokens: 100, outputTokens: 50, cachedTokens: 0 };

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
  for (const sql of SCHEMA_STATEMENTS) {
    await env.DB.prepare(sql).run();
  }
  const hash = await hashPassword("x");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(TEST_USER, TEST_EMAIL, hash, Date.now()).run();
});

beforeEach(async () => {
  callClaudeJson.mockReset();
  await env.DB.prepare("DELETE FROM viral_generations WHERE user_id = ?").bind(TEST_USER).run();
  await env.DB.prepare("DELETE FROM ai_generations WHERE user_id = ?").bind(TEST_USER).run();
  await env.DB.prepare("DELETE FROM post_metrics WHERE post_id LIKE 'p_vv_%'").run();
  await env.DB.prepare("DELETE FROM post_targets WHERE post_id LIKE 'p_vv_%'").run();
  await env.DB.prepare("DELETE FROM posts WHERE id LIKE 'p_vv_%'").run();
});

describe("POST /api/viral/hooks", () => {
  it("401 without auth", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("http://x/api/viral/hooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ niche: "fitness", topic: "treino em casa" }),
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });

  it("400 on missing topic", async () => {
    const res = await authedCall("/api/viral/hooks", {
      method: "POST",
      body: JSON.stringify({ niche: "fitness" }),
    });
    expect(res.status).toBe(400);
  });

  it("200 returns hooks and persists history + usage log", async () => {
    const hooks = Array.from({ length: 10 }, (_, i) => ({ text: `gancho ${i}`, category: "curiosidade", why: "abre loop" }));
    callClaudeJson.mockResolvedValueOnce({ data: { hooks }, usage: USAGE, durationMs: 500 });
    const res = await authedCall("/api/viral/hooks", {
      method: "POST",
      body: JSON.stringify({ niche: "fitness", topic: "treino em casa", network: "instagram" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hooks: unknown[] };
    expect(body.hooks).toHaveLength(10);

    const saved = await env.DB.prepare("SELECT kind, niche FROM viral_generations WHERE user_id = ?")
      .bind(TEST_USER).first<{ kind: string; niche: string }>();
    expect(saved?.kind).toBe("hooks");
    expect(saved?.niche).toBe("fitness");

    const logged = await env.DB.prepare("SELECT kind FROM ai_generations WHERE user_id = ?")
      .bind(TEST_USER).first<{ kind: string }>();
    expect(logged?.kind).toBe("viral_hooks");
  });

  it("502 on empty model output", async () => {
    callClaudeJson.mockResolvedValueOnce({ data: { hooks: [] }, usage: USAGE, durationMs: 500 });
    const res = await authedCall("/api/viral/hooks", {
      method: "POST",
      body: JSON.stringify({ niche: "fitness", topic: "treino em casa" }),
    });
    expect(res.status).toBe(502);
  });
});

describe("POST /api/viral/reels-script", () => {
  it("400 on invalid duration", async () => {
    const res = await authedCall("/api/viral/reels-script", {
      method: "POST",
      body: JSON.stringify({ niche: "fitness", topic: "treino", durationSec: 45, goal: "seguidores" }),
    });
    expect(res.status).toBe(400);
  });

  it("200 returns full script", async () => {
    callClaudeJson.mockResolvedValueOnce({
      data: {
        title: "Treino em casa",
        hook: "Você está treinando errado.",
        altHooks: ["alt 1", "alt 2"],
        beats: [{ time: "0-2s", narration: "abre com o erro", visual: "close no rosto" }],
        cta: "Segue pra mais",
        caption: "legenda",
        hashtags: ["treino", "fitness"],
      },
      usage: USAGE,
      durationMs: 700,
    });
    const res = await authedCall("/api/viral/reels-script", {
      method: "POST",
      body: JSON.stringify({ niche: "fitness", topic: "treino em casa", durationSec: 30, goal: "seguidores", tone: "direct" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hook: string; beats: unknown[] };
    expect(body.hook).toBe("Você está treinando errado.");
    expect(body.beats).toHaveLength(1);
  });
});

describe("POST /api/viral/carousel", () => {
  it("400 on slideCount out of range", async () => {
    const res = await authedCall("/api/viral/carousel", {
      method: "POST",
      body: JSON.stringify({ niche: "fitness", topic: "treino", slideCount: 3, goal: "vendas" }),
    });
    expect(res.status).toBe(400);
  });

  it("200 returns carousel", async () => {
    callClaudeJson.mockResolvedValueOnce({
      data: {
        coverTitle: "5 erros",
        coverSubtitle: "que travam seu crescimento",
        slides: [{ title: "Erro 1", text: "texto" }],
        caption: "legenda",
        hashtags: ["dicas"],
      },
      usage: USAGE,
      durationMs: 700,
    });
    const res = await authedCall("/api/viral/carousel", {
      method: "POST",
      body: JSON.stringify({ niche: "fitness", topic: "erros comuns", slideCount: 5, goal: "autoridade" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { coverTitle: string };
    expect(body.coverTitle).toBe("5 erros");
  });
});

describe("POST /api/viral/remodel", () => {
  it("400 on short reference", async () => {
    const res = await authedCall("/api/viral/remodel", {
      method: "POST",
      body: JSON.stringify({ reference: "curto", niche: "fitness" }),
    });
    expect(res.status).toBe(400);
  });

  it("200 returns remodeled content", async () => {
    callClaudeJson.mockResolvedValueOnce({
      data: {
        whyItWorks: "gancho de contraste",
        structure: "erro → consequência → virada",
        hook: "novo gancho",
        body: "conteúdo remodelado",
        caption: "legenda",
        hashtags: ["nicho"],
      },
      usage: USAGE,
      durationMs: 700,
    });
    const res = await authedCall("/api/viral/remodel", {
      method: "POST",
      body: JSON.stringify({ reference: "conteúdo viral de referência com mais de vinte caracteres", niche: "fitness" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { body: string };
    expect(body.body).toBe("conteúdo remodelado");
  });
});

describe("POST /api/viral/score", () => {
  it("200 returns score with breakdown", async () => {
    callClaudeJson.mockResolvedValueOnce({
      data: {
        score: 62,
        verdict: "bom gancho, CTA fraco",
        breakdown: [{ criterion: "gancho", score: 16, feedback: "forte" }],
        improvements: ["melhorar CTA"],
        improvedHook: "gancho melhor",
      },
      usage: USAGE,
      durationMs: 600,
    });
    const res = await authedCall("/api/viral/score", {
      method: "POST",
      body: JSON.stringify({ content: "meu roteiro de teste com mais de vinte caracteres", network: "tiktok" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { score: number };
    expect(body.score).toBe(62);
  });

  it("502 when model errors", async () => {
    callClaudeJson.mockRejectedValueOnce(new Error("boom"));
    const res = await authedCall("/api/viral/score", {
      method: "POST",
      body: JSON.stringify({ content: "meu roteiro de teste com mais de vinte caracteres" }),
    });
    expect(res.status).toBe(502);
  });
});

describe("GET/DELETE /api/viral/generations", () => {
  it("lists saved generations newest-first and deletes", async () => {
    const hooks = [{ text: "g", category: "c", why: "w" }];
    callClaudeJson.mockResolvedValue({ data: { hooks }, usage: USAGE, durationMs: 100 });
    await authedCall("/api/viral/hooks", { method: "POST", body: JSON.stringify({ niche: "a1", topic: "t1" }) });
    await authedCall("/api/viral/hooks", { method: "POST", body: JSON.stringify({ niche: "a2", topic: "t2" }) });

    const list = await authedCall("/api/viral/generations");
    expect(list.status).toBe(200);
    const { items } = (await list.json()) as { items: Array<{ id: string; niche: string; output: { hooks: unknown[] } }> };
    expect(items).toHaveLength(2);
    expect(items[0].output.hooks).toHaveLength(1);

    const del = await authedCall(`/api/viral/generations/${items[0].id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const after = (await (await authedCall("/api/viral/generations")).json()) as { items: unknown[] };
    expect(after.items).toHaveLength(1);
  });

  it("404 deleting another id", async () => {
    const res = await authedCall("/api/viral/generations/nope", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("useMyVoice", () => {
  it("appends top-post style examples to the prompt", async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, 'published', ?, ?)")
      .bind("p_vv_1", TEST_USER, "meu post campeão de engajamento", now, now).run();
    await env.DB.prepare("INSERT INTO post_targets (id, post_id, network, status, published_at) VALUES (?, ?, 'instagram', 'published', ?)")
      .bind("t_vv_1", "p_vv_1", now).run();
    await env.DB.prepare("INSERT INTO post_metrics (id, post_id, target_id, network, snapshot_at, likes, comments, engagement_rate, created_at) VALUES (?, ?, ?, 'instagram', ?, 100, 10, 8.5, ?)")
      .bind("m_vv_1", "p_vv_1", "t_vv_1", now, now).run();

    const hooks = Array.from({ length: 10 }, () => ({ text: "g", category: "c", why: "w" }));
    callClaudeJson.mockResolvedValueOnce({ data: { hooks }, usage: USAGE, durationMs: 100 });
    const res = await authedCall("/api/viral/hooks", {
      method: "POST",
      body: JSON.stringify({ niche: "fitness", topic: "treino", useMyVoice: true }),
    });
    expect(res.status).toBe(200);
    const call = callClaudeJson.mock.calls[0][1] as { user: string };
    expect(call.user).toContain("MINHA VOZ");
    expect(call.user).toContain("meu post campeão de engajamento");
  });

  it("omits voice block when user has no published posts", async () => {
    const hooks = Array.from({ length: 10 }, () => ({ text: "g", category: "c", why: "w" }));
    callClaudeJson.mockResolvedValueOnce({ data: { hooks }, usage: USAGE, durationMs: 100 });
    const res = await authedCall("/api/viral/hooks", {
      method: "POST",
      body: JSON.stringify({ niche: "fitness", topic: "treino", useMyVoice: true }),
    });
    expect(res.status).toBe(200);
    const call = callClaudeJson.mock.calls[0][1] as { user: string };
    expect(call.user).not.toContain("MINHA VOZ");
  });
});
