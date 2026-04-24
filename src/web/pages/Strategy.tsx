import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { NETWORKS } from "../lib/networks";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRow } from "../components/Skeleton";
import { Button, Input, Card, Badge, ConfirmDialog } from "../ui";
import { toasts } from "../ui/toast";

const DAY_LABELS: Record<string, string> = { seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado", dom: "Domingo" };
const DAY_ORDER = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

export function Strategy() {
  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1>Estratégia</h1>
        <p style={{ color: "var(--lume-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
          Defina pilares de conteúdo, adicione contas inspiracionais, e deixe a IA propor agenda semanal.
        </p>
      </header>
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
  const [color, setColor] = useState("#E85D1F");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => api.createPillar({ title, description: description || null, color, position: (data?.items.length ?? 0) }),
    onSuccess: () => { setTitle(""); setDescription(""); qc.invalidateQueries({ queryKey: ["pillars"] }); toasts.success("Pilar criado"); },
    onError: () => toasts.error("Falha ao criar pilar"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.deletePillar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pillars"] }); toasts.success("Pilar removido"); },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    createMut.mutate();
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Pilares de conteúdo</h2>

      <Card padding="md" style={{ marginBottom: 16, maxWidth: 720 }}>
        <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Input
              label="Título"
              placeholder="Ex: Bastidores"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div style={{ flex: 2, minWidth: 220 }}>
            <Input
              label="Descrição (opcional)"
              placeholder="O tema em uma frase"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label>Cor</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 52, height: 40, padding: 2 }} />
          </div>
          <Button type="submit" disabled={!title.trim()} loading={createMut.isPending}>+ Adicionar</Button>
        </form>
      </Card>

      {isLoading && <SkeletonRow count={2} />}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <EmptyState icon="🧭" title="Nenhum pilar ainda" description="Adicione 3-5 pilares de conteúdo pra guiar a IA." />
      )}
      {!isLoading && (data?.items ?? []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data!.items.map((p) => (
            <Card key={p.id} padding="sm" style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 6, alignSelf: "stretch", background: p.color ?? "var(--lume-primary)", borderRadius: 3 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{p.title}</div>
                {p.description && <div style={{ fontSize: 13, color: "var(--lume-text-muted)" }}>{p.description}</div>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setConfirmId(p.id)}>Remover</Button>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmId}
        title="Remover pilar?"
        message="O histórico das agendas geradas permanece, mas novas agendas não usarão este pilar."
        danger
        confirmLabel="Remover"
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    addMut.mutate();
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Radar de inspiração (Instagram)</h2>

      <Card padding="md" style={{ marginBottom: 16, maxWidth: 720 }}>
        <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Input label="Username" placeholder="sem @" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div style={{ flex: 2, minWidth: 220 }}>
            <Input label="Nota (opcional)" placeholder="Por que te inspira?" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={!username.trim()} loading={addMut.isPending}>+ Adicionar</Button>
        </form>
      </Card>

      {isLoading && <SkeletonRow count={2} />}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <EmptyState icon="🔭" title="Radar vazio" description="Adicione contas Instagram inspiracionais pra alimentar a IA." />
      )}
      {!isLoading && (data?.items ?? []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data!.items.map((s) => (
            <Card key={s.id} padding="sm" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Badge color={NETWORKS[s.network as keyof typeof NETWORKS]?.color ?? "#666"} variant="solid">
                {s.network.slice(0, 3).toUpperCase()}
              </Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>@{s.username}</div>
                {s.note && <div style={{ fontSize: 13, color: "var(--lume-text-muted)" }}>{s.note}</div>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => delMut.mutate(s.id)}>Remover</Button>
            </Card>
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
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Agenda semanal (IA)</h2>

      <Card padding="md" style={{ marginBottom: 16, maxWidth: 720 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input label="Tema opcional" placeholder="Ex: Lançamento Q2" value={theme} onChange={(e) => setTheme(e.target.value)} />
          </div>
          <Button onClick={() => genMut.mutate()} loading={genMut.isPending}>
            ✨ Gerar plano
          </Button>
        </div>
      </Card>

      {(list?.items.length ?? 0) > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {list!.items.map((s) => (
            <Button
              key={s.id}
              variant={s.id === currentId ? "primary" : "secondary"}
              size="sm"
              onClick={() => setSelectedId(s.id)}
            >
              {s.weekStart} {s.status === "approved" && "✓"}
            </Button>
          ))}
        </div>
      )}

      {listLoading && <SkeletonRow count={3} />}
      {!listLoading && !currentId && (
        <EmptyState icon="🗓️" title="Nenhum plano ainda" description="Clique em 'Gerar plano' acima." />
      )}

      {current && (
        <Card padding="lg">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Semana de {current.weekStart}</div>
              {current.theme && <div style={{ fontSize: 13, color: "var(--lume-text-muted)", marginTop: 2 }}>Tema: {current.theme}</div>}
              {current.rationale && <div style={{ fontSize: 13, color: "var(--lume-text-muted)", marginTop: 8, fontStyle: "italic", maxWidth: 600 }}>{current.rationale}</div>}
            </div>
            {current.status === "approved" ? (
              <Badge color="#15803D" variant="soft">✓ Aprovado</Badge>
            ) : (
              <Button onClick={() => setConfirmApprove(true)} loading={approveMut.isPending}>Aprovar todos</Button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {DAY_ORDER.map((day) => {
              const dayPosts = current.posts.map((p, i) => ({ ...p, index: i })).filter((p) => p.day === day);
              if (dayPosts.length === 0) return null;
              return (
                <div key={day}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--lume-text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.04 }}>
                    {DAY_LABELS[day] ?? day}
                  </div>
                  {dayPosts.map((p) => (
                    <div
                      key={p.index}
                      style={{
                        background: "var(--lume-surface-soft)",
                        border: "1px solid var(--lume-border)",
                        borderRadius: "var(--lume-radius-md)",
                        padding: 12,
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "var(--lume-text-muted)" }}>{p.time}</span>
                        <Badge color={NETWORKS[p.network as keyof typeof NETWORKS]?.color ?? "#666"} variant="solid">
                          {p.network.slice(0, 3).toUpperCase()}
                        </Badge>
                        <span style={{ fontSize: 12, color: "var(--lume-text-muted)" }}>{p.format}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--lume-text)" }}>{p.hook}</div>
                      <div style={{ fontSize: 13, color: "var(--lume-text-muted)", whiteSpace: "pre-wrap", marginTop: 4 }}>{p.body}</div>
                      {p.mediaSuggestion && (
                        <div style={{ fontSize: 12, color: "var(--lume-text-soft)", marginTop: 6, fontStyle: "italic" }}>📸 {p.mediaSuggestion}</div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {current?.status === "approved" && (
        <p style={{ marginTop: 12, fontSize: 13, color: "var(--lume-text-muted)" }}>
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
