import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Button, Input, Textarea, Select, Card, Badge } from "../ui";
import { toasts } from "../ui/toast";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRow } from "../components/Skeleton";
import type {
  Network, Tone, ViralGoal, ViralKind,
  GenerateHooksResponse, GenerateReelsScriptResponse, GenerateCarouselResponse,
  RemodelViralResponse, ViralScoreResponse, ViralGenerationListItem,
} from "../../shared/types";

const TOOLS: Array<{ kind: ViralKind; label: string; icon: string; blurb: string }> = [
  { kind: "hooks",        label: "Ganchos",   icon: "🪝", blurb: "10 ganchos com gatilhos mentais diferentes para o seu tema." },
  { kind: "reels_script", label: "Roteiro",   icon: "🎬", blurb: "Roteiro de Reels/TikTok beat a beat, com narração e direção visual." },
  { kind: "carousel",     label: "Carrossel", icon: "🎠", blurb: "Carrossel slide a slide com capa de impacto e CTA." },
  { kind: "remodel",      label: "Remodelar", icon: "♻️", blurb: "Cole um conteúdo viral e recrie a estrutura no seu nicho." },
  { kind: "score",        label: "Score",     icon: "📈", blurb: "Análise de potencial viral do seu rascunho, critério a critério." },
];

const KIND_LABEL: Record<ViralKind, string> = {
  hooks: "Ganchos", reels_script: "Roteiro", carousel: "Carrossel", remodel: "Remodelar", score: "Score",
};

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toasts.success("Copiado"),
    () => toasts.error("Falha ao copiar"),
  );
}

const label = { fontSize: 12, fontWeight: 600 as const, opacity: 0.6, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6 };

function ResultBlock({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={label}>{title}</div>
        <Button variant="ghost" size="sm" onClick={() => copy(text)}>Copiar</Button>
      </div>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

export function ViralStudio() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tool, setTool] = useState<ViralKind>("hooks");

  // shared inputs
  const [niche, setNiche] = useState("");
  const [topic, setTopic] = useState("");
  const [network, setNetwork] = useState<"" | Network>("");
  const [tone, setTone] = useState<"" | Tone>("");
  const [goal, setGoal] = useState<ViralGoal>("seguidores");
  const [durationSec, setDurationSec] = useState<15 | 30 | 60 | 90>(30);
  const [slideCount, setSlideCount] = useState(7);
  const [reference, setReference] = useState("");
  const [content, setContent] = useState("");

  const [hooksRes, setHooksRes] = useState<GenerateHooksResponse | null>(null);
  const [reelsRes, setReelsRes] = useState<GenerateReelsScriptResponse | null>(null);
  const [carouselRes, setCarouselRes] = useState<GenerateCarouselResponse | null>(null);
  const [remodelRes, setRemodelRes] = useState<RemodelViralResponse | null>(null);
  const [scoreRes, setScoreRes] = useState<ViralScoreResponse | null>(null);

  const history = useQuery({ queryKey: ["viral-generations"], queryFn: api.viralGenerations });

  const onDone = () => qc.invalidateQueries({ queryKey: ["viral-generations"] });
  const onErr = (e: Error) => toasts.error("Falha na geração", e.message);

  const hooksMut = useMutation({ mutationFn: api.viralHooks, onSuccess: (d) => { setHooksRes(d); onDone(); }, onError: onErr });
  const reelsMut = useMutation({ mutationFn: api.viralReelsScript, onSuccess: (d) => { setReelsRes(d); onDone(); }, onError: onErr });
  const carouselMut = useMutation({ mutationFn: api.viralCarousel, onSuccess: (d) => { setCarouselRes(d); onDone(); }, onError: onErr });
  const remodelMut = useMutation({ mutationFn: api.viralRemodel, onSuccess: (d) => { setRemodelRes(d); onDone(); }, onError: onErr });
  const scoreMut = useMutation({ mutationFn: api.viralScore, onSuccess: (d) => { setScoreRes(d); onDone(); }, onError: onErr });

  const deleteMut = useMutation({
    mutationFn: api.deleteViralGeneration,
    onSuccess: () => { onDone(); toasts.success("Removido do histórico"); },
  });

  const draftMut = useMutation({
    mutationFn: (body: string) => api.createPost({ body, networks: [] }),
    onSuccess: (post) => { toasts.success("Rascunho criado"); nav(`/posts/${post.id}`); },
    onError: (e: Error) => toasts.error("Falha ao criar rascunho", e.message),
  });

  const pending = hooksMut.isPending || reelsMut.isPending || carouselMut.isPending || remodelMut.isPending || scoreMut.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const base = { niche: niche.trim(), topic: topic.trim() };
    if (tool === "hooks") hooksMut.mutate({ ...base, network: network || undefined });
    else if (tool === "reels_script") reelsMut.mutate({ ...base, durationSec, goal, tone: tone || undefined });
    else if (tool === "carousel") carouselMut.mutate({ ...base, slideCount, goal, tone: tone || undefined });
    else if (tool === "remodel") remodelMut.mutate({ reference: reference.trim(), niche: base.niche, topic: base.topic || undefined, tone: tone || undefined });
    else scoreMut.mutate({ content: content.trim(), network: network || undefined });
  }

  const needsNiche = tool !== "score";
  const needsTopic = tool === "hooks" || tool === "reels_script" || tool === "carousel";
  const canSubmit =
    (!needsNiche || niche.trim().length >= 2) &&
    (!needsTopic || topic.trim().length >= 2) &&
    (tool !== "remodel" || reference.trim().length >= 20) &&
    (tool !== "score" || content.trim().length >= 20);

  function reelsAsDraft(r: GenerateReelsScriptResponse): string {
    return [
      `🎬 ${r.title}`,
      ``,
      `GANCHO: ${r.hook}`,
      ``,
      ...r.beats.map((b) => `[${b.time}] ${b.narration}\n(visual: ${b.visual})`),
      ``,
      `CTA: ${r.cta}`,
      ``,
      `LEGENDA:\n${r.caption}`,
      ``,
      r.hashtags.map((h) => `#${h}`).join(" "),
    ].join("\n");
  }

  function carouselAsDraft(r: GenerateCarouselResponse): string {
    return [
      `CAPA: ${r.coverTitle}\n${r.coverSubtitle}`,
      ``,
      ...r.slides.map((s, i) => `SLIDE ${i + 1} — ${s.title}\n${s.text}`),
      ``,
      `LEGENDA:\n${r.caption}`,
      ``,
      r.hashtags.map((h) => `#${h}`).join(" "),
    ].join("\n");
  }

  function remodelAsDraft(r: RemodelViralResponse): string {
    return [
      `GANCHO: ${r.hook}`,
      ``,
      r.body,
      ``,
      `LEGENDA:\n${r.caption}`,
      ``,
      r.hashtags.map((h) => `#${h}`).join(" "),
    ].join("\n");
  }

  function openHistoryItem(item: ViralGenerationListItem) {
    setTool(item.kind);
    if (item.kind === "hooks") setHooksRes(item.output as GenerateHooksResponse);
    else if (item.kind === "reels_script") setReelsRes(item.output as GenerateReelsScriptResponse);
    else if (item.kind === "carousel") setCarouselRes(item.output as GenerateCarouselResponse);
    else if (item.kind === "remodel") setRemodelRes(item.output as RemodelViralResponse);
    else setScoreRes(item.output as ViralScoreResponse);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const activeTool = TOOLS.find((t) => t.kind === tool)!;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0 }}>Estúdio Viral</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--lume-text-inverse)", opacity: 0.55 }}>
          Ganchos, roteiros, carrosséis e análise de viralização — gerados pela sua própria IA, sem mensalidade.
        </p>
      </div>

      {/* Tool tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {TOOLS.map((t) => (
          <Button
            key={t.kind}
            variant={t.kind === tool ? "primary" : "ghost"}
            size="sm"
            onClick={() => setTool(t.kind)}
          >
            <span aria-hidden style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
          </Button>
        ))}
      </div>

      {/* Form */}
      <Card style={{ maxWidth: 720, marginBottom: 24 }}>
        <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.7 }}>{activeTool.blurb}</p>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {needsNiche && (
            <Input label="Seu nicho" placeholder="ex.: nutrição para atletas, marketing local, finanças pessoais" value={niche} onChange={(e) => setNiche(e.target.value)} />
          )}
          {needsTopic && (
            <Input label="Tema do conteúdo" placeholder="ex.: erros ao começar na academia" value={topic} onChange={(e) => setTopic(e.target.value)} />
          )}
          {tool === "remodel" && (
            <>
              <Input label="Tema específico (opcional)" placeholder="deixe vazio para a IA escolher o ângulo" value={topic} onChange={(e) => setTopic(e.target.value)} />
              <Textarea label="Conteúdo viral de referência" rows={6} placeholder="Cole aqui a transcrição ou texto do conteúdo que viralizou…" value={reference} onChange={(e) => setReference(e.target.value)} />
            </>
          )}
          {tool === "score" && (
            <Textarea label="Seu conteúdo" rows={6} placeholder="Cole o roteiro, legenda ou texto que você quer avaliar…" value={content} onChange={(e) => setContent(e.target.value)} />
          )}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {(tool === "hooks" || tool === "score") && (
              <Select label="Plataforma (opcional)" value={network} onChange={(e) => setNetwork(e.target.value as "" | Network)} style={{ minWidth: 160 }}>
                <option value="">Qualquer</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="linkedin">LinkedIn</option>
              </Select>
            )}
            {tool === "reels_script" && (
              <Select label="Duração" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value) as 15 | 30 | 60 | 90)} style={{ minWidth: 120 }}>
                <option value={15}>15s</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
                <option value={90}>90s</option>
              </Select>
            )}
            {tool === "carousel" && (
              <Select label="Slides" value={slideCount} onChange={(e) => setSlideCount(Number(e.target.value))} style={{ minWidth: 120 }}>
                {[5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} slides</option>)}
              </Select>
            )}
            {(tool === "reels_script" || tool === "carousel") && (
              <Select label="Objetivo" value={goal} onChange={(e) => setGoal(e.target.value as ViralGoal)} style={{ minWidth: 160 }}>
                <option value="seguidores">Ganhar seguidores</option>
                <option value="engajamento">Engajamento</option>
                <option value="autoridade">Autoridade</option>
                <option value="vendas">Vendas</option>
              </Select>
            )}
            {(tool === "reels_script" || tool === "carousel" || tool === "remodel") && (
              <Select label="Tom (opcional)" value={tone} onChange={(e) => setTone(e.target.value as "" | Tone)} style={{ minWidth: 140 }}>
                <option value="">Padrão</option>
                <option value="direct">Direto</option>
                <option value="casual">Casual</option>
                <option value="playful">Leve</option>
                <option value="formal">Formal</option>
              </Select>
            )}
          </div>

          <div>
            <Button type="submit" disabled={!canSubmit} loading={pending}>
              ✨ Gerar
            </Button>
          </div>
        </form>
      </Card>

      {/* Results */}
      {tool === "hooks" && hooksRes && (
        <Card style={{ maxWidth: 720, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Ganchos gerados</h3>
          {hooksRes.hooks.map((h, i) => (
            <div key={i} style={{ padding: "10px 0", borderTop: i > 0 ? "1px solid var(--lume-border)" : "none" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>{h.text}</div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                    <Badge>{h.category}</Badge> <span style={{ marginLeft: 6 }}>{h.why}</span>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => copy(h.text)}>Copiar</Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {tool === "reels_script" && reelsRes && (
        <Card style={{ maxWidth: 720, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{reelsRes.title}</h3>
            <Button size="sm" loading={draftMut.isPending} onClick={() => draftMut.mutate(reelsAsDraft(reelsRes))}>+ Criar rascunho</Button>
          </div>
          <ResultBlock title="Gancho" text={reelsRes.hook} />
          {reelsRes.altHooks.length > 0 && <ResultBlock title="Ganchos alternativos" text={reelsRes.altHooks.map((h) => `• ${h}`).join("\n")} />}
          <ResultBlock title="Roteiro" text={reelsRes.beats.map((b) => `[${b.time}] ${b.narration}\n(visual: ${b.visual})`).join("\n\n")} />
          <ResultBlock title="CTA" text={reelsRes.cta} />
          <ResultBlock title="Legenda" text={`${reelsRes.caption}\n\n${reelsRes.hashtags.map((h) => `#${h}`).join(" ")}`} />
        </Card>
      )}

      {tool === "carousel" && carouselRes && (
        <Card style={{ maxWidth: 720, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Carrossel</h3>
            <Button size="sm" loading={draftMut.isPending} onClick={() => draftMut.mutate(carouselAsDraft(carouselRes))}>+ Criar rascunho</Button>
          </div>
          <ResultBlock title="Capa" text={`${carouselRes.coverTitle}\n${carouselRes.coverSubtitle}`} />
          {carouselRes.slides.map((s, i) => (
            <ResultBlock key={i} title={`Slide ${i + 1} — ${s.title}`} text={s.text} />
          ))}
          <ResultBlock title="Legenda" text={`${carouselRes.caption}\n\n${carouselRes.hashtags.map((h) => `#${h}`).join(" ")}`} />
        </Card>
      )}

      {tool === "remodel" && remodelRes && (
        <Card style={{ maxWidth: 720, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Conteúdo remodelado</h3>
            <Button size="sm" loading={draftMut.isPending} onClick={() => draftMut.mutate(remodelAsDraft(remodelRes))}>+ Criar rascunho</Button>
          </div>
          <ResultBlock title="Por que o original funcionou" text={remodelRes.whyItWorks} />
          <ResultBlock title="Estrutura extraída" text={remodelRes.structure} />
          <ResultBlock title="Gancho" text={remodelRes.hook} />
          <ResultBlock title="Conteúdo" text={remodelRes.body} />
          <ResultBlock title="Legenda" text={`${remodelRes.caption}\n\n${remodelRes.hashtags.map((h) => `#${h}`).join(" ")}`} />
        </Card>
      )}

      {tool === "score" && scoreRes && (
        <Card style={{ maxWidth: 720, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 42, fontWeight: 800 }}>{scoreRes.score}</div>
            <div style={{ fontSize: 13, opacity: 0.6 }}>/ 100</div>
          </div>
          <p style={{ marginTop: 0, fontSize: 14 }}>{scoreRes.verdict}</p>
          {scoreRes.breakdown.map((b, i) => (
            <div key={i} style={{ padding: "8px 0", borderTop: "1px solid var(--lume-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                <span>{b.criterion}</span><span>{b.score}/20</span>
              </div>
              <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>{b.feedback}</div>
            </div>
          ))}
          <ResultBlock title="Melhorias sugeridas" text={scoreRes.improvements.map((m) => `• ${m}`).join("\n")} />
          <ResultBlock title="Gancho melhorado" text={scoreRes.improvedHook} />
        </Card>
      )}

      {/* History */}
      <div style={{ maxWidth: 720 }}>
        <h3>Histórico</h3>
        {history.isLoading && <SkeletonRow count={3} />}
        {!history.isLoading && (history.data?.items.length ?? 0) === 0 && (
          <EmptyState icon="🚀" title="Nada gerado ainda" description="Suas gerações ficam salvas aqui para reusar depois." />
        )}
        {(history.data?.items ?? []).map((item) => (
          <Card key={item.id} padding="sm" interactive style={{ marginBottom: 8, cursor: "pointer" }} onClick={() => openHistoryItem(item)}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <Badge>{KIND_LABEL[item.kind]}</Badge>
                <span style={{ marginLeft: 8, fontSize: 13 }}>{item.niche !== "-" ? item.niche : "análise"}</span>
                <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.5 }}>{new Date(item.createdAt).toLocaleString("pt-BR")}</span>
              </div>
              <Button
                variant="ghost" size="sm"
                onClick={(e) => { e.stopPropagation(); deleteMut.mutate(item.id); }}
              >✕</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
