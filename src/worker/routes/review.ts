import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../index";
import {
  getReviewLinkByToken, recordReviewDecision, addPostComment,
  getPostById, listTargetsForPost, listPillars,
} from "../db/queries";

export const review = new Hono<{ Bindings: Env }>();

// Public — no auth — token is the credential
review.get("/:token", async (c) => {
  const token = c.req.param("token");
  const link = await getReviewLinkByToken(c.env.DB, token);
  if (!link) return c.json({ error: "not_found" }, 404);

  const expired = link.expires_at < Date.now();
  const alreadyDecided = link.used_at !== null;

  const post = await getPostById(c.env.DB, link.user_id, link.post_id);
  if (!post) return c.json({ error: "post_not_found" }, 404);

  const targets = await listTargetsForPost(c.env.DB, link.post_id);
  const pillars = post.pillar_id ? await listPillars(c.env.DB, link.user_id) : [];
  const pillarTitle = pillars.find((p) => p.id === post.pillar_id)?.title ?? null;

  return c.json({
    postId: post.id,
    body: post.body,
    pillarTitle,
    networks: targets.map((t) => t.network),
    expired,
    alreadyDecided,
    decision: link.decision as "approved" | "rejected" | null,
  });
});

const DecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(2000).optional(),
});

review.post("/:token/decision", async (c) => {
  const token = c.req.param("token");
  let parsed;
  try { parsed = DecisionSchema.parse(await c.req.json()); }
  catch { return c.json({ error: "invalid_request" }, 400); }

  const link = await getReviewLinkByToken(c.env.DB, token);
  if (!link) return c.json({ error: "not_found" }, 404);
  if (link.expires_at < Date.now()) return c.json({ error: "expired" }, 410);
  if (link.used_at !== null) return c.json({ error: "already_decided" }, 409);

  const ok = await recordReviewDecision(c.env.DB, token, parsed.decision, parsed.comment ?? null);
  if (!ok) return c.json({ error: "race_condition" }, 409);

  // Move post status — approved → scheduled, rejected → draft
  const newStatus = parsed.decision === "approved" ? "scheduled" : "draft";
  await c.env.DB.prepare("UPDATE posts SET status = ?, updated_at = ? WHERE id = ?")
    .bind(newStatus, Date.now(), link.post_id).run();

  if (parsed.comment && parsed.comment.trim().length > 0) {
    const id = `cmt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    await addPostComment(c.env.DB, {
      id,
      postId: link.post_id,
      userId: null,
      authorLabel: parsed.decision === "approved" ? "reviewer (approved)" : "reviewer (rejected)",
      body: parsed.comment,
    });
  }

  return c.json({ ok: true, decision: parsed.decision });
});
