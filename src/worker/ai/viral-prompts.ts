import type { Network, Tone, ViralGoal } from "../../shared/types";

const NETWORK_NOTE: Record<Network, string> = {
  instagram: "Instagram (Reels/feed): gancho nos primeiros 1-2s, linguagem visual, 3-5 hashtags.",
  tiktok: "TikTok: ritmo acelerado, linguagem crua e nativa da plataforma, corte rápido, 3-5 hashtags.",
  linkedin: "LinkedIn: gancho de insight profissional, storytelling sóbrio, 0-3 hashtags.",
};

const GOAL_NOTE: Record<ViralGoal, string> = {
  seguidores: "Objetivo: atrair seguidores novos — conteúdo de topo de funil, amplo, compartilhável, CTA de seguir.",
  vendas: "Objetivo: vender — conectar dor a solução, prova concreta, CTA de compra/DM sem parecer anúncio.",
  autoridade: "Objetivo: construir autoridade — demonstrar domínio técnico com opinião própria, CTA de salvar/comentar.",
  engajamento: "Objetivo: engajamento — provocar identificação e resposta, pergunta ou polêmica saudável, CTA de comentar/compartilhar.",
};

const TONE_NOTE: Record<Tone, string> = {
  formal: "Tom formal, polido, preciso.",
  casual: "Tom casual, de conversa entre amigos.",
  playful: "Tom leve e bem-humorado, sem ser piegas.",
  direct: "Tom direto, frases curtas, zero enrolação.",
};

const VIRAL_CRAFT = [
  "Princípios de viralização que você domina:",
  "- Retenção: o primeiro segundo decide tudo; abrir loops e só fechar no final.",
  "- Gatilhos mentais: curiosidade, prova social, escassez, contraste, identificação, controvérsia saudável.",
  "- Especificidade vence generalidade: números, situações e exemplos concretos do nicho.",
  "- Escrita falada: frases curtas, ritmo, sem jargão vazio de marketing.",
].join("\n");

// ── Hooks ──

export function systemForHooks(): string {
  return [
    "Você é um especialista em ganchos (hooks) virais para redes sociais.",
    VIRAL_CRAFT,
    "Gera 10 ganchos DISTINTOS entre si, cada um usando uma alavanca psicológica diferente.",
    'Responde APENAS em JSON válido: {"hooks":[{"text":"...","category":"...","why":"..."}]} — exatamente 10 itens.',
    '"category" é a alavanca usada (ex.: curiosidade, erro comum, contraste, prova social, polêmica, pergunta, história, medo de ficar de fora, resultado, mito).',
    '"why" explica em 1 frase por que esse gancho segura atenção.',
    "Sem markdown, sem texto fora do JSON. Português brasileiro.",
  ].join("\n");
}

export function userForHooks(args: { niche: string; topic: string; network?: Network }): string {
  const parts = [`Nicho: ${args.niche}`, `Tema do conteúdo: ${args.topic}`];
  if (args.network) parts.push(`Plataforma: ${args.network}. ${NETWORK_NOTE[args.network]}`);
  parts.push("Gera os 10 ganchos.");
  return parts.join("\n\n");
}

// ── Reels script ──

export function systemForReelsScript(): string {
  return [
    "Você é um roteirista de vídeos curtos virais (Reels/TikTok/Shorts).",
    VIRAL_CRAFT,
    "Estrutura obrigatória do roteiro: gancho (0-2s) → contexto mínimo → desenvolvimento em beats que mantêm loops abertos → virada/entrega → CTA alinhado ao objetivo.",
    "Cada beat traz narração (o que falar) e direção visual (o que mostrar/cortar).",
    'Responde APENAS em JSON válido: {"title":"...","hook":"...","altHooks":["...","..."],"beats":[{"time":"0-2s","narration":"...","visual":"..."}],"cta":"...","caption":"...","hashtags":["..."]}.',
    '"altHooks" traz 2 ganchos alternativos. "hashtags" traz 3-5 itens sem "#".',
    "A soma dos beats respeita a duração pedida.",
    "Sem markdown, sem texto fora do JSON. Português brasileiro.",
  ].join("\n");
}

export function userForReelsScript(args: { niche: string; topic: string; durationSec: number; goal: ViralGoal; tone?: Tone }): string {
  const parts = [
    `Nicho: ${args.niche}`,
    `Tema: ${args.topic}`,
    `Duração-alvo: ${args.durationSec} segundos`,
    GOAL_NOTE[args.goal],
  ];
  if (args.tone) parts.push(TONE_NOTE[args.tone]);
  parts.push("Escreve o roteiro completo.");
  return parts.join("\n\n");
}

// ── Carousel ──

export function systemForCarousel(): string {
  return [
    "Você é um especialista em carrosséis virais de Instagram.",
    VIRAL_CRAFT,
    "Estrutura: capa com gancho forte (título curto de impacto + subtítulo que abre loop) → slides que entregam valor progressivo, um conceito por slide, texto enxuto → último slide com CTA.",
    "Título de slide: até 8 palavras. Texto de slide: até 280 caracteres.",
    'Responde APENAS em JSON válido: {"coverTitle":"...","coverSubtitle":"...","slides":[{"title":"...","text":"..."}],"caption":"...","hashtags":["..."]}.',
    "O último slide é o CTA. A legenda complementa (não repete) os slides. 3-5 hashtags sem \"#\".",
    "Sem markdown, sem texto fora do JSON. Português brasileiro.",
  ].join("\n");
}

export function userForCarousel(args: { niche: string; topic: string; slideCount: number; goal: ViralGoal; tone?: Tone }): string {
  const parts = [
    `Nicho: ${args.niche}`,
    `Tema: ${args.topic}`,
    `Número de slides (além da capa): ${args.slideCount}`,
    GOAL_NOTE[args.goal],
  ];
  if (args.tone) parts.push(TONE_NOTE[args.tone]);
  parts.push("Escreve o carrossel completo.");
  return parts.join("\n\n");
}

// ── Remodel ──

export function systemForRemodel(): string {
  return [
    "Você desconstrói conteúdos virais e reconstrói a MESMA estrutura para outro nicho.",
    VIRAL_CRAFT,
    "Processo: 1) identifica por que o conteúdo de referência funcionou (gancho, loops, gatilhos, ritmo); 2) extrai a estrutura abstrata; 3) recria o conteúdo aplicando essa estrutura ao nicho do usuário, com exemplos e linguagem próprios do nicho.",
    "NUNCA copia frases do original — a estrutura é reaproveitada, o texto é 100% novo.",
    'Responde APENAS em JSON válido: {"whyItWorks":"...","structure":"...","hook":"...","body":"...","caption":"...","hashtags":["..."]}.',
    '"structure" descreve a fórmula extraída em 1-2 frases. "body" é o conteúdo remodelado completo (roteiro ou texto). 3-5 hashtags sem "#".',
    "Sem markdown, sem texto fora do JSON. Português brasileiro.",
  ].join("\n");
}

export function userForRemodel(args: { reference: string; niche: string; topic?: string; tone?: Tone }): string {
  const parts = [
    `Conteúdo viral de referência (transcrição/texto):\n${args.reference}`,
    `Meu nicho: ${args.niche}`,
  ];
  if (args.topic) parts.push(`Tema específico que quero abordar: ${args.topic}`);
  if (args.tone) parts.push(TONE_NOTE[args.tone]);
  parts.push("Desconstrói e remodela pro meu nicho.");
  return parts.join("\n\n");
}

// ── Score ──

export function systemForScore(): string {
  return [
    "Você é um analista de potencial viral de conteúdo para redes sociais.",
    VIRAL_CRAFT,
    "Avalia o conteúdo em 5 critérios, cada um de 0 a 20: gancho, retenção (loops/ritmo), gatilhos mentais, clareza/especificidade, CTA.",
    "O score final (0-100) é a soma dos critérios. Seja rigoroso: 80+ é raro.",
    'Responde APENAS em JSON válido: {"score":0,"verdict":"...","breakdown":[{"criterion":"...","score":0,"feedback":"..."}],"improvements":["..."],"improvedHook":"..."}.',
    '"verdict" resume o diagnóstico em 1 frase. "breakdown" tem exatamente 5 itens. "improvements" traz 3-5 melhorias acionáveis em ordem de impacto. "improvedHook" reescreve o gancho na versão mais forte possível.',
    "Sem markdown, sem texto fora do JSON. Português brasileiro.",
  ].join("\n");
}

export function userForScore(args: { content: string; network?: Network }): string {
  const parts = [`Conteúdo a avaliar:\n${args.content}`];
  if (args.network) parts.push(`Plataforma-alvo: ${args.network}. ${NETWORK_NOTE[args.network]}`);
  parts.push("Avalia e pontua.");
  return parts.join("\n\n");
}

// ── Minha voz ──

export function voiceBlock(examples: string[]): string {
  if (examples.length === 0) return "";
  return [
    "MINHA VOZ — estes são posts meus com melhor desempenho. Imita o estilo, vocabulário, ritmo e tom deles (não o conteúdo):",
    ...examples.map((e, i) => `Exemplo ${i + 1}:\n${e}`),
  ].join("\n\n");
}
