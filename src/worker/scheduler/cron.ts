import type { Env } from "../index";
import type { PublishJob, Network } from "../../shared/types";

export async function scanAndEnqueue(env: Env): Promise<number> {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT t.id AS target_id, t.post_id, t.network, t.attempts, p.user_id
     FROM post_targets t
     JOIN posts p ON p.id = t.post_id
     WHERE t.status = 'scheduled' AND t.scheduled_at <= ?
     LIMIT 100`
  ).bind(now).all<{ target_id: string; post_id: string; network: string; attempts: number; user_id: string }>();

  let enqueued = 0;
  for (const row of results ?? []) {
    // Move status to 'publishing' atomically so the cron doesn't pick it up again
    const upd = await env.DB.prepare(
      "UPDATE post_targets SET status = 'publishing' WHERE id = ? AND status = 'scheduled'"
    ).bind(row.target_id).run();
    if (upd.meta.changes === 0) continue; // already picked up

    const msg: PublishJob = {
      postId: row.post_id,
      targetId: row.target_id,
      network: row.network as Network,
      attempt: row.attempts,
    };
    await env.PUBLISH_QUEUE.send(msg);
    enqueued++;
  }
  return enqueued;
}
