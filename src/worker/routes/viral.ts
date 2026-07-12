import { Hono } from "hono";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import {
  GenerateHooksSchema, GenerateReelsScriptSchema, GenerateCarouselSchema,
  RemodelViralSchema, ViralScoreSchema,
} from "../validation";
import { callClaudeJson, MODEL } from "../ai/claude";
import {
  systemForHooks, userForHooks,
  systemForReelsScript, userForReelsScript,
  systemForCarousel, userForCarousel,
  systemForRemodel, userForRemodel,
  systemForScore, userForScore,
} from "../ai/viral-prompts";
import { logAiGeneration, insertViralGeneration, listViralGenerations, deleteViralGeneration } from "../db/queries";
import { randomId } from "../utils/id";
import type {
  GenerateHooksResponse, GenerateReelsScriptResponse, GenerateCarouselResponse,
  RemodelViralResponse, ViralScoreResponse, ViralKind,
} from "../../shared/types";

export const viral = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
viral.use("*", requireAuth);

async function persist(
  env: Env,
  userId: string,
  kind: ViralKind,
  niche: string,
  input: unknown,
  output: unknown,
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number },
  durationMs: number
): Promise<void> {
  await insertViralGeneration(env.DB, { id: randomId("vg"), userId, kind, niche, input, output });
  await logAiGeneration(env.DB, {
    id: randomId("ai"),
    userId,
    kind: `viral_${kind}`,
    input,
    output,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedTokens: usage.cachedTokens,
    model: MODEL,
    durationMs,
  });
}

viral.post("/hooks", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = GenerateHooksSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  try {
    const result = await callClaudeJson<GenerateHooksResponse>(c.env.ANTHROPIC_API_KEY, {
      system: systemForHooks(),
      user: userForHooks(parsed),
      maxTokens: 3072,
    });
    if (!Array.isArray(result.data.hooks) || result.data.hooks.length === 0) {
      return c.json({ error: "invalid_model_output" }, 502);
    }
    await persist(c.env, userId, "hooks", parsed.niche, parsed, result.data, result.usage, result.durationMs);
    return c.json(result.data);
  } catch (err) {
    console.error("[viral/hooks]", err);
    return c.json({ error: "upstream_failed" }, 502);
  }
});

viral.post("/reels-script", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = GenerateReelsScriptSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  try {
    const result = await callClaudeJson<GenerateReelsScriptResponse>(c.env.ANTHROPIC_API_KEY, {
      system: systemForReelsScript(),
      user: userForReelsScript(parsed),
      maxTokens: 3072,
    });
    if (typeof result.data.hook !== "string" || !Array.isArray(result.data.beats) || result.data.beats.length === 0) {
      return c.json({ error: "invalid_model_output" }, 502);
    }
    await persist(c.env, userId, "reels_script", parsed.niche, parsed, result.data, result.usage, result.durationMs);
    return c.json(result.data);
  } catch (err) {
    console.error("[viral/reels-script]", err);
    return c.json({ error: "upstream_failed" }, 502);
  }
});

viral.post("/carousel", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = GenerateCarouselSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  try {
    const result = await callClaudeJson<GenerateCarouselResponse>(c.env.ANTHROPIC_API_KEY, {
      system: systemForCarousel(),
      user: userForCarousel(parsed),
      maxTokens: 4096,
    });
    if (typeof result.data.coverTitle !== "string" || !Array.isArray(result.data.slides) || result.data.slides.length === 0) {
      return c.json({ error: "invalid_model_output" }, 502);
    }
    await persist(c.env, userId, "carousel", parsed.niche, parsed, result.data, result.usage, result.durationMs);
    return c.json(result.data);
  } catch (err) {
    console.error("[viral/carousel]", err);
    return c.json({ error: "upstream_failed" }, 502);
  }
});

viral.post("/remodel", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = RemodelViralSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  try {
    const result = await callClaudeJson<RemodelViralResponse>(c.env.ANTHROPIC_API_KEY, {
      system: systemForRemodel(),
      user: userForRemodel(parsed),
      maxTokens: 4096,
    });
    if (typeof result.data.hook !== "string" || typeof result.data.body !== "string" || result.data.body.length === 0) {
      return c.json({ error: "invalid_model_output" }, 502);
    }
    await persist(c.env, userId, "remodel", parsed.niche, parsed, result.data, result.usage, result.durationMs);
    return c.json(result.data);
  } catch (err) {
    console.error("[viral/remodel]", err);
    return c.json({ error: "upstream_failed" }, 502);
  }
});

viral.post("/score", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = ViralScoreSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  try {
    const result = await callClaudeJson<ViralScoreResponse>(c.env.ANTHROPIC_API_KEY, {
      system: systemForScore(),
      user: userForScore(parsed),
      maxTokens: 3072,
    });
    if (typeof result.data.score !== "number" || !Array.isArray(result.data.breakdown)) {
      return c.json({ error: "invalid_model_output" }, 502);
    }
    await persist(c.env, userId, "score", "-", parsed, result.data, result.usage, result.durationMs);
    return c.json(result.data);
  } catch (err) {
    console.error("[viral/score]", err);
    return c.json({ error: "upstream_failed" }, 502);
  }
});

viral.get("/generations", async (c) => {
  const userId = c.get("userId");
  const items = await listViralGenerations(c.env.DB, userId);
  return c.json({ items });
});

viral.delete("/generations/:id", async (c) => {
  const userId = c.get("userId");
  const ok = await deleteViralGeneration(c.env.DB, userId, c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
