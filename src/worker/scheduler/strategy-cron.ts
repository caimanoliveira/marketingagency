import type { Env } from "../index";
import { generateWeeklyPlan } from "../ai/strategy";

/**
 * For every user with at least one pillar OR one prior weekly_suggestion
 * (signals they're using the strategy agent), generate next week's plan.
 *
 * Runs Monday 6am UTC — produces plan for the upcoming Monday.
 */
export async function generateWeeklyPlanForAllUsers(env: Env): Promise<{ ok: number; failed: number }> {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT u.id AS user_id
     FROM users u
     WHERE EXISTS (SELECT 1 FROM content_pillars p WHERE p.user_id = u.id)
        OR EXISTS (SELECT 1 FROM weekly_suggestions w WHERE w.user_id = u.id)`
  ).all<{ user_id: string }>();

  let ok = 0;
  let failed = 0;
  for (const row of results ?? []) {
    try {
      await generateWeeklyPlan(env, row.user_id, { theme: null });
      ok++;
    } catch (e) {
      console.error(`strategy cron for user ${row.user_id}`, e);
      failed++;
    }
  }
  return { ok, failed };
}
