import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { NETWORKS } from "../lib/networks";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRow } from "../components/Skeleton";
import { Button, Input, Card, Badge, ConfirmDialog } from "../ui";
import { toasts } from "../ui/toast";

const DAY_LABELS: Record<string, string> = {
  seg: "Segunda", ter: "Terça", qua: "Quarta",
  qui: "Quinta",  sex: "Sexta", sab: "Sábado", dom: "Domingo",
};
const DAY_ORDER = ["seg","ter","qua","qui","sex","sab","dom"];

const SWATCH_COLORS = [
  "#FF6B35","#1E40AF","#15803D","#C2410C",
  "#7C3AED","#0369A1","#D97706","#BE185D",
];

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <h2 style={{ margin: 0, fontSize: "var(--lume-text-lg)", fontWeight: 700 }}>{title}</h2>
      {description && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--lume-text-inverse)", opacity: 0.55 }}>{description}</p>}
    </div>
  );
}

export function Strategy() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      <div>
        <h1 style={{ margin: 0 }}>Estratégia</h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--lume-text-inverse)", opacity: 0.6 }}>
          Pilares, fontes de inspiração e agenda semanal gerada por IA.
        </p>
      </div>
      <PillarsSection />
      <SourcesSection />
      <WeeklyPlanSection />
    </div>
  );
}

function PillarsSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["pillars"], queryFn: api.listPillars });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(SWATCH_COLORS[0]);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => api.createPillar({ title, description: description || null, color, position: data?.items.length ?? 0 }),
    onSuccess: () => { setTitle(""); setDescription(""); qc.invalidateQueries({ queryKey: ["pillars"] }); toasts.success("Pilar criado"); },
    onError: () => toasts.error("Falha ao criar pilar"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.deletePillar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pillars"] }); toasts.success("Pilar removido"); },
  });

  function onSubmit(e: FormEvent) { e.preventDefault(); if (title.trim()) createMut.mutate(); }

  return (
    <section>
      <SectionHeader title="Pilares de conteúdo" description="3–5 pilares guiam a IA na geração da agenda semanal." />

      <Card padding="md" style={{ marginBottom: 20 }}>
        <form onSubmit={onSubmit}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <Input label="Título" placeholder="Ex: Bastidores" value={title} onChange={e => setTitle(e.target.value)} required />
            </div>
            <div style={{ flex: 2, minWidth: 200 }}>
              <Input label="Descrição (opcional)" placeholder="O tema em uma frase" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--lume-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Cor</div>
              <div style={{ display: "flex", gap: 6 }}>
                {SWATCH_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{
                      width: 24, height: 24, borderRadius: "50%", background: c, border: "none", cursor: "pointer", padding: 0,
                      outline: color === c ? `3px solid ${c}` : "none", outlineOffset: 2,
                      boxShadow: color === c ? "0 0 0 2px var(--lume-surface)" : "none",
                    }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" disabled={!title.trim()} loading={createMut.isPending}>+ Adicionar pilar</Button>
          </div>
        </form>
      </Card>

      {isLoading && <SkeletonRow count={2} />}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <EmptyState icon="🧭" title="Nenhum pilar ainda" description="Adicione 3–5 pilares para guiar a IA." />
      )}
      {!isLoading && (data?.items ?? []).length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {data!.items.map(p => (
            <div key={p.id} style={{
              background: "var(--lume-surface)", border: "1px solid var(--lume-border)",
              borderRadius: "var(--lume-radius-md)", padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{ width: 4, alignSelf: "stretch", background: p.color ?? "var(--lume-primary)", borderRadius: 4, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--lume-text)" }}>{p.title}</div>
                {p.description && <div style={{ fontSize: 12, color: "var(--lume-text-muted)", marginTop: 2 }}>{p.description}</div>}
              </div>
              <button
                onClick={() => setConfirmId(p.id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--lume-text-soft)", fontSize: 14, padding: 4, lineHeight: 1, flexShrink: 0 }}
                aria-label="Remover"
              >×</button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmId}
        title="Remover pilar?"
        message="O histórico das agendas geradas permanece, mas novas agendas não usarão este pilar."
        danger confirmLabel="Remover"
        onConfirm={() => confirmId && delMut.mutate(confirmId)}
        onClose={() => setConfirmId(null)}
      />
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
    onSuccess: () => { setUsername(""); setNote(""); qc.invalidateQueries({ queryKey: ["sources"] }); toasts.success("Fonte adicionada"); },
    onError: (e: Error) => toasts.error("Falha", e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.removeSource(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sources"] }); toasts.success("Fonte removida"); },
  });

  function onSubmit(e: FormEvent) { e.preventDefault(); if (username.trim()) addMut.mutate(); }

  return (
    <section>
      <SectionHeader title="Radar de inspiração" description="Contas Instagram que a IA monitora para gerar contexto." />

      <Card padding="md" style={{ marginBottom: 20 }}>
        <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Input label="@username" placeholder="sem @" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <Input label="Nota (opcional)" placeholder="Por que te inspira?" value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={!username.trim()} loading={addMut.isPending}>+ Adicionar</Button>
        </form>
      </Card>

      {isLoading && <SkeletonRow count={1} />}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <EmptyState icon="🔭" title="Radar vazio" description="Adicione contas inspiracionais para alimentar a IA." />
      )}
      {!isLoading && (data?.items ?? []).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data!.items.map(s => (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--lume-surface)", border: "1px solid var(--lume-border)",
              borderRadius: "var(--lume-radius-full)", padding: "6px 14px",
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: NETWORKS[s.network as keyof typeof NETWORKS]?.color ?? "#666", textTransform: "uppercase" }}>
                {s.network.slice(0,2)}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--lume-text)" }}>@{s.username}</span>
              {s.note && <span style={{ fontSize: 12, color: "var(--lume-text-muted)" }}>· {s.note}</span>}
              <button
                onClick={() => delMut.mutate(s.id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--lume-text-soft)", fontSize: 14, padding: 0, lineHeight: 1, marginLeft: 2 }}
                aria-label="Remover"
              >×</button>
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
  const [confirmApprove, setConfirmApprove] = useState(false);

  const genMut = useMutation({
    mutationFn: () => api.generateWeeklyPlan({ theme: theme.trim() || undefined }),
    onSuccess: (s) => { setTheme(""); setSelectedId(s.id); qc.invalidateQueries({ queryKey: ["weekly-suggestions"] }); toasts.success("Plano gerado"); },
    onError: (e: Error) => toasts.error("Falha ao gerar", e.message),
  });

  const currentId = selectedId ?? list?.items[0]?.id ?? null;
  const { data: current } = useQuery({
    queryKey: ["weekly-suggestion", currentId],
    queryFn: () => api.getWeeklySuggestion(currentId!),
    enabled: !!currentId,
  });

  const approveMut = useMutation({
    mutationFn: () => api.approveWeeklySuggestion(currentId!),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["weekly-suggestion", currentId] });
      qc.invalidateQueries({ queryKey: ["weekly-suggestions"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
      toasts.success(`${r.createdPostIds.length} drafts criados`);
    },
    onError: () => toasts.error("Falha ao aprovar"),
  });

  return (
    <section>
      <SectionHeader title="Agenda semanal" description="A IA propõe uma semana de posts baseada nos seus pilares e radar." />

      <Card padding="md" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input label="Tema opcional" placeholder="Ex: Lançamento Q2, Black Friday…" value={theme} onChange={e => setTheme(e.target.value)} />
          </div>
          <Button onClick={() => genMut.mutate()} loading={genMut.isPending}>✨ Gerar plano</Button>
        </div>
      </Card>

      {(list?.items.length ?? 0) > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {list!.items.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{
                border: "1px solid", borderRadius: "var(--lume-radius-full)",
                padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: s.id === currentId ? "var(--lume-primary)" : "rgba(255,255,255,0.06)",
                borderColor: s.id === currentId ? "var(--lume-primary)" : "rgba(255,255,255,0.15)",
                color: s.id === currentId ? "#fff" : "rgba(255,255,255,0.7)",
              }}
            >
              {s.weekStart} {s.status === "approved" && "✓"}
            </button>
          ))}
        </div>
      )}

      {listLoading && <SkeletonRow count={3} />}
      {!listLoading && !currentId && (
        <EmptyState icon="🗓️" title="Nenhum plano ainda" description="Clique em '✨ Gerar plano' acima para criar uma agenda semanal." />
      )}

      {current && (
        <Card padding="lg">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: "var(--lume-text)", letterSpacing: "-0.3px" }}>
                Semana de {current.weekStart}
              </div>
              {current.theme && <div style={{ fontSize: 13, color: "var(--lume-text-muted)", marginTop: 4 }}>Tema: {current.theme}</div>}
              {current.rationale && (
                <div style={{ fontSize: 13, color: "var(--lume-text-muted)", marginTop: 8, fontStyle: "italic", maxWidth: 540, lineHeight: 1.5 }}>
                  {current.rationale}
                </div>
              )}
            </div>
            {current.status === "approved" ? (
              <span style={{ background: "var(--lume-success-bg)", color: "var(--lume-success)", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: "var(--lume-radius-sm)" }}>
                ✓ Aprovado
              </span>
            ) : (
              <Button onClick={() => setConfirmApprove(true)} loading={approveMut.isPending}>
                Aprovar {current.posts.length} posts
              </Button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {DAY_ORDER.map(day => {
              const dayPosts = current.posts.map((p, i) => ({ ...p, index: i })).filter(p => p.day === day);
              if (dayPosts.length === 0) return null;
              return (
                <div key={day}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: "var(--lume-text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <div style={{ width: 3, height: 14, background: "var(--lume-primary)", borderRadius: 2 }} />
                    {DAY_LABELS[day] ?? day}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {dayPosts.map(p => (
                      <div key={p.index} style={{
                        background: "var(--lume-surface-soft)", border: "1px solid var(--lume-border)",
                        borderRadius: "var(--lume-radius-md)", padding: "12px 14px",
                      }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: "var(--lume-text-muted)", fontWeight: 500 }}>{p.time}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: "var(--lume-radius-sm)",
                            background: NETWORKS[p.network as keyof typeof NETWORKS]?.color ?? "#666",
                            color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px",
                          }}>
                            {p.network.slice(0,3)}
                          </span>
                          {p.format && <span style={{ fontSize: 11, color: "var(--lume-text-soft)", fontStyle: "italic" }}>{p.format}</span>}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--lume-text)", marginBottom: 4 }}>{p.hook}</div>
                        <div style={{ fontSize: 13, color: "var(--lume-text-muted)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{p.body}</div>
                        {p.mediaSuggestion && (
                          <div style={{ fontSize: 11, color: "var(--lume-text-soft)", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
                            <span>📸</span> <span style={{ fontStyle: "italic" }}>{p.mediaSuggestion}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {current?.status === "approved" && (
        <p style={{ marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
          Posts drafts criados. <Link to="/posts" style={{ color: "var(--lume-primary)" }}>Ver em Posts →</Link>
        </p>
      )}

      <ConfirmDialog
        open={confirmApprove}
        title={`Aprovar ${current?.posts.length ?? 0} posts?`}
        message="Cada post sugerido vira um draft com horário agendado. Você pode editar antes de publicar."
        confirmLabel="Aprovar e criar drafts"
        onConfirm={() => approveMut.mutate()}
        onClose={() => setConfirmApprove(false)}
      />
    </section>
  );
}
