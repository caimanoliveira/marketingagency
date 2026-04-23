import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import {
  addCompetitor,
  listCompetitors,
  getCompetitor,
  removeCompetitor,
  upsertCompetitorSnapshot,
  listCompetitorSnapshots,
  getMetaConnection,
} from "../db/queries";
import { fetchCompetitorBasic } from "../integrations/meta";

export const competitors = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
competitors.use("*", requireAuth);

function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const AddSchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9._]{1,30}$/, "invalid_username"),
  network: z.enum(["instagram"]).optional().default("instagram"),
});

competitors.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await listCompetitors(c.env.DB, userId);
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      network: r.network,
      username: r.username,
      displayName: r.display_name,
      profilePictureUrl: r.profile_picture_url,
      addedAt: r.added_at,
      lastSnapshotAt: r.last_snapshot_at,
    })),
  });
});

competitors.post("/", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = AddSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  // Check dup
  const existing = await c.env.DB.prepare(
    "SELECT id FROM competitors WHERE user_id = ? AND network = ? AND username = ?"
  ).bind(userId, parsed.network, parsed.username).first();
  if (existing) return c.json({ error: "already_exists" }, 409);

  const id = randomId("cmp");
  await addCompetitor(c.env.DB, {
    id, userId, network: parsed.network, username: parsed.username,
    displayName: null, profilePictureUrl: null,
  });

  // Attempt inline first snapshot if Meta connected
  try {
    const metaConn = await getMetaConnection(c.env.DB, userId);
    if (metaConn) {
      const { results: igAccounts } = await c.env.DB.prepare(
        "SELECT ig_user_id, fb_page_access_token FROM instagram_accounts WHERE connection_id = ? LIMIT 1"
      ).bind(metaConn.id).all<{ ig_user_id: string; fb_page_access_token: string }>();
      const first = igAccounts?.[0];
      if (first) {
        const info = await fetchCompetitorBasic(first.ig_user_id, first.fb_page_access_token, parsed.username);
        if (info) {
          await upsertCompetitorSnapshot(c.env.DB, {
            id: randomId("cs"),
            competitorId: id,
            snapshotDate: todayStr(),
            followers: info.followers,
            mediaCount: info.mediaCount,
            recentAvgLikes: info.recentAvgLikes,
            recentAvgComments: info.recentAvgComments,
            recentPostsSampled: info.recentPostsSampled,
          });
          if (info.displayName || info.profilePictureUrl) {
            await c.env.DB.prepare(
              "UPDATE competitors SET display_name = COALESCE(?, display_name), profile_picture_url = COALESCE(?, profile_picture_url) WHERE id = ?"
            ).bind(info.displayName, info.profilePictureUrl, id).run();
          }
        }
      }
    }
  } catch (e) {
    console.error("initial competitor snapshot", e);
  }

  const row = await getCompetitor(c.env.DB, userId, id);
  if (!row) return c.json({ error: "internal_error" }, 500);
  return c.json({
    id: row.id,
    network: row.network,
    username: row.username,
    displayName: row.display_name,
    profilePictureUrl: row.profile_picture_url,
    addedAt: row.added_at,
    lastSnapshotAt: row.last_snapshot_at,
  }, 201);
});

competitors.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const ok = await removeCompetitor(c.env.DB, userId, c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

competitors.get("/:id/snapshots", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const comp = await getCompetitor(c.env.DB, userId, id);
  if (!comp) return c.json({ error: "not_found" }, 404);
  const daysStr = c.req.query("days") ?? "30";
  const days = Math.max(1, Math.min(365, parseInt(daysStr, 10) || 30));
  const items = await listCompetitorSnapshots(c.env.DB, id, days);
  return c.json({ items });
});
