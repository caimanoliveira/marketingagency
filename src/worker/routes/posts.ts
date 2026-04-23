import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import {
  CreatePostSchema,
  UpdatePostSchema,
  UpdateTargetSchema,
  NetworkSchema,
} from "../validation";
import {
  createPost,
  getPostById,
  updatePost,
  deletePost,
  listPosts,
  listTargetsForPost,
  setPostTargets,
  updateTarget,
  getMediaById,
  listPendingManual,
  markTargetPublished,
  listPostsByMonth,
  listFailures,
  resetTargetForRetry,
  type PostRow,
  type PostTargetRow,
} from "../db/queries";
import { presignGet } from "../r2/presigned";
import type {
  Post,
  PostTarget,
  PostListItem,
  Network,
} from "../../shared/types";

export const posts = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
posts.use("*", requireAuth);

function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function r2Creds(env: Env) {
  return {
    accountId: env.R2_ACCOUNT_ID,
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
}

function targetRowToPublic(r: PostTargetRow): PostTarget {
  return {
    id: r.id,
    postId: r.post_id,
    network: r.network as Network,
    bodyOverride: r.body_override,
    scheduledAt: r.scheduled_at,
    publishedAt: r.published_at,
    externalId: r.external_id,
    status: r.status as PostTarget["status"],
    targetRef: r.target_ref,
    lastError: r.last_error,
    attempts: r.attempts,
  };
}

async function hydratePost(env: Env, row: PostRow): Promise<Post> {
  const targets = (await listTargetsForPost(env.DB, row.id)).map(targetRowToPublic);
  let media = null;
  if (row.media_id) {
    const m = await getMediaById(env.DB, row.user_id, row.media_id);
    if (m) {
      const url = await presignGet(r2Creds(env), m.r2_key);
      media = {
        id: m.id,
        r2Key: m.r2_key,
        mimeType: m.mime_type,
        sizeBytes: m.size_bytes,
        originalName: m.original_name,
        width: m.width,
        height: m.height,
        durationMs: m.duration_ms,
        createdAt: m.created_at,
        url,
      };
    }
  }
  return {
    id: row.id,
    body: row.body,
    mediaId: row.media_id,
    media,
    status: row.status as Post["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    targets,
  };
}

const SetTargetsSchema = z.object({ networks: z.array(NetworkSchema) });

posts.post("/", async (c) => {
  const userId = c.get("userId");
  let parsed;
  try {
    parsed = CreatePostSchema.parse(await c.req.json().catch(() => ({})));
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
  const id = randomId("p");
  await createPost(c.env.DB, {
    id,
    userId,
    body: parsed.body,
    mediaId: parsed.mediaId ?? null,
  });
  if (parsed.networks && parsed.networks.length > 0) {
    await setPostTargets(c.env.DB, id, parsed.networks);
  }
  const row = await getPostById(c.env.DB, userId, id);
  if (!row) return c.json({ error: "create_failed" }, 500);
  return c.json(await hydratePost(c.env, row), 201);
});

posts.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await listPosts(c.env.DB, userId);
  const items: PostListItem[] = await Promise.all(
    rows.map(async (r) => {
      let thumb: string | null = null;
      if (r.media_id) {
        const m = await getMediaById(c.env.DB, userId, r.media_id);
        if (m && m.mime_type.startsWith("image/")) {
          thumb = await presignGet(r2Creds(c.env), m.r2_key, 3600);
        }
      }
      return {
        id: r.id,
        body: r.body,
        status: r.status as PostListItem["status"],
        mediaId: r.media_id,
        mediaThumb: thumb,
        networks: (r.networks ? r.networks.split(",") : []) as Network[],
        updatedAt: r.updated_at,
      };
    })
  );
  return c.json({ items });
});

// Calendar view — must be before /:id
posts.get("/by-month", async (c) => {
  const userId = c.get("userId");
  const fromStr = c.req.query("from");
  const toStr = c.req.query("to");
  if (!fromStr || !toStr) return c.json({ error: "missing_range" }, 400);
  const from = parseInt(fromStr, 10);
  const to = parseInt(toStr, 10);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return c.json({ error: "invalid_range" }, 400);
  }
  const rows = await listPostsByMonth(c.env.DB, userId, from, to);
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      body: r.body,
      status: r.status,
      mediaId: r.media_id,
      networks: r.networks ? r.networks.split(",") : [],
      scheduledAt: r.scheduled_at,
      updatedAt: r.updated_at,
    })),
  });
});

// Failures list — must be before /:id
posts.get("/failures", async (c) => {
  const userId = c.get("userId");
  const rows = await listFailures(c.env.DB, userId);
  return c.json({
    items: rows.map((r) => ({
      postId: r.post_id,
      postBody: r.post_body,
      network: r.network,
      lastError: r.last_error,
      attempts: r.attempts,
      scheduledAt: r.scheduled_at,
    })),
  });
});

// Pending manual publish (currently TikTok only) — must be before /:id
posts.get("/pending-manual", async (c) => {
  const userId = c.get("userId");
  const rows = await listPendingManual(c.env.DB, userId);
  // Enrich with media URL
  const items = await Promise.all(rows.map(async (r) => {
    let mediaUrl: string | null = null;
    let mediaMime: string | null = null;
    if (r.media_id) {
      const m = await getMediaById(c.env.DB, userId, r.media_id);
      if (m) {
        mediaUrl = await presignGet(
          { accountId: c.env.R2_ACCOUNT_ID, bucket: c.env.R2_BUCKET, accessKeyId: c.env.R2_ACCESS_KEY_ID, secretAccessKey: c.env.R2_SECRET_ACCESS_KEY },
          m.r2_key,
          3600
        );
        mediaMime = m.mime_type;
      }
    }
    return {
      postId: r.post_id,
      targetId: r.target_id,
      network: r.network,
      body: r.body_override ?? r.post_body,
      mediaUrl,
      mediaMime,
      scheduledAt: r.scheduled_at,
    };
  }));
  return c.json({ items });
});

posts.get("/:id", async (c) => {
  const userId = c.get("userId");
  const row = await getPostById(c.env.DB, userId, c.req.param("id"));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(await hydratePost(c.env, row));
});

posts.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  let parsed;
  try {
    parsed = UpdatePostSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
  const row = await getPostById(c.env.DB, userId, id);
  if (!row) return c.json({ error: "not_found" }, 404);
  await updatePost(c.env.DB, userId, id, parsed);
  const updated = await getPostById(c.env.DB, userId, id);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(await hydratePost(c.env, updated));
});

posts.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const ok = await deletePost(c.env.DB, userId, id);
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

posts.put("/:id/targets", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const row = await getPostById(c.env.DB, userId, id);
  if (!row) return c.json({ error: "not_found" }, 404);
  let parsed;
  try {
    parsed = SetTargetsSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
  await setPostTargets(c.env.DB, id, parsed.networks);
  const updated = await getPostById(c.env.DB, userId, id);
  return c.json(await hydratePost(c.env, updated!));
});

posts.patch("/:id/targets/:network", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const network = NetworkSchema.safeParse(c.req.param("network"));
  if (!network.success) return c.json({ error: "invalid_network" }, 400);
  const row = await getPostById(c.env.DB, userId, id);
  if (!row) return c.json({ error: "not_found" }, 404);
  let parsed;
  try {
    parsed = UpdateTargetSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
  await updateTarget(c.env.DB, id, network.data, parsed);
  const updated = await getPostById(c.env.DB, userId, id);
  return c.json(await hydratePost(c.env, updated!));
});

// Mark a target as published manually
posts.post("/:id/targets/:network/mark-published", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const network = c.req.param("network");
  const body = await c.req.json().catch(() => ({})) as { externalUrl?: string };

  const post = await getPostById(c.env.DB, userId, id);
  if (!post) return c.json({ error: "not_found" }, 404);
  const targets = await listTargetsForPost(c.env.DB, id);
  const target = targets.find((t) => t.network === network);
  if (!target) return c.json({ error: "target_not_selected" }, 400);

  const ok = await markTargetPublished(c.env.DB, userId, id, target.id, body.externalUrl ?? null);
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

posts.post("/:id/targets/:network/retry", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const network = c.req.param("network");
  // Verify post exists for clearer 404
  const post = await getPostById(c.env.DB, userId, id);
  if (!post) return c.json({ error: "post_not_found" }, 404);
  const ok = await resetTargetForRetry(c.env.DB, userId, id, network);
  if (!ok) return c.json({ error: "target_not_found" }, 404);
  return c.json({ ok: true });
});
