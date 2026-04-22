# Centro de Comando — Semana 3: IA Assistente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three AI-powered copy helpers in the editor: generate 3 variations from a brief, rewrite for a specific network, adjust tone (formal/casual/playful/direct). Powered by Claude Sonnet 4.6 with prompt caching.

**Architecture:** New `/api/ai/*` routes calling the Anthropic SDK. System prompts cached (ephemeral). Each call logged to a new `ai_generations` D1 table. SPA adds an AI panel to the editor.

**Tech stack addition:** `@anthropic-ai/sdk`, prompt caching via `cache_control`.

---

## Task 1: Migration + env + deps + types

- [ ] Install SDK: `npm install @anthropic-ai/sdk`
- [ ] Write `migrations/0003_ai_generations.sql`:
```sql
CREATE TABLE ai_generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_tokens INTEGER,
  cost_cents INTEGER,
  model TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_ai_generations_user_created ON ai_generations(user_id, created_at DESC);
```
- [ ] Run `npm run db:migrate:local`
- [ ] Add `ANTHROPIC_API_KEY: string;` to the `Env` interface in `src/worker/index.ts`
- [ ] Append `ANTHROPIC_API_KEY=sk-ant-...` to `.dev.vars.example` and put a real value in `.dev.vars`
- [ ] Add to `src/shared/types.ts`:
```ts
export type Tone = "formal" | "casual" | "playful" | "direct";

export interface GenerateVariationsRequest {
  brief: string;
  network?: Network;
  tone?: Tone;
}
export interface GenerateVariationsResponse { variations: string[]; }

export interface RewriteForNetworkRequest {
  body: string;
  network: Network;
}
export interface RewriteForNetworkResponse { rewritten: string; }

export interface AdjustToneRequest {
  body: string;
  tone: Tone;
}
export interface AdjustToneResponse { adjusted: string; }
```
- [ ] Add Zod schemas to `src/worker/validation.ts`:
```ts
export const ToneSchema = z.enum(["formal", "casual", "playful", "direct"]);

export const GenerateVariationsSchema = z.object({
  brief: z.string().min(3).max(2000),
  network: NetworkSchema.optional(),
  tone: ToneSchema.optional(),
});

export const RewriteForNetworkSchema = z.object({
  body: z.string().min(1).max(5000),
  network: NetworkSchema,
});

export const AdjustToneSchema = z.object({
  body: z.string().min(1).max(5000),
  tone: ToneSchema,
});
```
- [ ] Commit: `feat(week3): AI migration, env, types, validation`

---

## Task 2: Claude wrapper + prompts + log query

- [ ] Create `src/worker/ai/prompts.ts`:
```ts
import type { Network, Tone } from "../../shared/types";

const NETWORK_BRIEF: Record<Network, string> = {
  instagram: "Instagram: max 2200 chars, engaging, emojis welcome, 3-5 relevant hashtags at end, hook in first line, scannable.",
  tiktok: "TikTok: max 2200 chars but ideally short (under 300), very casual/conversational, strong hook, trending-aware, 3-5 hashtags.",
  linkedin: "LinkedIn: max 3000 chars, professional but human voice, insight or lesson upfront, short paragraphs, no emoji overload, 0-3 hashtags, no 'click here'.",
};

const TONE_BRIEF: Record<Tone, string> = {
  formal: "Formal, polished, precise. No slang, no casual contractions.",
  casual: "Casual, conversational, friendly. Contractions are fine. Feel like talking to a friend.",
  playful: "Playful, witty, light. Puns or cultural references are welcome if natural. Never corny.",
  direct: "Direct, punchy, zero fluff. Short sentences. Strong verbs. Cut filler.",
};

export function systemForVariations(): string {
  return [
    "Você é um copywriter especializado em redes sociais (Instagram, TikTok, LinkedIn).",
    "Gera 3 variações de copy diferentes entre si em ângulo/abordagem — não parafrasear.",
    `Responde APENAS em JSON válido no formato: {"variations":["v1","v2","v3"]}.`,
    "Sem markdown, sem comentários fora do JSON.",
    "Português brasileiro. Direto ao ponto. Sem emojis excessivos.",
  ].join("\n");
}

export function userForVariations(args: { brief: string; network?: Network; tone?: Tone }): string {
  const parts = [`Brief: ${args.brief}`];
  if (args.network) parts.push(`Rede-alvo: ${args.network}. ${NETWORK_BRIEF[args.network]}`);
  if (args.tone) parts.push(`Tom: ${args.tone}. ${TONE_BRIEF[args.tone]}`);
  parts.push("Gera 3 variações distintas.");
  return parts.join("\n\n");
}

export function systemForRewrite(): string {
  return [
    "Você adapta copy existente para uma rede social específica, respeitando limites e estilo da plataforma.",
    "Preserva a mensagem central. Ajusta tom, comprimento, formatação, hashtags conforme a rede.",
    `Responde APENAS em JSON válido: {"rewritten":"texto adaptado"}.`,
    "Sem markdown, sem explicação.",
    "Português brasileiro.",
  ].join("\n");
}

export function userForRewrite(args: { body: string; network: Network }): string {
  return [
    `Rede-alvo: ${args.network}. ${NETWORK_BRIEF[args.network]}`,
    `Copy original:\n${args.body}`,
    "Reescreve adaptando pra rede.",
  ].join("\n\n");
}

export function systemForTone(): string {
  return [
    "Você ajusta o TOM de um texto existente, mantendo o conteúdo/fatos idênticos.",
    "Apenas o estilo muda. Não acrescenta nem remove informação.",
    `Responde APENAS em JSON válido: {"adjusted":"texto com tom ajustado"}.`,
    "Sem markdown, sem explicação.",
    "Português brasileiro.",
  ].join("\n");
}

export function userForTone(args: { body: string; tone: Tone }): string {
  return [
    `Tom alvo: ${args.tone}. ${TONE_BRIEF[args.tone]}`,
    `Texto original:\n${args.body}`,
    "Ajusta o tom preservando o conteúdo.",
  ].join("\n\n");
}
```

- [ ] Create `src/worker/ai/claude.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-4-6";

export interface CallResult<T> {
  data: T;
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number; };
  durationMs: number;
}

export interface CallOptions {
  system: string;
  user: string;
  maxTokens?: number;
}

export async function callClaudeJson<T>(apiKey: string, opts: CallOptions): Promise<CallResult<T>> {
  const client = new Anthropic({ apiKey });
  const start = Date.now();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
  });
  const durationMs = Date.now() - start;
  const textBlock = resp.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) throw new Error("no_text_response");
  let data: T;
  try {
    data = JSON.parse(textBlock.text) as T;
  } catch {
    const match = textBlock.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("invalid_json_response");
    data = JSON.parse(match[0]) as T;
  }
  return {
    data,
    usage: {
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      cachedTokens: resp.usage.cache_read_input_tokens ?? 0,
    },
    durationMs,
  };
}
```

- [ ] Append `logAiGeneration` to `src/worker/db/queries.ts`:
```ts
export async function logAiGeneration(
  db: D1Database,
  params: {
    id: string;
    userId: string;
    kind: string;
    input: unknown;
    output: unknown;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    model: string;
    durationMs: number;
  }
): Promise<void> {
  await db
    .prepare("INSERT INTO ai_generations (id, user_id, kind, input_json, output_json, input_tokens, output_tokens, cached_tokens, model, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(
      params.id, params.userId, params.kind,
      JSON.stringify(params.input), JSON.stringify(params.output),
      params.inputTokens, params.outputTokens, params.cachedTokens,
      params.model, params.durationMs, Date.now()
    )
    .run();
}
```

- [ ] Typecheck: `npx tsc -p tsconfig.worker.json --noEmit`
- [ ] Commit: `feat(week3): Claude wrapper with prompt caching + generation log`

---

## Task 3: AI routes with mocked tests (TDD)

**Strategy:** Mock the `callClaudeJson` module with `vi.mock()` so tests don't call real Anthropic.

- [ ] Add `ANTHROPIC_API_KEY: "test-anthropic-key"` to the test bindings in `vitest.config.ts`.

- [ ] Create `tests/worker/routes-ai.test.ts` with 9 tests covering:
  - POST `/api/ai/variations`: 401 no auth, 400 short brief, 200 returns 3 variations (mocked), DB log row exists, 502 when model returns wrong count, 502 on upstream error
  - POST `/api/ai/rewrite`: 200 returns rewritten, 400 missing network
  - POST `/api/ai/tone`: 200 returns adjusted, 400 invalid tone

Test skeleton (full code below):
```ts
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

const TEST_USER = "u_ai_test";
const TEST_EMAIL = "ai@test.dev";

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ai_generations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER, cost_cents INTEGER, model TEXT NOT NULL, duration_ms INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
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
  for (const s of SCHEMA_SQL) { const stmt = env.DB.prepare(s); await stmt.run(); }
  const hash = await hashPassword("x");
  await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").bind(TEST_USER, TEST_EMAIL, hash, Date.now()).run();
});

beforeEach(() => { callClaudeJson.mockReset(); });
```

Then individual tests follow this pattern — example for variations success:
```ts
it("200 returns 3 variations on mocked response", async () => {
  callClaudeJson.mockResolvedValueOnce({
    data: { variations: ["v1", "v2", "v3"] },
    usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 80 },
    durationMs: 500,
  });
  const res = await authedCall("/api/ai/variations", {
    method: "POST",
    body: JSON.stringify({ brief: "lance de produto novo", network: "linkedin", tone: "direct" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { variations: string[] };
  expect(body.variations).toHaveLength(3);
  // log
  const log = await env.DB.prepare("SELECT kind, input_tokens FROM ai_generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").bind(TEST_USER).first<{ kind: string; input_tokens: number }>();
  expect(log?.kind).toBe("variations");
});
```

**NOTE on schema bootstrap:** Unlike Week 2 tests that used `env.DB.exec(multiStatementSql)`, here we iterate and use `.prepare().run()` per statement — the test setup's first statement uses `CREATE TABLE IF NOT EXISTS users` (already created by other test suites) and then `ai_generations`. Both run cleanly per statement.

- [ ] Run tests — expect FAIL (404s, route not mounted yet).

- [ ] Create `src/worker/routes/ai.ts` with 3 handlers (POST /variations, POST /rewrite, POST /tone) that:
  1. Call `requireAuth` (global middleware)
  2. Parse body with Zod schema (400 on fail)
  3. Call `callClaudeJson` with the appropriate system+user prompts from `ai/prompts.ts`
  4. Validate shape of result (502 on malformed model output)
  5. Call `logAiGeneration` to write to D1
  6. Return JSON response

Full implementation follows this structure:
```ts
import { Hono } from "hono";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import { GenerateVariationsSchema, RewriteForNetworkSchema, AdjustToneSchema } from "../validation";
import { callClaudeJson, MODEL } from "../ai/claude";
import { systemForVariations, userForVariations, systemForRewrite, userForRewrite, systemForTone, userForTone } from "../ai/prompts";
import { logAiGeneration } from "../db/queries";
import type { GenerateVariationsResponse, RewriteForNetworkResponse, AdjustToneResponse } from "../../shared/types";

export const ai = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
ai.use("*", requireAuth);

function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

ai.post("/variations", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = GenerateVariationsSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }
  try {
    const result = await callClaudeJson<{ variations: string[] }>(c.env.ANTHROPIC_API_KEY, {
      system: systemForVariations(), user: userForVariations(parsed), maxTokens: 2048,
    });
    if (!Array.isArray(result.data.variations) || result.data.variations.length !== 3) {
      return c.json({ error: "invalid_model_output" }, 502);
    }
    const response: GenerateVariationsResponse = { variations: result.data.variations };
    await logAiGeneration(c.env.DB, {
      id: randomId("ai"), userId, kind: "variations",
      input: parsed, output: response,
      inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
      cachedTokens: result.usage.cachedTokens, model: MODEL, durationMs: result.durationMs,
    });
    return c.json(response);
  } catch {
    return c.json({ error: "upstream_failed" }, 502);
  }
});

// Same pattern for /rewrite and /tone — different schemas and response shapes.
```

- [ ] Mount in `src/worker/index.ts`: `import { ai } from "./routes/ai"; app.route("/api/ai", ai);`
- [ ] Run full test suite: `npx vitest run`. Expected: 36 tests pass (27 prior + 9 AI).
- [ ] Commit: `feat(week3): AI routes (variations/rewrite/tone) with logging`

---

## Task 4: AI Assistant component + Editor wiring

- [ ] Append AI methods to `src/web/lib/api.ts`:
```ts
  aiVariations: (body: GenerateVariationsRequest) =>
    json<GenerateVariationsResponse>("/api/ai/variations", "POST", body),
  aiRewrite: (body: RewriteForNetworkRequest) =>
    json<RewriteForNetworkResponse>("/api/ai/rewrite", "POST", body),
  aiTone: (body: AdjustToneRequest) =>
    json<AdjustToneResponse>("/api/ai/tone", "POST", body),
```
with imports: `GenerateVariationsRequest, GenerateVariationsResponse, RewriteForNetworkRequest, RewriteForNetworkResponse, AdjustToneRequest, AdjustToneResponse, Tone` from `../../shared/types`.

- [ ] Create `src/web/components/AIAssistant.tsx`:
```tsx
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NETWORK_LIST } from "../lib/networks";
import type { Network, Tone } from "../../shared/types";

interface Props {
  body: string;
  onApply: (text: string) => void;
}

type Mode = null | "variations" | "rewrite" | "tone";

const TONES: { id: Tone; label: string }[] = [
  { id: "formal", label: "Formal" },
  { id: "casual", label: "Casual" },
  { id: "playful", label: "Brincalhão" },
  { id: "direct", label: "Direto" },
];

export function AIAssistant({ body, onApply }: Props) {
  const [mode, setMode] = useState<Mode>(null);
  const [brief, setBrief] = useState("");
  const [network, setNetwork] = useState<Network>("linkedin");
  const [tone, setTone] = useState<Tone>("casual");
  const [results, setResults] = useState<string[]>([]);

  const variationsMut = useMutation({
    mutationFn: () => api.aiVariations({ brief, network, tone }),
    onSuccess: (r) => setResults(r.variations),
  });
  const rewriteMut = useMutation({
    mutationFn: () => api.aiRewrite({ body, network }),
    onSuccess: (r) => setResults([r.rewritten]),
  });
  const toneMut = useMutation({
    mutationFn: () => api.aiTone({ body, tone }),
    onSuccess: (r) => setResults([r.adjusted]),
  });

  function close() { setMode(null); setResults([]); }
  const busy = variationsMut.isPending || rewriteMut.isPending || toneMut.isPending;

  return (
    <div className="ai-panel">
      <div className="ai-buttons">
        <button className="btn-secondary" onClick={() => setMode("variations")}>
          ✨ Gerar variações
        </button>
        <button className="btn-secondary" onClick={() => setMode("rewrite")} disabled={!body.trim()}>
          🔀 Reescrever pra rede
        </button>
        <button className="btn-secondary" onClick={() => setMode("tone")} disabled={!body.trim()}>
          🎨 Ajustar tom
        </button>
      </div>

      {mode === "variations" && (
        <div className="ai-form">
          <label>Brief (o que é o post?)</label>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
            placeholder="Ex: lançamento do novo recurso de exportação em PDF" />
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <label style={{ flex: 1 }}>Rede alvo
              <select value={network} onChange={(e) => setNetwork(e.target.value as Network)}>
                {NETWORK_LIST.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </label>
            <label style={{ flex: 1 }}>Tom
              <select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                {TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
          </div>
          <div className="ai-actions">
            <button className="btn-secondary" onClick={close}>Fechar</button>
            <button className="btn-primary" onClick={() => variationsMut.mutate()}
              disabled={brief.trim().length < 3 || busy}>
              {busy ? "Gerando..." : "Gerar"}
            </button>
          </div>
        </div>
      )}

      {mode === "rewrite" && (
        <div className="ai-form">
          <label>Rede alvo</label>
          <select value={network} onChange={(e) => setNetwork(e.target.value as Network)}>
            {NETWORK_LIST.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <div className="ai-actions">
            <button className="btn-secondary" onClick={close}>Fechar</button>
            <button className="btn-primary" onClick={() => rewriteMut.mutate()} disabled={busy}>
              {busy ? "Reescrevendo..." : "Reescrever"}
            </button>
          </div>
        </div>
      )}

      {mode === "tone" && (
        <div className="ai-form">
          <label>Tom alvo</label>
          <select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
            {TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <div className="ai-actions">
            <button className="btn-secondary" onClick={close}>Fechar</button>
            <button className="btn-primary" onClick={() => toneMut.mutate()} disabled={busy}>
              {busy ? "Ajustando..." : "Ajustar"}
            </button>
          </div>
        </div>
      )}

      {(variationsMut.isError || rewriteMut.isError || toneMut.isError) && (
        <p className="err">A IA travou. Tenta de novo.</p>
      )}

      {results.length > 0 && (
        <div className="ai-results">
          {results.map((r, i) => (
            <div key={i} className="ai-result">
              <pre>{r}</pre>
              <button className="btn-primary" onClick={() => { onApply(r); close(); }}>
                Usar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] Append AI panel CSS to `src/web/styles.css`:
```css
.ai-panel { margin-bottom: 16px; }
.ai-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
.ai-form { margin-top: 12px; padding: 12px; background: #0d0d12; border: 1px solid #1f1f28; border-radius: 10px; }
.ai-form label { display: block; font-size: 12px; color: #aaa; margin: 8px 0 4px; }
.ai-form textarea { width: 100%; box-sizing: border-box; padding: 8px; background: #111118; color: #eee; border: 1px solid #2a2a36; border-radius: 6px; font-family: inherit; font-size: 13px; resize: vertical; }
.ai-form select { width: 100%; padding: 6px; background: #111118; color: #eee; border: 1px solid #2a2a36; border-radius: 6px; font-size: 13px; }
.ai-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.ai-results { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.ai-result { background: #0d0d12; border: 1px solid #1f1f28; border-radius: 10px; padding: 12px; display: flex; gap: 12px; align-items: flex-start; }
.ai-result pre { flex: 1; white-space: pre-wrap; margin: 0; font-family: inherit; font-size: 13px; color: #eee; }
```

- [ ] Wire into `src/web/pages/Editor.tsx`: import `AIAssistant` and render `<AIAssistant body={body} onApply={(text) => setBody(text)} />` at the top of the `.editor-pane` div (above the Copy base label).

- [ ] `npx tsc -b && npm run build` — zero errors.
- [ ] Commit: `feat(week3): AI assistant panel in editor`

---

## Task 5: Deploy

- [ ] Apply migration remote: `yes | npx wrangler d1 migrations apply social_command --remote`
- [ ] Upload Anthropic secret (pipe from `.dev.vars`):
```
grep '^ANTHROPIC_API_KEY=' .dev.vars | cut -d= -f2- | npx wrangler secret put ANTHROPIC_API_KEY
```
  - If `.dev.vars` doesn't have a real key yet, STOP and ask the user for their Anthropic API key.
- [ ] Verify secrets list shows: JWT_SECRET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, ANTHROPIC_API_KEY
- [ ] `npm run deploy`
- [ ] Smoke test the 3 AI endpoints (login first, then POST each with real brief/body — should return 200 with non-empty text from Claude).
- [ ] Browser end-to-end: click "Gerar variações", type a brief, generate 3, click "Usar" on one — body field fills. Save.
- [ ] Commit + tag + push:
```
git add -A
git commit --allow-empty -m "chore: week 3 deployed"
git tag week-3-done
git push origin main --tags
```

---

## Verification checklist (end of Week 3)

- [ ] `npx tsc -b` clean
- [ ] `npm test` — 36 tests pass (27 prior + 9 AI)
- [ ] Editor shows 3 AI buttons
- [ ] Generate variations returns 3 distinct texts; "Usar" fills body
- [ ] Rewrite for LinkedIn vs TikTok returns noticeably different styles
- [ ] Adjust tone: same content, different register
- [ ] D1 `ai_generations` has rows with token counts after each call
- [ ] 2nd+ call shows `cached_tokens > 0` (prompt caching works)
- [ ] `git tag week-3-done` pushed

---

## Known limitations

- No streaming (waits for full response, usually <5s)
- No rate limit
- Prompt caching is ephemeral (~5min TTL)
- No content moderation on generations
- Portuguese-biased prompts (English users would get odd output)
