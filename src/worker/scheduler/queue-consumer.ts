import type { Env } from "../index";
import type { PublishJob } from "../../shared/types";
import { publishOnce } from "../publishOnce";

export async function handlePublishBatch(
  batch: MessageBatch<PublishJob>,
  env: Env
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      // We need userId — look up via post row
      const post = await env.DB.prepare("SELECT user_id FROM posts WHERE id = ?")
        .bind(msg.body.postId).first<{ user_id: string }>();
      if (!post) {
        msg.ack();
        continue;
      }
      await publishOnce(env, post.user_id, msg.body.postId, msg.body.targetId);
      msg.ack();
    } catch (e) {
      const err = e instanceof Error ? e.message : "unknown";
      const attemptNum = msg.attempts;
      if (attemptNum >= 3) {
        await env.DB.prepare(
          "UPDATE post_targets SET status = 'failed', last_error = ?, attempts = ? WHERE id = ?"
        ).bind(err, attemptNum, msg.body.targetId).run();
        msg.ack();
      } else {
        await env.DB.prepare(
          "UPDATE post_targets SET last_error = ?, attempts = attempts + 1 WHERE id = ?"
        ).bind(err, msg.body.targetId).run();
        msg.retry({ delaySeconds: Math.min(300, 30 * Math.pow(2, attemptNum)) });
      }
    }
  }
}
