import { Hono } from "hono";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import { CreateHookSchema } from "../validation";
import { createHook, listHooks, getHook, deleteHook, incrementHookUse, type HookRow } from "../db/queries";
import type { Hook, HookType, Network } from "../../shared/types";

export const hooks = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
hooks.use("*", requireAuth);

function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function toPublic(r: HookRow): Hook {
  return {
    id: r.id,
    template: r.template,
    hookType: r.hook_type as HookType | null,
    niche: r.niche,
    sourceHandle: r.source_handle,
    network: r.network as Network | null,
    viewCount: r.view_count,
    useCount: r.use_count,
    createdAt: r.created_at,
  };
}

hooks.get("/", async (c) => {
  const userId = c.get("userId");
  const q = c.req.query("q")?.trim() || undefined;
  const hookType = c.req.query("type")?.trim() || undefined;
  const network = c.req.query("network")?.trim() || undefined;
  const rows = await listHooks(c.env.DB, userId, { q, hookType, network });
  return c.json({ items: rows.map(toPublic) });
});

hooks.post("/", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = CreateHookSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  const id = randomId("hk");
  await createHook(c.env.DB, {
    id, userId,
    template: parsed.template,
    hookType: parsed.hookType ?? null,
    niche: parsed.niche ?? null,
    sourceHandle: parsed.sourceHandle ? parsed.sourceHandle.replace(/^@/, "") : null,
    network: parsed.network ?? null,
    viewCount: parsed.viewCount ?? null,
  });

  const row = await getHook(c.env.DB, userId, id);
  if (!row) return c.json({ error: "internal_error" }, 500);
  return c.json(toPublic(row), 201);
});

hooks.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const ok = await deleteHook(c.env.DB, userId, c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

hooks.post("/:id/use", async (c) => {
  const userId = c.get("userId");
  const useCount = await incrementHookUse(c.env.DB, userId, c.req.param("id"));
  if (useCount === null) return c.json({ error: "not_found" }, 404);
  return c.json({ useCount });
});
