import { Hono } from "hono";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import { collectMetrics } from "../analytics/collect";

export const analytics = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
analytics.use("*", requireAuth);

analytics.post("/collect-now", async (c) => {
  const result = await collectMetrics(c.env);
  return c.json(result);
});
