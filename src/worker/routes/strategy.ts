import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import {
  upsertPillar, listPillars, deletePillar,
  addSource, listSources, removeSource,
  getWeeklySuggestion, listWeeklySuggestions,
} from "../db/queries";
import { generateWeeklyPlan } from "../ai/strategy";

export const strategy = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
strategy.use("*", requireAuth);

function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

const CreatePillarSchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  position: z.number().int().min(0).max(100).optional(),
});

const UpdatePillarSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  position: z.number().int().min(0).max(100).optional(),
});

const CreateSourceSchema = z.object({
  network: z.enum(["instagram", "tiktok", "linkedin"]),
  username: z.string().regex(/^[A-Za-z0-9._]{1,30}$/),
  note: z.string().max(200).nullable().optional(),
});

// ---- Pillars ----

strategy.get("/pillars", async (c) => {
  const userId = c.get("userId");
  const rows = await listPillars(c.env.DB, userId);
  return c.json({
    items: rows.map((r) => ({
      id: r.id, title: r.title, description: r.description, color: r.color,
      position: r.position, createdAt: r.created_at,
    })),
  });
});

strategy.post("/pillars", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = CreatePillarSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }
  const id = randomId("pil");
  await upsertPillar(c.env.DB, {
    id, userId,
    title: parsed.title,
    description: parsed.description ?? null,
    color: parsed.color ?? null,
    position: parsed.position ?? 0,
  });
  const rows = await listPillars(c.env.DB, userId);
  const row = rows.find((r) => r.id === id);
  if (!row) return c.json({ error: "create_failed" }, 500);
  return c.json({ id: row.id, title: row.title, description: row.description, color: row.color, position: row.position, createdAt: row.created_at }, 201);
});

strategy.patch("/pillars/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  let parsed;
  try { parsed = UpdatePillarSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  const rows = await listPillars(c.env.DB, userId);
  const current = rows.find((r) => r.id === id);
  if (!current) return c.json({ error: "not_found" }, 404);

  await upsertPillar(c.env.DB, {
    id, userId,
    title: parsed.title ?? current.title,
    description: parsed.description !== undefined ? parsed.description : current.description,
    color: parsed.color !== undefined ? parsed.color : current.color,
    position: parsed.position ?? current.position,
  });

  const updatedRows = await listPillars(c.env.DB, userId);
  const row = updatedRows.find((r) => r.id === id);
  return c.json({
    id: row!.id, title: row!.title, description: row!.description, color: row!.color,
    position: row!.position, createdAt: row!.created_at,
  });
});

strategy.delete("/pillars/:id", async (c) => {
  const userId = c.get("userId");
  const ok = await deletePillar(c.env.DB, userId, c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

// ---- Sources ----

strategy.get("/sources", async (c) => {
  const userId = c.get("userId");
  const rows = await listSources(c.env.DB, userId);
  return c.json({
    items: rows.map((r) => ({
      id: r.id, network: r.network, username: r.username, note: r.note, addedAt: r.added_at,
    })),
  });
});

strategy.post("/sources", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = CreateSourceSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  // Dup check
  const existing = await c.env.DB.prepare(
    "SELECT id FROM inspiration_sources WHERE user_id = ? AND network = ? AND username = ?"
  ).bind(userId, parsed.network, parsed.username).first();
  if (existing) return c.json({ error: "already_exists" }, 409);

  const id = randomId("src");
  await addSource(c.env.DB, {
    id, userId, network: parsed.network, username: parsed.username, note: parsed.note ?? null,
  });
  return c.json({
    id, network: parsed.network, username: parsed.username, note: parsed.note ?? null, addedAt: Date.now(),
  }, 201);
});

strategy.delete("/sources/:id", async (c) => {
  const userId = c.get("userId");
  const ok = await removeSource(c.env.DB, userId, c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

const GenerateSchema = z.object({
  theme: z.string().max(200).optional(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

strategy.post("/generate", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = GenerateSchema.parse(await c.req.json().catch(() => ({}))); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  try {
    const { suggestionId, weekStart } = await generateWeeklyPlan(c.env, userId, {
      theme: parsed.theme ?? null,
      weekStart: parsed.weekStart ?? null,
    });
    const suggestion = await getWeeklySuggestion(c.env.DB, userId, suggestionId);
    return c.json(suggestion);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("strategy generate", e);
    return c.json({ error: "generation_failed", detail: msg }, 502);
  }
});

strategy.get("/weekly-suggestions", async (c) => {
  const userId = c.get("userId");
  const limit = Math.max(1, Math.min(20, parseInt(c.req.query("limit") ?? "10", 10) || 10));
  const items = await listWeeklySuggestions(c.env.DB, userId, limit);
  return c.json({ items });
});

strategy.get("/weekly-suggestions/:id", async (c) => {
  const userId = c.get("userId");
  const s = await getWeeklySuggestion(c.env.DB, userId, c.req.param("id"));
  if (!s) return c.json({ error: "not_found" }, 404);
  return c.json(s);
});

// Helpers for approval
const DAY_MAP: Record<string, number> = { seg: 0, ter: 1, qua: 2, qui: 3, sex: 4, sab: 5, dom: 6 };

function parseWeekStart(weekStart: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return null;
  const [y, m, d] = weekStart.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function scheduleAtFromDayTime(weekStart: string, day: string, time: string): number | null {
  const base = parseWeekStart(weekStart);
  if (!base) return null;
  const dow = DAY_MAP[day];
  if (dow === undefined) return null;
  const [h, mi] = time.split(":").map((n) => parseInt(n, 10));
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  const dt = new Date(base.getTime());
  dt.setUTCDate(dt.getUTCDate() + dow);
  dt.setUTCHours(h, mi, 0, 0);
  return dt.getTime();
}

const ApproveSchema = z.object({
  acceptIndices: z.array(z.number().int().nonnegative()).optional(),
});

strategy.post("/weekly-suggestions/:id/approve", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  let parsed;
  try { parsed = ApproveSchema.parse(await c.req.json().catch(() => ({}))); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  const suggestion = await getWeeklySuggestion(c.env.DB, userId, id);
  if (!suggestion) return c.json({ error: "not_found" }, 404);

  const indices = parsed.acceptIndices ?? suggestion.posts.map((_, i) => i);
  const selected = indices
    .map((i) => ({ idx: i, post: suggestion.posts[i] }))
    .filter((x) => x.post !== undefined);

  if (selected.length === 0) return c.json({ error: "nothing_to_approve" }, 400);

  const createdPostIds: string[] = [];
  const now = Date.now();

  // Validate that any pillarId the LLM suggested actually belongs to this user.
  // Unknown ids are silently dropped to null so a hallucinated id doesn't block approval.
  const ownedPillars = await listPillars(c.env.DB, userId);
  const pillarIds = new Set(ownedPillars.map((p) => p.id));

  for (const { post } of selected) {
    const postId = randomId("p");
    const pillarId = post.pillarId && pillarIds.has(post.pillarId) ? post.pillarId : null;
    await c.env.DB.prepare(
      "INSERT INTO posts (id, user_id, body, pillar_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)"
    ).bind(postId, userId, post.body, pillarId, now, now).run();

    const scheduledAt = scheduleAtFromDayTime(suggestion.weekStart, post.day, post.time);
    const status = scheduledAt !== null && scheduledAt > now ? "scheduled" : "pending";
    const targetId = `t_${postId}_${post.network}`;

    await c.env.DB.prepare(
      "INSERT INTO post_targets (id, post_id, network, status, scheduled_at, attempts) VALUES (?, ?, ?, ?, ?, 0)"
    ).bind(targetId, postId, post.network, status, scheduledAt).run();

    createdPostIds.push(postId);
  }

  await c.env.DB.prepare("UPDATE weekly_suggestions SET status = 'approved', approved_at = ? WHERE id = ?")
    .bind(now, id).run();

  return c.json({ createdPostIds });
});
