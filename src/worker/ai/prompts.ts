import type { Network, Tone } from "../../shared/types";

const NETWORK_BRIEF: Record<Network, string> = {
  instagram: "Instagram: max 2200 chars, engaging, emojis welcome, 3-5 relevant hashtags at end, hook in first line, scannable.",
  tiktok: "TikTok: max 2200 chars but ideally short (under 300), very casual/conversational, strong hook, trending-aware, 3-5 hashtags.",
  linkedin: "LinkedIn: max 3000 chars, professional but human voice, insight or lesson upfront, short paragraphs, no emoji overload, 0-3 hashtags, no 'click here'.",
};

const TONE_BRIEF: Record<Tone, string> = {
  formal: "Formal, polished, precise. No slang, no casual contractions.",
  casual: "Casual, conversational, friendly. Contractions are fine. Feel like talking to a friend.",
  playful: "Playful, witty, light. Puns or cultural references are welcome if natural. Never corny.",
  direct: "Direct, punchy, zero fluff. Short sentences. Strong verbs. Cut filler.",
};

export function systemForVariations(): string {
  return [
    "Você é um copywriter especializado em redes sociais (Instagram, TikTok, LinkedIn).",
    "Gera 3 variações de copy diferentes entre si em ângulo/abordagem — não parafrasear.",
    `Responde APENAS em JSON válido no formato: {"variations":["v1","v2","v3"]}.`,
    "Sem markdown, sem comentários fora do JSON.",
    "Português brasileiro. Direto ao ponto. Sem emojis excessivos.",
  ].join("\n");
}

export function userForVariations(args: { brief: string; network?: Network; tone?: Tone }): string {
  const parts = [`Brief: ${args.brief}`];
  if (args.network) parts.push(`Rede-alvo: ${args.network}. ${NETWORK_BRIEF[args.network]}`);
  if (args.tone) parts.push(`Tom: ${args.tone}. ${TONE_BRIEF[args.tone]}`);
  parts.push("Gera 3 variações distintas.");
  return parts.join("\n\n");
}

export function systemForRewrite(): string {
  return [
    "Você adapta copy existente para uma rede social específica, respeitando limites e estilo da plataforma.",
    "Preserva a mensagem central. Ajusta tom, comprimento, formatação, hashtags conforme a rede.",
    `Responde APENAS em JSON válido: {"rewritten":"texto adaptado"}.`,
    "Sem markdown, sem explicação.",
    "Português brasileiro.",
  ].join("\n");
}

export function userForRewrite(args: { body: string; network: Network }): string {
  return [
    `Rede-alvo: ${args.network}. ${NETWORK_BRIEF[args.network]}`,
    `Copy original:\n${args.body}`,
    "Reescreve adaptando pra rede.",
  ].join("\n\n");
}

export function systemForTone(): string {
  return [
    "Você ajusta o TOM de um texto existente, mantendo o conteúdo/fatos idênticos.",
    "Apenas o estilo muda. Não acrescenta nem remove informação.",
    `Responde APENAS em JSON válido: {"adjusted":"texto com tom ajustado"}.`,
    "Sem markdown, sem explicação.",
    "Português brasileiro.",
  ].join("\n");
}

export function userForTone(args: { body: string; tone: Tone }): string {
  return [
    `Tom alvo: ${args.tone}. ${TONE_BRIEF[args.tone]}`,
    `Texto original:\n${args.body}`,
    "Ajusta o tom preservando o conteúdo.",
  ].join("\n\n");
}
