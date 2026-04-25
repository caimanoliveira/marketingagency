import { Hono } from "hono";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import { getTopEngagers, getSentimentSummary } from "../db/queries";
import { classifyPendingComments } from "../ai/sentiment";

export const audience = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
audience.use("*", requireAuth);

audience.get("/top-engagers", async (c) => {
  const userId = c.get("userId");
  const windowDays = parseInt(c.req.query("window") ?? "30", 10);
  const limit = parseInt(c.req.query("limit") ?? "10", 10);
  const w = Number.isFinite(windowDays) && windowDays > 0 ? Math.min(windowDays, 365) : 30;
  const l = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 10;
  const rows = await getTopEngagers(c.env.DB, userId, w, l);
  return c.json({
    window: w,
    items: rows.map((r) => ({
      handle: r.handle,
      network: r.network,
      commentCount: r.comment_count,
      positiveCount: r.positive_count,
      negativeCount: r.negative_count,
    })),
  });
});

audience.get("/sentiment-summary", async (c) => {
  const userId = c.get("userId");
  const windowDays = parseInt(c.req.query("window") ?? "30", 10);
  const w = Number.isFinite(windowDays) && windowDays > 0 ? Math.min(windowDays, 365) : 30;
  const rows = await getSentimentSummary(c.env.DB, userId, w);
  const summary = { positive: 0, neutral: 0, negative: 0, unclassified: 0 };
  for (const r of rows) {
    if (r.sentiment === "positive") summary.positive = r.c;
    else if (r.sentiment === "neutral") summary.neutral = r.c;
    else if (r.sentiment === "negative") summary.negative = r.c;
    else summary.unclassified = r.c;
  }
  return c.json({ window: w, summary });
});

audience.post("/classify-now", async (c) => {
  const userId = c.get("userId");
  try {
    const r = await classifyPendingComments(c.env, userId);
    return c.json(r);
  } catch (e) {
    console.error("classify-now failed", e);
    return c.json({ error: "classify_failed" }, 502);
  }
});
