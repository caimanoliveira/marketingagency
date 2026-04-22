import { Hono } from "hono";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import { NetworkSchema } from "../validation";
import { getPostById, listTargetsForPost } from "../db/queries";
import { publishOnce } from "../publishOnce";

export const publish = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
publish.use("*", requireAuth);

publish.post("/:postId/:network", async (c) => {
  const userId = c.get("userId");
  const postId = c.req.param("postId");
  const net = NetworkSchema.safeParse(c.req.param("network"));
  if (!net.success) return c.json({ error: "invalid_network" }, 400);

  const post = await getPostById(c.env.DB, userId, postId);
  if (!post) return c.json({ error: "not_found" }, 404);
  const targets = await listTargetsForPost(c.env.DB, postId);
  const target = targets.find((t) => t.network === net.data);
  if (!target) return c.json({ error: "target_not_selected" }, 400);

  try {
    const result = await publishOnce(c.env, userId, postId, target.id);
    return c.json({ ok: true, externalId: result.externalId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    await c.env.DB.prepare(
      "UPDATE post_targets SET status = 'failed', last_error = ?, attempts = attempts + 1 WHERE id = ?"
    ).bind(msg, target.id).run();
    if (msg === "not_connected") return c.json({ error: "not_connected" }, 400);
    if (msg.startsWith("network_not_supported")) return c.json({ error: "network_not_supported_yet" }, 501);
    return c.json({ error: "publish_failed", detail: msg }, 502);
  }
});
