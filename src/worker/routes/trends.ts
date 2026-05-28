import { Hono } from "hono";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import { AddTrendFeedSchema, UpdateTrendFeedSchema } from "../validation";
import {
  listTrendItems, deleteTrendItem,
  addTrendFeed, listTrendFeeds, removeTrendFeed, setTrendFeedEnabled,
  type TrendItemRow, type TrendFeedRow,
} from "../db/queries";
import { refreshTrendsForUser, DEFAULT_FEEDS } from "../trends/refresh";

export const trends = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
trends.use("*", requireAuth);

function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function itemToPublic(r: TrendItemRow) {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    source: r.source,
    summary: r.summary,
    publishedAt: r.published_at,
    hookPotential: r.hook_potential as "high" | "medium" | "low" | null,
    hookAngle: r.hook_angle,
    fetchedAt: r.fetched_at,
  };
}

function feedToPublic(r: TrendFeedRow) {
  return { id: r.id, url: r.url, title: r.title, enabled: r.enabled === 1, addedAt: r.added_at };
}

trends.get("/", async (c) => {
  const userId = c.get("userId");
  const pot = c.req.query("potential");
  const hookPotential = pot === "high" || pot === "medium" || pot === "low" ? pot : undefined;
  const rows = await listTrendItems(c.env.DB, userId, { hookPotential });
  return c.json({ items: rows.map(itemToPublic) });
});

trends.post("/refresh", async (c) => {
  const userId = c.get("userId");
  try {
    const result = await refreshTrendsForUser(c.env, userId);
    const rows = await listTrendItems(c.env.DB, userId, {});
    return c.json({ ...result, items: rows.map(itemToPublic) });
  } catch (e) {
    console.error("[trends/refresh]", e);
    return c.json({ error: "refresh_failed" }, 502);
  }
});

trends.delete("/items/:id", async (c) => {
  const userId = c.get("userId");
  const ok = await deleteTrendItem(c.env.DB, userId, c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

// ---- Feeds ----

trends.get("/feeds", async (c) => {
  const userId = c.get("userId");
  const rows = await listTrendFeeds(c.env.DB, userId);
  return c.json({
    items: rows.map(feedToPublic),
    defaults: DEFAULT_FEEDS,
    usingDefaults: rows.filter((r) => r.enabled === 1).length === 0,
  });
});

trends.post("/feeds", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = AddTrendFeedSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  const id = randomId("tf");
  await addTrendFeed(c.env.DB, { id, userId, url: parsed.url, title: parsed.title ?? null });
  const rows = await listTrendFeeds(c.env.DB, userId);
  const row = rows.find((r) => r.url === parsed.url);
  if (!row) return c.json({ error: "internal_error" }, 500);
  return c.json(feedToPublic(row), 201);
});

trends.patch("/feeds/:id", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = UpdateTrendFeedSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }
  const ok = await setTrendFeedEnabled(c.env.DB, userId, c.req.param("id"), parsed.enabled);
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

trends.delete("/feeds/:id", async (c) => {
  const userId = c.get("userId");
  const ok = await removeTrendFeed(c.env.DB, userId, c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
