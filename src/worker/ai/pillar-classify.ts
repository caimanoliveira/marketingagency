import type { Env } from "../index";
import { callClaudeJson, FAST_MODEL } from "./claude";
import {
  listPillars, listUnclassifiedPosts, setPostPillar,
  type ContentPillarRow, type UnclassifiedPostRow,
} from "../db/queries";

export interface BackfillResult {
  attempted: number;
  classified: number;
  skipped: number;
}

function systemPrompt(): string {
  return [
    "Você classifica posts de redes sociais em pilares de conteúdo.",
    "Recebe a lista de pilares e uma lista de posts. Para cada post, escolhe UM pilar (ou null se não se encaixa em nenhum).",
    "Responde APENAS em JSON: {\"assignments\":[{\"postId\":\"...\",\"pillarId\":\"...\"|null}]}",
  ].join("\n");
}

function userPrompt(pillars: ContentPillarRow[], posts: UnclassifiedPostRow[]): string {
  const parts: string[] = [];
  parts.push("Pilares disponíveis:");
  for (const p of pillars) {
    parts.push(`  - [${p.id}] ${p.title}${p.description ? ": " + p.description : ""}`);
  }
  parts.push("");
  parts.push("Posts a classificar:");
  for (const post of posts) {
    parts.push(`  - [${post.id}] ${post.body.slice(0, 400)}`);
  }
  parts.push("");
  parts.push("Retorne um assignment para CADA postId acima.");
  return parts.join("\n");
}

export async function backfillPillars(env: Env, userId: string, batchSize = 20): Promise<BackfillResult> {
  const pillars = await listPillars(env.DB, userId);
  if (pillars.length === 0) {
    return { attempted: 0, classified: 0, skipped: 0 };
  }

  const posts = await listUnclassifiedPosts(env.DB, userId, batchSize);
  if (posts.length === 0) {
    return { attempted: 0, classified: 0, skipped: 0 };
  }

  const result = await callClaudeJson<{ assignments: Array<{ postId: string; pillarId: string | null }> }>(
    env.ANTHROPIC_API_KEY,
    { system: systemPrompt(), user: userPrompt(pillars, posts), maxTokens: 1024, model: FAST_MODEL }
  );

  const pillarIds = new Set(pillars.map((p) => p.id));
  const postIds = new Set(posts.map((p) => p.id));
  let classified = 0;
  let skipped = 0;

  for (const a of result.data.assignments ?? []) {
    if (!postIds.has(a.postId)) { skipped++; continue; }
    if (a.pillarId && !pillarIds.has(a.pillarId)) { skipped++; continue; }
    if (a.pillarId === null) { skipped++; continue; }
    const ok = await setPostPillar(env.DB, userId, a.postId, a.pillarId);
    if (ok) classified++;
  }

  return { attempted: posts.length, classified, skipped };
}
