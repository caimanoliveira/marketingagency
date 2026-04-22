import { Hono } from "hono";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import { GenerateVariationsSchema, RewriteForNetworkSchema, AdjustToneSchema } from "../validation";
import { callClaudeJson, MODEL } from "../ai/claude";
import {
  systemForVariations, userForVariations,
  systemForRewrite, userForRewrite,
  systemForTone, userForTone,
} from "../ai/prompts";
import { logAiGeneration } from "../db/queries";
import type {
  GenerateVariationsResponse,
  RewriteForNetworkResponse,
  AdjustToneResponse,
} from "../../shared/types";

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
      system: systemForVariations(),
      user: userForVariations(parsed),
      maxTokens: 2048,
    });
    if (!Array.isArray(result.data.variations) || result.data.variations.length !== 3) {
      return c.json({ error: "invalid_model_output" }, 502);
    }
    const response: GenerateVariationsResponse = { variations: result.data.variations };
    await logAiGeneration(c.env.DB, {
      id: randomId("ai"),
      userId,
      kind: "variations",
      input: parsed,
      output: response,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cachedTokens: result.usage.cachedTokens,
      model: MODEL,
      durationMs: result.durationMs,
    });
    return c.json(response);
  } catch (err) {
    console.error("[ai/variations]", err);
    return c.json({ error: "upstream_failed" }, 502);
  }
});

ai.post("/rewrite", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = RewriteForNetworkSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  try {
    const result = await callClaudeJson<{ rewritten: string }>(c.env.ANTHROPIC_API_KEY, {
      system: systemForRewrite(),
      user: userForRewrite(parsed),
      maxTokens: 2048,
    });
    if (typeof result.data.rewritten !== "string" || result.data.rewritten.length === 0) {
      return c.json({ error: "invalid_model_output" }, 502);
    }
    const response: RewriteForNetworkResponse = { rewritten: result.data.rewritten };
    await logAiGeneration(c.env.DB, {
      id: randomId("ai"),
      userId,
      kind: "rewrite",
      input: parsed,
      output: response,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cachedTokens: result.usage.cachedTokens,
      model: MODEL,
      durationMs: result.durationMs,
    });
    return c.json(response);
  } catch (err) {
    console.error("[ai/rewrite]", err);
    return c.json({ error: "upstream_failed" }, 502);
  }
});

ai.post("/tone", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = AdjustToneSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  try {
    const result = await callClaudeJson<{ adjusted: string }>(c.env.ANTHROPIC_API_KEY, {
      system: systemForTone(),
      user: userForTone(parsed),
      maxTokens: 2048,
    });
    if (typeof result.data.adjusted !== "string" || result.data.adjusted.length === 0) {
      return c.json({ error: "invalid_model_output" }, 502);
    }
    const response: AdjustToneResponse = { adjusted: result.data.adjusted };
    await logAiGeneration(c.env.DB, {
      id: randomId("ai"),
      userId,
      kind: "tone",
      input: parsed,
      output: response,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cachedTokens: result.usage.cachedTokens,
      model: MODEL,
      durationMs: result.durationMs,
    });
    return c.json(response);
  } catch (err) {
    console.error("[ai/tone]", err);
    return c.json({ error: "upstream_failed" }, 502);
  }
});
