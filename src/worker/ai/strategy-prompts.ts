import type { ContentPillarRow, InspirationSourceRow } from "../db/queries";

interface TopPostSample {
  network: string;
  body: string;
  likes: number | null;
  engagementRate: number | null;
}

interface RadarSample {
  username: string;
  snippet: string;     // condensed recent content idea, from business_discovery
}

export function systemForStrategy(): string {
  return [
    "Você é um estrategista de conteúdo sênior que monta agendas editoriais semanais para redes sociais (Instagram, TikTok, LinkedIn).",
    "Monta planos pragmáticos, com variedade de formatos e tons, alinhados aos pilares de conteúdo do usuário.",
    "Responde APENAS em JSON válido no formato:",
    `{"rationale":"resumo curto do porquê dessa agenda","posts":[{"day":"seg|ter|qua|qui|sex|sab|dom","time":"HH:MM","network":"instagram|tiktok|linkedin","pillarId":"id ou null","format":"post|reels|carousel|short-video","hook":"primeira frase chamativa","body":"copy completo","media_suggestion":"ideia visual"}]}`,
    "Sem markdown, sem comentários fora do JSON.",
    "Português brasileiro. Distribui posts entre dias úteis. Alterna formatos. Respeita limites de cada rede.",
  ].join("\n");
}

export function userForStrategy(args: {
  weekStart: string;
  theme: string | null;
  pillars: ContentPillarRow[];
  radarSources: InspirationSourceRow[];
  topPosts: TopPostSample[];
  radarSamples: RadarSample[];
  recentOwnPosts: Array<{ network: string; body: string; publishedAt: number | null }>;
  targetNetworks: string[];
}): string {
  const parts: string[] = [];
  parts.push(`Semana começando: ${args.weekStart}`);
  if (args.theme) parts.push(`Tema da semana: ${args.theme}`);

  if (args.pillars.length > 0) {
    parts.push("Pilares de conteúdo:");
    for (const p of args.pillars) {
      parts.push(`  - [${p.id}] ${p.title}${p.description ? ": " + p.description : ""}`);
    }
  } else {
    parts.push("Sem pilares definidos — distribua temas genéricos.");
  }

  if (args.targetNetworks.length > 0) {
    parts.push(`Redes alvo: ${args.targetNetworks.join(", ")}`);
  }

  if (args.topPosts.length > 0) {
    parts.push("Top posts últimos 30d (o que funcionou):");
    for (const t of args.topPosts.slice(0, 5)) {
      parts.push(`  - [${t.network}] ${t.body.slice(0, 120)} (likes: ${t.likes ?? "?"})`);
    }
  }

  if (args.radarSamples.length > 0) {
    parts.push("Radar de inspiração (ideias recentes):");
    for (const r of args.radarSamples.slice(0, 8)) {
      parts.push(`  - @${r.username}: ${r.snippet}`);
    }
  } else if (args.radarSources.length > 0) {
    parts.push(`Radar cadastrado mas sem amostras recentes: ${args.radarSources.map((s) => "@" + s.username).join(", ")}`);
  }

  if (args.recentOwnPosts.length > 0) {
    parts.push("Seus posts recentes (evitar repetir ângulo):");
    for (const p of args.recentOwnPosts.slice(0, 10)) {
      parts.push(`  - [${p.network}] ${p.body.slice(0, 100)}`);
    }
  }

  parts.push("Gera 5-7 posts distribuídos na semana, com variedade de formato/rede/tom.");
  return parts.join("\n\n");
}
