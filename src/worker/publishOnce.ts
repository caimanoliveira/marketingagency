import type { Env } from "./index";
import {
  getPostById, getMediaById, listTargetsForPost,
  getLinkedInConnection, upsertLinkedInConnection,
} from "./db/queries";
import type { Network } from "../shared/types";
import { publishUgcPost, uploadImageToLinkedIn, refreshAccessToken } from "./integrations/linkedin";

export interface PublishResult {
  externalId: string;
}

async function ensureFreshLinkedInToken(env: Env, userId: string): Promise<{ accessToken: string; authorUrn: string }> {
  const conn = await getLinkedInConnection(env.DB, userId);
  if (!conn) throw new Error("not_connected");
  let accessToken = conn.access_token;
  if (conn.expires_at - 60_000 < Date.now() && conn.refresh_token) {
    const refreshed = await refreshAccessToken(env, conn.refresh_token);
    accessToken = refreshed.accessToken;
    await upsertLinkedInConnection(env.DB, {
      id: conn.id,
      userId,
      memberId: conn.linkedin_member_id,
      memberName: conn.linkedin_member_name,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? conn.refresh_token,
      expiresAt: refreshed.expiresAt,
      scopes: conn.scopes,
    });
  }
  return { accessToken, authorUrn: conn.linkedin_member_id };
}

export async function publishOnce(
  env: Env,
  userId: string,
  postId: string,
  targetId: string
): Promise<PublishResult> {
  const post = await getPostById(env.DB, userId, postId);
  if (!post) throw new Error("post_not_found");
  const targets = await listTargetsForPost(env.DB, postId);
  const target = targets.find((t) => t.id === targetId);
  if (!target) throw new Error("target_not_found");
  const network = target.network as Network;

  if (network !== "linkedin") throw new Error(`network_not_supported_yet_${network}`);

  const { accessToken, authorUrn } = await ensureFreshLinkedInToken(env, userId);
  const finalAuthor = target.target_ref ?? authorUrn;
  const text = target.body_override ?? post.body;

  let imageAsset: string | undefined;
  if (post.media_id) {
    const media = await getMediaById(env.DB, userId, post.media_id);
    if (media && media.mime_type.startsWith("image/")) {
      const obj = await env.MEDIA.get(media.r2_key);
      if (obj) {
        const bytes = await obj.arrayBuffer();
        imageAsset = await uploadImageToLinkedIn(accessToken, finalAuthor, bytes, media.mime_type);
      }
    }
  }

  const result = await publishUgcPost({ accessToken, authorUrn: finalAuthor, text, imageAsset });

  // Mark target published
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE post_targets SET status = 'published', external_id = ?, published_at = ?, last_error = NULL WHERE id = ?"
  ).bind(result.ugcUrn, now, targetId).run();
  await env.DB.prepare("UPDATE posts SET status = 'published', updated_at = ? WHERE id = ?")
    .bind(now, postId).run();

  return { externalId: result.ugcUrn };
}
