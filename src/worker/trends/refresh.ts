import type { Env } from "../index";
import { parseFeed, type RssItem } from "../integrations/rss";
import { callClaudeJson } from "../ai/claude";
import {
  listTrendFeeds, upsertTrendItem, pruneTrendItems, type TrendFeedRow,
} from "../db/queries";

export const DEFAULT_FEEDS: Array<{ url: string; title: string }> = [
  { url: "https://techcrunch.com/feed/", title: "TechCrunch" },
  { url: "https://www.theverge.com/rss/index.xml", title: "The Verge" },
  { url: "https://venturebeat.com/category/ai/feed/", title: "VentureBeat AI" },
  { url: "https://www.searchenginejournal.com/feed/", title: "Search Engine Journal" },
  { url: "https://blog.hubspot.com/marketing/rss.xml", title: "HubSpot Marketing" },
  { url: "https://hnrss.org/frontpage", title: "Hacker News" },
];

const MAX_ITEMS_PER_FEED = 8;
const MAX_ITEMS_SCORED = 25;
const FETCH_TIMEOUT_MS = 8000;
const PRUNE_AFTER_MS = 7 * 24 * 3600 * 1000;

function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

async function fetchFeed(url: string): Promise<RssItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "LumeTrends/1.0 (+https://social-command)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeed(xml).slice(0, MAX_ITEMS_PER_FEED);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

interface Scored { hookPotential: "high" | "medium" | "low"; hookAngle: string }

async function scoreItems(env: Env, items: RssItem[]): Promise<Map<number, Scored>> {
  const out = new Map<number, Scored>();
  if (items.length === 0 || !env.ANTHROPIC_API_KEY) return out;
  const list = items.map((it, i) => `${i}. ${it.title}${it.summary ? ` — ${it.summary.slice(0, 160)}` : ""}`).join("\n");
  const system =
    "Você é um estrategista de conteúdo para redes sociais. Avalie manchetes de notícias pelo potencial de virar um hook de post/Reel. " +
    "Para cada item, classifique o potencial de hook como 'high', 'medium' ou 'low' e escreva UM hook curto em português (máx 90 caracteres) que um criador poderia usar. " +
    'Responda APENAS um JSON: {"items":[{"index":0,"hookPotential":"high","hookAngle":"..."}]}.';
  const user = `Itens:\n${list}`;
  try {
    const result = await callClaudeJson<{ items: Array<{ index: number; hookPotential: string; hookAngle: string }> }>(
      env.ANTHROPIC_API_KEY,
      { system, user, maxTokens: 2048 }
    );
    for (const r of result.data.items ?? []) {
      const pot = r.hookPotential === "high" || r.hookPotential === "medium" || r.hookPotential === "low" ? r.hookPotential : "medium";
      if (typeof r.index === "number" && r.index >= 0 && r.index < items.length && typeof r.hookAngle === "string") {
        out.set(r.index, { hookPotential: pot, hookAngle: r.hookAngle.slice(0, 200) });
      }
    }
  } catch (e) {
    console.error("[trends] scoring failed", e);
  }
  return out;
}

export async function refreshTrendsForUser(env: Env, userId: string): Promise<{ fetched: number; scored: number }> {
  const userFeeds: TrendFeedRow[] = await listTrendFeeds(env.DB, userId);
  const enabled = userFeeds.filter((f) => f.enabled);
  const feeds = enabled.length > 0
    ? enabled.map((f) => f.url)
    : DEFAULT_FEEDS.map((f) => f.url);

  const results = await Promise.all(feeds.map(fetchFeed));

  // Dedupe by url, keep first occurrence.
  const byUrl = new Map<string, RssItem>();
  for (const list of results) {
    for (const item of list) {
      if (!byUrl.has(item.url)) byUrl.set(item.url, item);
    }
  }
  let items = [...byUrl.values()];
  // Sort newest-first, cap how many we score (token budget).
  items.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  const toScore = items.slice(0, MAX_ITEMS_SCORED);

  const scores = await scoreItems(env, toScore);

  for (let i = 0; i < toScore.length; i++) {
    const item = toScore[i];
    const s = scores.get(i);
    await upsertTrendItem(env.DB, {
      id: randomId("trd"),
      userId,
      title: item.title,
      url: item.url,
      source: item.source,
      summary: item.summary,
      publishedAt: item.publishedAt,
      hookPotential: s?.hookPotential ?? null,
      hookAngle: s?.hookAngle ?? null,
    });
  }

  await pruneTrendItems(env.DB, userId, Date.now() - PRUNE_AFTER_MS);

  return { fetched: items.length, scored: scores.size };
}

export async function refreshTrends(env: Env): Promise<{ usersProcessed: number; errors: string[] }> {
  const errors: string[] = [];
  let usersProcessed = 0;
  const { results: users } = await env.DB.prepare("SELECT id FROM users").all<{ id: string }>();
  for (const user of users ?? []) {
    usersProcessed++;
    try {
      await refreshTrendsForUser(env, user.id);
    } catch (e) {
      errors.push(`user ${user.id}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  return { usersProcessed, errors };
}
