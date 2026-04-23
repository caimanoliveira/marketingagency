import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import { collectMetrics } from "../analytics/collect";
import { summaryForPeriod, topPosts, summaryForRange } from "../db/queries";

export const analytics = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
analytics.use("*", requireAuth);

analytics.post("/collect-now", async (c) => {
  const result = await collectMetrics(c.env);
  return c.json(result);
});

const PeriodSchema = z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]));
const NetworkEnum = z.enum(["instagram", "linkedin", "tiktok"]);
const FieldEnum = z.enum(["followers", "reach", "impressions", "profile_views"]);

analytics.get("/summary", async (c) => {
  const userId = c.get("userId");
  const periodRes = PeriodSchema.safeParse(c.req.query("period") ?? "30");
  if (!periodRes.success) return c.json({ error: "invalid_period" }, 400);
  const summary = await summaryForPeriod(c.env.DB, userId, periodRes.data);
  return c.json(summary);
});

analytics.get("/account-timeseries", async (c) => {
  const userId = c.get("userId");
  const net = NetworkEnum.safeParse(c.req.query("network"));
  if (!net.success) return c.json({ error: "invalid_network" }, 400);
  const field = FieldEnum.safeParse(c.req.query("field"));
  if (!field.success) return c.json({ error: "invalid_field" }, 400);
  const days = parseInt(c.req.query("days") ?? "30", 10);
  if (!Number.isFinite(days) || days < 1 || days > 365) return c.json({ error: "invalid_days" }, 400);

  const windowStart = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const fieldCol = field.data === "profile_views" ? "profile_views" : field.data;
  const { results } = await c.env.DB.prepare(
    `SELECT snapshot_date AS date, ${fieldCol} AS value
     FROM account_metrics
     WHERE user_id = ? AND network = ? AND snapshot_date >= ? AND ${fieldCol} IS NOT NULL
     ORDER BY snapshot_date ASC
     LIMIT 400`
  ).bind(userId, net.data, windowStart).all<{ date: string; value: number }>();
  return c.json({ points: results ?? [] });
});

analytics.get("/post-performance", async (c) => {
  const userId = c.get("userId");
  // Return each published target with latest metrics (or nulls if none)
  const { results } = await c.env.DB.prepare(
    `SELECT
       p.id AS post_id,
       p.body,
       t.network,
       t.external_id,
       t.published_at,
       pm.likes, pm.comments, pm.shares, pm.saved, pm.reach, pm.impressions, pm.engagement_rate, pm.snapshot_at
     FROM post_targets t
     JOIN posts p ON p.id = t.post_id
     LEFT JOIN post_metrics pm ON pm.id = (
       SELECT id FROM post_metrics WHERE target_id = t.id ORDER BY snapshot_at DESC LIMIT 1
     )
     WHERE p.user_id = ? AND t.status = 'published'
     ORDER BY t.published_at DESC
     LIMIT 200`
  ).bind(userId).all<{
    post_id: string; body: string; network: string; external_id: string | null; published_at: number | null;
    likes: number | null; comments: number | null; shares: number | null; saved: number | null;
    reach: number | null; impressions: number | null; engagement_rate: number | null; snapshot_at: number | null;
  }>();

  return c.json({
    items: (results ?? []).map((r) => ({
      postId: r.post_id,
      body: r.body,
      network: r.network,
      externalId: r.external_id,
      publishedAt: r.published_at,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      saved: r.saved,
      reach: r.reach,
      impressions: r.impressions,
      engagementRate: r.engagement_rate,
      snapshotAt: r.snapshot_at,
    })),
  });
});

analytics.get("/top-posts", async (c) => {
  const userId = c.get("userId");
  const limitStr = c.req.query("limit") ?? "10";
  const byStr = c.req.query("by") ?? "likes";
  const limit = Math.max(1, Math.min(50, parseInt(limitStr, 10) || 10));
  const by: "likes" | "engagement_rate" = byStr === "engagement_rate" ? "engagement_rate" : "likes";
  const items = await topPosts(c.env.DB, userId, { limit, by });
  return c.json({ items });
});

analytics.get("/wow", async (c) => {
  const userId = c.get("userId");
  const now = Date.now();
  const weekMs = 7 * 24 * 3600 * 1000;
  const currentFrom = now - weekMs;
  const currentTo = now;
  const previousFrom = now - 2 * weekMs;
  const previousTo = currentFrom;

  const [current, previous] = await Promise.all([
    summaryForRange(c.env.DB, userId, currentFrom, currentTo),
    summaryForRange(c.env.DB, userId, previousFrom, previousTo),
  ]);

  function pct(cur: number, prev: number): number | null {
    if (prev === 0) return null;
    return ((cur - prev) / prev) * 100;
  }

  return c.json({
    current,
    previous,
    delta: {
      totalReachPct: pct(current.totalReach, previous.totalReach),
      totalEngagementPct: pct(current.totalEngagement, previous.totalEngagement),
      followerGrowthPct: pct(current.followerGrowth, previous.followerGrowth),
      postsPublishedPct: pct(current.postsPublished, previous.postsPublished),
    },
  });
});
