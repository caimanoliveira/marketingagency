import { Hono } from "hono";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import { PresignedUploadSchema, ALLOWED_MIME_TYPES } from "../validation";
import { presignPut, presignGet } from "../r2/presigned";
import { createMedia, getMediaById, listMedia, deleteMedia, type MediaRow } from "../db/queries";
import type { PresignedUploadResponse, Media } from "../../shared/types";

export const media = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
media.use("*", requireAuth);

function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function extFromMime(mime: string) {
  switch (mime) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "video/mp4": return "mp4";
    case "video/quicktime": return "mov";
    default: return "bin";
  }
}

function r2Creds(env: Env) {
  return {
    accountId: env.R2_ACCOUNT_ID,
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
}

async function rowToMedia(row: MediaRow, env: Env): Promise<Media> {
  const url = await presignGet(r2Creds(env), row.r2_key);
  return {
    id: row.id,
    r2Key: row.r2_key,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    originalName: row.original_name,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    url,
  };
}

media.post("/presigned-upload", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try { parsed = PresignedUploadSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }
  if (!ALLOWED_MIME_TYPES.has(parsed.mimeType)) return c.json({ error: "mime_not_allowed" }, 400);
  const mediaId = randomId("m");
  const ext = extFromMime(parsed.mimeType);
  const r2Key = `media/${userId}/${mediaId}.${ext}`;
  await createMedia(c.env.DB, { id: mediaId, userId, r2Key, mimeType: parsed.mimeType, sizeBytes: parsed.sizeBytes, originalName: parsed.filename });
  const uploadUrl = await presignPut(r2Creds(c.env), r2Key, parsed.mimeType, 900);
  const body: PresignedUploadResponse = { mediaId, uploadUrl, r2Key, expiresIn: 900 };
  return c.json(body);
});

media.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await listMedia(c.env.DB, userId);
  const items = await Promise.all(rows.map((r) => rowToMedia(r, c.env)));
  return c.json({ items });
});

media.get("/:id", async (c) => {
  const userId = c.get("userId");
  const row = await getMediaById(c.env.DB, userId, c.req.param("id"));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(await rowToMedia(row, c.env));
});

media.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const row = await getMediaById(c.env.DB, userId, id);
  if (!row) return c.json({ error: "not_found" }, 404);
  try { await c.env.MEDIA.delete(row.r2_key); } catch { /* best-effort */ }
  await deleteMedia(c.env.DB, userId, id);
  return c.json({ ok: true });
});
