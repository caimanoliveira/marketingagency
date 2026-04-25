import type { Env } from "../index";
import { callClaudeJson, FAST_MODEL } from "./claude";
import { listUnclassifiedComments, setCommentClassification } from "../db/queries";

export interface SentimentBatchResult {
  attempted: number;
  classified: number;
}

function systemPrompt(): string {
  return [
    "Você classifica comentários de redes sociais em Português ou Inglês.",
    "Para cada comentário, devolve sentiment in {positive, neutral, negative} e uma lista curta (até 3) de topics em letras minúsculas (e.g. ['preço', 'dúvida', 'agradecimento']).",
    "Responde APENAS em JSON: {\"items\":[{\"id\":\"...\",\"sentiment\":\"...\",\"topics\":[\"...\"]}]}",
  ].join("\n");
}

function userPrompt(items: Array<{ id: string; body: string }>): string {
  const lines = items.map((c) => `[${c.id}] ${c.body.slice(0, 280)}`);
  return ["Classificar:", ...lines, "", `Retorne uma entrada para CADA id acima.`].join("\n");
}

export async function classifyPendingComments(env: Env, userId: string, batchSize = 30): Promise<SentimentBatchResult> {
  const items = await listUnclassifiedComments(env.DB, userId, batchSize);
  if (items.length === 0) return { attempted: 0, classified: 0 };

  const result = await callClaudeJson<{ items: Array<{ id: string; sentiment: string; topics: string[] }> }>(
    env.ANTHROPIC_API_KEY,
    { system: systemPrompt(), user: userPrompt(items), maxTokens: 1024, model: FAST_MODEL }
  );

  const allowed = new Set(["positive", "neutral", "negative"]);
  const ids = new Set(items.map((i) => i.id));
  let classified = 0;
  for (const a of result.data.items ?? []) {
    if (!ids.has(a.id)) continue;
    if (!allowed.has(a.sentiment)) continue;
    const topics = Array.isArray(a.topics) ? a.topics.filter((t) => typeof t === "string").slice(0, 3) : [];
    await setCommentClassification(env.DB, a.id, a.sentiment, topics);
    classified++;
  }
  return { attempted: items.length, classified };
}
