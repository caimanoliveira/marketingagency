import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { NETWORKS } from "../lib/networks";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRow } from "../components/Skeleton";

const DAY_LABELS: Record<string, string> = { seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado", dom: "Domingo" };
const DAY_ORDER = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

export function Strategy() {
  return (
    <div>
      <h1>Estratégia</h1>
      <p style={{ color: "#888", fontSize: 13 }}>
        Defina seus pilares de conteúdo, adicione contas inspiracionais, e deixe a IA propor a agenda semanal.
      </p>
      <PillarPerformanceStrip />
      <AudienceStrip />
      <PillarsSection />
      <SourcesSection />
      <WeeklyPlanSection />
    </div>
  );
}

function AudienceStrip() {
  const qc = useQueryClient();
  const { data: sent } = useQuery({ queryKey: ["sentiment-summary"], queryFn: () => api.sentimentSummary(30) });
  const { data: top } = useQuery({ queryKey: ["top-engagers"], queryFn: () => api.topEngagers(30, 5) });
  const classifyMut = useMutation({
    mutationFn: () => api.classifyComments(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["sentiment-summary"] });
      qc.invalidateQueries({ queryKey: ["top-engagers"] });
      alert(`${r.classified}/${r.attempted} comentários classificados.`);
    },
  });

  const s = sent?.summary;
  const total = (s?.positive ?? 0) + (s?.neutral ?? 0) + (s?.negative ?? 0);
  if (!s || (total === 0 && (s.unclassified ?? 0) === 0)) return null;
  const pct = (n: number) => total === 0 ? "—" : `${Math.round((n / total) * 100)}%`;

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Audiência <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>(últimos 30 dias)</span></h2>
        <button className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => classifyMut.mutate()} disabled={classifyMut.isPending}>
          {classifyMut.isPending ? "Classificando..." : "Classificar pendentes"}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <div style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Sentimento ({total} comentários)</div>
          <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
            <span style={{ color: "#7ecf8a" }}>{pct(s.positive)} pos</span>
            <span style={{ color: "#aaa" }}>{pct(s.neutral)} neu</span>
            <span style={{ color: "#ff6b6b" }}>{pct(s.negative)} neg</span>
          </div>
          {s.unclassified > 0 && (
            <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>{s.unclassified} sem classificação</div>
          )}
        </div>
        <div style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Top engajadores</div>
          {(top?.items ?? []).length === 0 && <div style={{ fontSize: 12, color: "#888" }}>—</div>}
          {(top?.items ?? []).slice(0, 5).map((e) => (
            <div key={`${e.handle}-${e.network}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
              <span>@{e.handle} <span style={{ color: "#888" }}>· {e.network}</span></span>
              <span style={{ color: "#ccc" }}>{e.commentCount} <span style={{ color: "#7ecf8a" }}>+{e.positiveCount}</span> <span style={{ color: "#ff6b6b" }}>-{e.negativeCount}</span></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PillarPerformanceStrip() {
  const qc = useQueryClient();
  const [networkTab, setNetworkTab] = useState<"all" | "linkedin" | "instagram" | "tiktok">("all");
  const { data, isLoading } = useQuery({
    queryKey: ["pillar-performance", 30],
    queryFn: () => api.pillarPerformance(30),
  });

  const backfillMut = useMutation({
    mutationFn: () => api.backfillPillars(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["pillar-performance", 30] });
      qc.invalidateQueries({ queryKey: ["posts"] });
      alert(`${r.classified}/${r.attempted} posts classificados (${r.skipped} sem match).`);
    },
    onError: (e: Error) => alert("Falhou: " + e.message),
  });

  if (isLoading) return null;
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const hasAnyEngagement = items.some((i) => i.avgEngagementRate !== null && i.avgEngagementRate > 0);
  const projected = items.map((p) => {
    if (networkTab === "all") {
      return { ...p, displayEngagement: p.avgEngagementRate, displayPostCount: p.postCount };
    }
    const slice = (p.byNetwork ?? []).find((b) => b.network === networkTab);
    return { ...p, displayEngagement: slice?.avgEngagementRate ?? null, displayPostCount: slice?.postCount ?? 0 };
  });
  const sorted = [...projected].sort((a, b) => (b.displayEngagement ?? -1) - (a.displayEngagement ?? -1));

  return (
    <section style={{ marginTop: 20, marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Pillar ROI <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>(últimos 30 dias)</span></h2>
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "linkedin", "instagram", "tiktok"] as const).map((tab) => (
            <button
              key={tab}
              className={networkTab === tab ? "btn-primary" : "btn-secondary"}
              style={{ fontSize: 10, padding: "2px 8px" }}
              onClick={() => setNetworkTab(tab)}
            >
              {tab === "all" ? "Todas" : tab.slice(0, 3).toUpperCase()}
            </button>
          ))}
          <button
            className="btn-secondary"
            style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={() => backfillMut.mutate()}
            disabled={backfillMut.isPending}
            title="Usa Claude Haiku pra classificar posts antigos sem pilar"
          >
            {backfillMut.isPending ? "Classificando..." : "Classificar posts antigos"}
          </button>
        </div>
      </div>
      {!hasAnyEngagement && (
        <p style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
          Aprove posts da IA ou classifique posts antigos pra começar a ver performance por pilar.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {sorted.map((p) => (
          <div key={p.pillarId} style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 20, background: p.color ?? "#6e56cf", borderRadius: 2 }} />
              <div style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#eee" }}>
              {p.displayEngagement === null ? "—" : `${(p.displayEngagement * 100).toFixed(1)}%`}
            </div>
            <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#888" }}>
              <span>{p.displayPostCount} post{p.displayPostCount === 1 ? "" : "s"}</span>
              {networkTab === "all" && <><span>·</span><span>{p.totalReach.toLocaleString("pt-BR")} alcance</span></>}
            </div>
            {p.weekly.length > 0 && <Sparkline points={p.weekly} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function Sparkline({ points }: { points: Array<{ weekStart: string; avgEngagementRate: number | null; postCount: number }> }) {
  const values = points.map((p) => p.avgEngagementRate ?? 0);
  if (values.length === 0) return null;
  const max = Math.max(...values, 0.0001);
  const w = 100;
  const h = 24;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ opacity: 0.8 }}>
      <path d={path} fill="none" stroke="#6e56cf" strokeWidth={1.5} />
    </svg>
  );
}

function PillarsSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["pillars"], queryFn: api.listPillars });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6e56cf");

  const createMut = useMutation({
    mutationFn: () => api.createPillar({ title, description: description || null, color, position: (data?.items.length ?? 0) }),
    onSuccess: () => {
      setTitle(""); setDescription("");
      qc.invalidateQueries({ queryKey: ["pillars"] });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.deletePillar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pillars"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    createMut.mutate();
  }

  return (
    <section style={{ marginTop: 24, marginBottom: 32 }}>
      <h2 style={{ fontSize: 16 }}>Pilares de conteúdo</h2>
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginBottom: 12, maxWidth: 640 }}>
        <input
          placeholder="Título (ex: Bastidores)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: 1, padding: 8, background: "#111118", color: "#eee", border: "1px solid #2a2a36", borderRadius: 6, fontSize: 13 }}
        />
        <input
          placeholder="Descrição curta (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ flex: 2, padding: 8, background: "#111118", color: "#eee", border: "1px solid #2a2a36", borderRadius: 6, fontSize: 13 }}
        />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 40, height: 36, padding: 0, background: "transparent", border: "1px solid #2a2a36", borderRadius: 6 }} />
        <button className="btn-primary" disabled={!title.trim() || createMut.isPending}>+ Adicionar</button>
      </form>

      {isLoading && <SkeletonRow count={2} />}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <EmptyState icon="🧭" title="Nenhum pilar ainda" description="Adicione 3-5 pilares de conteúdo pra guiar a IA." />
      )}
      {!isLoading && (data?.items ?? []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data!.items.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: 10, background: "#111118", border: "1px solid #1f1f28", borderRadius: 8 }}>
              <div style={{ width: 8, height: 36, background: p.color ?? "#6e56cf", borderRadius: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.title}</div>
                {p.description && <div style={{ fontSize: 12, color: "#888" }}>{p.description}</div>}
              </div>
              <button className="btn-danger" onClick={() => { if (confirm(`Remover pilar "${p.title}"?`)) delMut.mutate(p.id); }} style={{ fontSize: 11, padding: "4px 8px" }}>
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SourcesSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["sources"], queryFn: api.listSources });
  const [username, setUsername] = useState("");
  const [note, setNote] = useState("");

  const addMut = useMutation({
    mutationFn: () => api.addSource({ network: "instagram", username: username.trim().replace(/^@/, ""), note: note || null }),
    onSuccess: () => {
      setUsername(""); setNote("");
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: (e: Error) => alert("Falhou: " + e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.removeSource(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    addMut.mutate();
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16 }}>Radar de inspiração (Instagram)</h2>
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginBottom: 12, maxWidth: 640 }}>
        <input
          placeholder="username (sem @)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ flex: 1, padding: 8, background: "#111118", color: "#eee", border: "1px solid #2a2a36", borderRadius: 6, fontSize: 13 }}
        />
        <input
          placeholder="Nota (opcional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ flex: 2, padding: 8, background: "#111118", color: "#eee", border: "1px solid #2a2a36", borderRadius: 6, fontSize: 13 }}
        />
        <button className="btn-primary" disabled={!username.trim() || addMut.isPending}>+ Adicionar</button>
      </form>

      {isLoading && <SkeletonRow count={2} />}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <EmptyState icon="🔭" title="Radar vazio" description="Adicione contas Instagram inspiracionais pra alimentar a IA." />
      )}
      {!isLoading && (data?.items ?? []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data!.items.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: 10, background: "#111118", border: "1px solid #1f1f28", borderRadius: 8 }}>
              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: NETWORKS[s.network as keyof typeof NETWORKS]?.color ?? "#666", color: "white" }}>
                {s.network.slice(0, 3).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>@{s.username}</div>
                {s.note && <div style={{ fontSize: 12, color: "#888" }}>{s.note}</div>}
              </div>
              <button className="btn-danger" onClick={() => delMut.mutate(s.id)} style={{ fontSize: 11, padding: "4px 8px" }}>
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WeeklyPlanSection() {
  const qc = useQueryClient();
  const { data: list, isLoading: listLoading } = useQuery({ queryKey: ["weekly-suggestions"], queryFn: () => api.listWeeklySuggestions(5) });
  const [theme, setTheme] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const genMut = useMutation({
    mutationFn: () => api.generateWeeklyPlan({ theme: theme.trim() || undefined }),
    onSuccess: (s) => {
      setTheme("");
      setSelectedId(s.id);
      qc.invalidateQueries({ queryKey: ["weekly-suggestions"] });
    },
    onError: (e: Error) => alert("Falhou: " + e.message),
  });

  const currentId = selectedId ?? list?.items[0]?.id ?? null;

  const { data: current } = useQuery({
    queryKey: ["weekly-suggestion", currentId],
    queryFn: () => api.getWeeklySuggestion(currentId!),
    enabled: !!currentId,
  });

  const approveMut = useMutation({
    mutationFn: (acceptIndices?: number[]) => api.approveWeeklySuggestion(currentId!, acceptIndices),
    onSuccess: (r) => {
      alert(`${r.createdPostIds.length} drafts criados! Veja em Posts.`);
      qc.invalidateQueries({ queryKey: ["weekly-suggestion", currentId] });
      qc.invalidateQueries({ queryKey: ["weekly-suggestions"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  return (
    <section>
      <h2 style={{ fontSize: 16 }}>Agenda semanal (IA)</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, maxWidth: 640 }}>
        <input
          placeholder="Tema opcional (ex: Lançamento Q2)"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          style={{ flex: 1, padding: 8, background: "#111118", color: "#eee", border: "1px solid #2a2a36", borderRadius: 6, fontSize: 13 }}
        />
        <button className="btn-primary" onClick={() => genMut.mutate()} disabled={genMut.isPending}>
          {genMut.isPending ? "Gerando..." : "✨ Gerar plano"}
        </button>
      </div>

      {(list?.items.length ?? 0) > 1 && (
        <div style={{ marginBottom: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {list!.items.map((s) => (
            <button
              key={s.id}
              className={s.id === currentId ? "btn-primary" : "btn-secondary"}
              style={{ fontSize: 11, padding: "4px 10px" }}
              onClick={() => setSelectedId(s.id)}
            >
              {s.weekStart} {s.status === "approved" && "✓"}
            </button>
          ))}
        </div>
      )}

      {listLoading && <SkeletonRow count={3} />}
      {!listLoading && !currentId && (
        <EmptyState icon="🗓️" title="Nenhum plano ainda" description="Clique em 'Gerar plano' acima." />
      )}

      {current && (
        <div style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Semana de {current.weekStart}</div>
              {current.theme && <div style={{ fontSize: 13, color: "#aaa" }}>Tema: {current.theme}</div>}
              {current.rationale && <div style={{ fontSize: 12, color: "#888", marginTop: 6, fontStyle: "italic" }}>{current.rationale}</div>}
            </div>
            {current.status === "approved" ? (
              <span style={{ fontSize: 12, color: "#7ecf8a" }}>✓ Aprovado</span>
            ) : (
              <button className="btn-primary" onClick={() => { if (confirm(`Aprovar todos os ${current.posts.length} posts?`)) approveMut.mutate(undefined); }} disabled={approveMut.isPending}>
                {approveMut.isPending ? "Aprovando..." : "Aprovar todos"}
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {DAY_ORDER.map((day) => {
              const dayPosts = current.posts
                .map((p, i) => ({ ...p, index: i }))
                .filter((p) => p.day === day);
              if (dayPosts.length === 0) return null;
              return (
                <div key={day}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#aaa", marginBottom: 4 }}>
                    {DAY_LABELS[day] ?? day}
                  </div>
                  {dayPosts.map((p) => (
                    <div key={p.index} style={{ background: "#0d0d12", border: "1px solid #1f1f28", borderRadius: 8, padding: 12, marginBottom: 6 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: "#aaa" }}>{p.time}</span>
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: NETWORKS[p.network as keyof typeof NETWORKS]?.color ?? "#666", color: "white", fontWeight: 600 }}>
                          {p.network.slice(0, 3).toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: "#888" }}>{p.format}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#eee" }}>{p.hook}</div>
                      <div style={{ fontSize: 12, color: "#ccc", whiteSpace: "pre-wrap", marginTop: 4 }}>{p.body}</div>
                      {p.mediaSuggestion && (
                        <div style={{ fontSize: 11, color: "#888", marginTop: 6, fontStyle: "italic" }}>📸 {p.mediaSuggestion}</div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {current?.status === "approved" && (
        <p style={{ marginTop: 12, fontSize: 12, color: "#888" }}>
          Posts drafts criados. <Link to="/posts" style={{ color: "#6e56cf" }}>Ver em Posts →</Link>
        </p>
      )}
    </section>
  );
}
