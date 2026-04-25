import type { Env } from "../index";
import { callClaudeJson, MODEL } from "./claude";
import { systemForStrategy, userForStrategy } from "./strategy-prompts";
import {
  listPillars, listSources, getMetaConnection, saveWeeklySuggestion,
  getPillarPerformance, getWinningVariants,
  type SuggestedPostJson, type ContentPillarRow, type InspirationSourceRow,
} from "../db/queries";
import { fetchCompetitorBasic } from "../integrations/meta";

function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function nextMondayUTC(fromMs: number): string {
  const d = new Date(fromMs);
  const dow = d.getUTCDay();
  const daysUntilMon = (1 + 7 - dow) % 7 || 7;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMon));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
}

export async function generateWeeklyPlan(
  env: Env,
  userId: string,
  opts: { theme?: string | null; weekStart?: string | null } = {}
): Promise<{ suggestionId: string; weekStart: string }> {
  const pillars: ContentPillarRow[] = await listPillars(env.DB, userId);
  const radarSources: InspirationSourceRow[] = await listSources(env.DB, userId);

  const perfRows = await getPillarPerformance(env.DB, userId, 30);
  const pillarPerformance = perfRows.map((r) => ({
    pillarId: r.pillar_id,
    title: r.title,
    postCount: r.post_count ?? 0,
    avgEngagementRate: r.avg_engagement_rate,
  }));

  const winnerRows = await getWinningVariants(env.DB, userId, 14, 5);
  const winningVariants = winnerRows.map((w) => ({
    text: w.variant_text,
    network: w.network,
    engagementRate: w.engagement_rate,
  }));

  // Top posts (last 30d)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
  const { results: topRows } = await env.DB.prepare(
    `SELECT p.body, t.network, pm.likes, pm.engagement_rate
     FROM post_targets t
     JOIN posts p ON p.id = t.post_id
     LEFT JOIN post_metrics pm ON pm.id = (SELECT id FROM post_metrics WHERE target_id = t.id ORDER BY snapshot_at DESC LIMIT 1)
     WHERE p.user_id = ? AND t.status = 'published' AND t.published_at >= ?
     ORDER BY COALESCE(pm.likes, 0) + COALESCE(pm.comments, 0) DESC
     LIMIT 10`
  ).bind(userId, thirtyDaysAgo).all<{ body: string; network: string; likes: number | null; engagement_rate: number | null }>();
  const topPosts = (topRows ?? []).map((r) => ({
    network: r.network,
    body: r.body,
    likes: r.likes,
    engagementRate: r.engagement_rate,
  }));

  // Recent own posts (last 14d) — to avoid repetition
  const fourteenDaysAgo = Date.now() - 14 * 24 * 3600 * 1000;
  const { results: recentOwn } = await env.DB.prepare(
    `SELECT p.body, t.network, t.published_at
     FROM post_targets t JOIN posts p ON p.id = t.post_id
     WHERE p.user_id = ? AND t.status = 'published' AND t.published_at >= ?
     ORDER BY t.published_at DESC LIMIT 20`
  ).bind(userId, fourteenDaysAgo).all<{ body: string; network: string; published_at: number | null }>();
  const recentOwnPosts = (recentOwn ?? []).map((r) => ({
    network: r.network,
    body: r.body,
    publishedAt: r.published_at,
  }));

  // Radar samples via business_discovery if IG connected
  const radarSamples: Array<{ username: string; snippet: string }> = [];
  const metaConn = await getMetaConnection(env.DB, userId);
  if (metaConn && radarSources.length > 0) {
    const { results: igAccts } = await env.DB.prepare(
      "SELECT ig_user_id, fb_page_access_token FROM instagram_accounts WHERE connection_id = ? LIMIT 1"
    ).bind(metaConn.id).all<{ ig_user_id: string; fb_page_access_token: string }>();
    const acct = igAccts?.[0];
    if (acct) {
      for (const src of radarSources.filter((s) => s.network === "instagram").slice(0, 5)) {
        try {
          const info = await fetchCompetitorBasic(acct.ig_user_id, acct.fb_page_access_token, src.username);
          if (info) {
            const engagement = (info.recentAvgLikes ?? 0) + (info.recentAvgComments ?? 0);
            radarSamples.push({
              username: src.username,
              snippet: `${info.displayName ?? src.username} • ${info.followers?.toLocaleString("pt-BR") ?? "?"} followers • engajam. médio ${Math.round(engagement)}`,
            });
          }
        } catch (e) {
          console.error(`radar ${src.username}`, e);
        }
      }
    }
  }

  const targetNetworks = Array.from(new Set(recentOwnPosts.map((p) => p.network)));
  // Fallback when user has no history yet
  if (targetNetworks.length === 0) targetNetworks.push("linkedin", "instagram");

  const weekStart = opts.weekStart ?? nextMondayUTC(Date.now());

  const system = systemForStrategy();
  const user = userForStrategy({
    weekStart,
    theme: opts.theme ?? null,
    pillars,
    radarSources,
    topPosts,
    radarSamples,
    recentOwnPosts,
    targetNetworks,
    pillarPerformance,
    winningVariants,
  });

  const result = await callClaudeJson<{ rationale: string; posts: Array<{ day: string; time: string; network: string; pillarId: string | null; format: string; hook: string; body: string; media_suggestion: string }> }>(
    env.ANTHROPIC_API_KEY,
    { system, user, maxTokens: 4096 }
  );

  if (!Array.isArray(result.data.posts) || result.data.posts.length === 0) {
    throw new Error("invalid_model_output");
  }

  // Normalize posts → SuggestedPostJson
  const posts: SuggestedPostJson[] = result.data.posts.map((p) => ({
    day: p.day,
    time: p.time,
    network: p.network,
    pillarId: p.pillarId ?? null,
    format: p.format,
    hook: p.hook,
    body: p.body,
    mediaSuggestion: p.media_suggestion,
  }));

  const suggestionId = randomId("wsg");
  await saveWeeklySuggestion(env.DB, {
    id: suggestionId,
    userId,
    weekStart,
    theme: opts.theme ?? null,
    posts,
    rationale: result.data.rationale ?? null,
    model: MODEL,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedTokens: result.usage.cachedTokens,
  });

  return { suggestionId, weekStart };
}
