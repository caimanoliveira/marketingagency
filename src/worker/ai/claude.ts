import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-4-6";

export interface CallResult<T> {
  data: T;
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number; };
  durationMs: number;
}

export interface CallOptions {
  system: string;
  user: string;
  maxTokens?: number;
}

export async function callClaudeJson<T>(apiKey: string, opts: CallOptions): Promise<CallResult<T>> {
  const client = new Anthropic({ apiKey });
  const start = Date.now();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
  });
  const durationMs = Date.now() - start;
  const textBlock = resp.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) throw new Error("no_text_response");
  let data: T;
  try {
    data = JSON.parse(textBlock.text) as T;
  } catch {
    const match = textBlock.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("invalid_json_response");
    data = JSON.parse(match[0]) as T;
  }
  return {
    data,
    usage: {
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      cachedTokens: resp.usage.cache_read_input_tokens ?? 0,
    },
    durationMs,
  };
}
