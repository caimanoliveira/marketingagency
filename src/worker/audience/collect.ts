import type { Env } from "../index";
import { upsertRawComment } from "../db/queries";
import { fetchIgMediaComments } from "../integrations/meta";

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return "cr_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CollectAudienceResult {
  usersProcessed: number;
  commentsIngested: number;
  errors: string[];
}

export async function collectAudience(env: Env): Promise<CollectAudienceResult> {
  const result: CollectAudienceResult = { usersProcessed: 0, commentsIngested: 0, errors: [] };

  const { results: users } = await env.DB.prepare("SELECT id FROM users").all<{ id: string }>();
  for (const u of users ?? []) {
    result.usersProcessed++;
    try {
      const conn = await env.DB.prepare("SELECT id FROM meta_connections WHERE user_id = ?").bind(u.id).first<{ id: string }>();
      if (!conn) continue;
      const { results: accts } = await env.DB.prepare(
        "SELECT ig_user_id, fb_page_access_token FROM instagram_accounts WHERE connection_id = ?"
      ).bind(conn.id).all<{ ig_user_id: string; fb_page_access_token: string }>();
      const acct = accts?.[0];
      if (!acct) continue;

      const cutoff = Date.now() - 30 * 86_400_000;
      const { results: targets } = await env.DB.prepare(
        `SELECT t.id AS target_id, t.post_id, t.external_id
         FROM post_targets t JOIN posts p ON p.id = t.post_id
         WHERE p.user_id = ? AND t.network = 'instagram' AND t.status = 'published'
           AND t.external_id IS NOT NULL
           AND t.published_at >= ?`
      ).bind(u.id, cutoff).all<{ target_id: string; post_id: string; external_id: string }>();

      for (const t of targets ?? []) {
        const comments = await fetchIgMediaComments(t.external_id, acct.fb_page_access_token);
        for (const c of comments) {
          await upsertRawComment(env.DB, {
            id: randomId(),
            userId: u.id,
            postId: t.post_id,
            targetId: t.target_id,
            network: "instagram",
            externalCommentId: c.externalId,
            commenterHandle: c.username,
            body: c.body,
            postedAt: c.postedAt,
          });
          result.commentsIngested++;
        }
      }
    } catch (e) {
      result.errors.push(`${u.id}: ${e instanceof Error ? e.message : "err"}`);
    }
  }

  return result;
}
