import type { Env } from "../index";
import { classifyPendingComments } from "../ai/sentiment";

export async function classifyPendingForAllUsers(env: Env): Promise<{ usersProcessed: number; classified: number; errors: string[] }> {
  const { results } = await env.DB.prepare("SELECT id FROM users").all<{ id: string }>();
  const users = (results ?? []).map((r) => r.id);
  let classified = 0;
  const errors: string[] = [];
  for (const userId of users) {
    try {
      const r = await classifyPendingComments(env, userId, 50);
      classified += r.classified;
    } catch (e) {
      errors.push(`${userId}: ${e instanceof Error ? e.message : "err"}`);
    }
  }
  return { usersProcessed: users.length, classified, errors };
}
