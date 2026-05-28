import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRow } from "../components/Skeleton";
import { Button, Input, Badge } from "../ui";
import { toasts } from "../ui/toast";
import type { TrendItem, HookPotential } from "../../shared/types";

const POTENTIAL: Record<HookPotential, { label: string; color: string }> = {
  high: { label: "ALTO", color: "#059669" },
  medium: { label: "MÉDIO", color: "#D97706" },
  low: { label: "BAIXO", color: "#6B7280" },
};

function formatDate(ms: number | null) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function Trends() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [filter, setFilter] = useState<HookPotential | "">("");
  const [showFeeds, setShowFeeds] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["trends", filter],
    queryFn: () => api.listTrends(filter || undefined),
  });

  const refreshMut = useMutation({
    mutationFn: () => api.refreshTrends(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["trends"] });
      toasts.success(`Atualizado — ${r.fetched} itens, ${r.scored} avaliados`);
    },
    onError: (e: Error) => toasts.error("Falha ao atualizar", e.message),
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => api.dismissTrend(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trends"] }),
  });

  const saveHookMut = useMutation({
    mutationFn: (item: TrendItem) => api.createHook({ template: item.hookAngle ?? item.title }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hooks"] }); toasts.success("Salvo no Cofre de Hooks"); },
    onError: (e: Error) => toasts.error("Falha ao salvar", e.message),
  });

  const draftMut = useMutation({
    mutationFn: async (item: TrendItem) => {
      const body = item.hookAngle ? `${item.hookAngle}\n\n` : `${item.title}\n\n`;
      return api.createPost({ body, networks: [] });
    },
    onSuccess: (post) => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      nav(`/posts/${post.id}`);
    },
    onError: (e: Error) => toasts.error("Falha ao criar rascunho", e.message),
  });

  const items = data?.items ?? [];
  const lastFetched = items.reduce<number | null>((max, it) => (it.fetchedAt > (max ?? 0) ? it.fetchedAt : max), null);

  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Tendências</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--lume-text-muted)" }}>
            Notícias das suas fontes, avaliadas por potencial de hook.
            {lastFetched ? ` Atualizado ${formatDate(lastFetched)}.` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={() => setShowFeeds((s) => !s)}>Fontes</Button>
          <Button onClick={() => refreshMut.mutate()} loading={refreshMut.isPending}>↻ Atualizar</Button>
        </div>
      </header>

      {showFeeds && <FeedsManager />}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        <FilterChip active={filter === ""} onClick={() => setFilter("")} label="Todos" color="var(--lume-text-muted)" />
        {(Object.keys(POTENTIAL) as HookPotential[]).map((p) => (
          <FilterChip
            key={p}
            active={filter === p}
            onClick={() => setFilter(filter === p ? "" : p)}
            label={POTENTIAL[p].label}
            color={POTENTIAL[p].color}
          />
        ))}
      </div>

      {isLoading && <SkeletonRow count={4} />}

      {!isLoading && items.length === 0 && (
        <EmptyState
          icon="📡"
          title={filter ? "Nenhum item nesse filtro" : "Nenhuma tendência ainda"}
          description={filter
            ? "Tente outro filtro de potencial."
            : "Clique em ↻ Atualizar pra buscar as últimas notícias das suas fontes e deixar a IA avaliar o potencial de hook de cada uma."}
          action={!filter ? <Button onClick={() => refreshMut.mutate()} loading={refreshMut.isPending}>Buscar agora</Button> : undefined}
        />
      )}

      {!isLoading && items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((it) => (
            <TrendCard
              key={it.id}
              item={it}
              onSaveHook={() => saveHookMut.mutate(it)}
              onDraft={() => draftMut.mutate(it)}
              onDismiss={() => dismissMut.mutate(it.id)}
              busy={saveHookMut.isPending || draftMut.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        cursor: "pointer", border: "1px solid", borderRadius: 999, padding: "4px 12px",
        fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
        borderColor: active ? color : "var(--lume-border)",
        background: active ? `${color}22` : "transparent",
        color: active ? color : "var(--lume-text-muted)",
      }}
    >
      {label}
    </button>
  );
}

function TrendCard({ item, onSaveHook, onDraft, onDismiss, busy }: {
  item: TrendItem;
  onSaveHook: () => void;
  onDraft: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const pot = item.hookPotential ? POTENTIAL[item.hookPotential] : null;
  return (
    <div style={{
      background: "var(--lume-surface)", border: "1px solid var(--lume-border)",
      borderRadius: "var(--lume-radius-lg)", padding: "var(--lume-space-4)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <a href={item.url} target="_blank" rel="noreferrer"
           style={{ flex: 1, fontSize: 15, fontWeight: 600, color: "var(--lume-text)", textDecoration: "none", lineHeight: 1.4 }}>
          {item.title}
        </a>
        <button
          onClick={onDismiss}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--lume-text-soft)", fontSize: 18, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
          aria-label="Dispensar"
        >×</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--lume-text-muted)" }}>
        {pot && <Badge color={pot.color} variant="soft">{pot.label}</Badge>}
        {item.source && <span>{item.source}</span>}
        {item.publishedAt && <span>· {formatDate(item.publishedAt)}</span>}
      </div>

      {item.hookAngle && (
        <div style={{ fontSize: 13, color: "var(--lume-text)", background: "var(--lume-surface-soft)", borderRadius: 8, padding: "8px 10px" }}>
          💡 {item.hookAngle}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" disabled={busy} onClick={onSaveHook}>Salvar no Cofre</Button>
        <Button size="sm" disabled={busy} onClick={onDraft}>Criar rascunho →</Button>
      </div>
    </div>
  );
}

function FeedsManager() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const { data } = useQuery({ queryKey: ["trend-feeds"], queryFn: api.listTrendFeeds });

  const addMut = useMutation({
    mutationFn: (u: string) => api.addTrendFeed(u),
    onSuccess: () => { setUrl(""); qc.invalidateQueries({ queryKey: ["trend-feeds"] }); toasts.success("Fonte adicionada"); },
    onError: (e: Error) => toasts.error("Falha", e.message),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => api.removeTrendFeed(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trend-feeds"] }),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.setTrendFeedEnabled(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trend-feeds"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const u = url.trim();
    if (u) addMut.mutate(u);
  }

  const feeds = data?.items ?? [];

  return (
    <div style={{
      background: "var(--lume-surface)", border: "1px solid var(--lume-border)",
      borderRadius: "var(--lume-radius-lg)", padding: "var(--lume-space-4)", marginBottom: 24,
    }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Fontes (RSS)</div>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--lume-text-muted)" }}>
        {data?.usingDefaults
          ? `Usando ${data.defaults.length} fontes padrão (${data.defaults.map((d) => d.title).join(", ")}). Adicione as suas pra personalizar.`
          : "Suas fontes ativas são usadas na próxima atualização."}
      </p>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <Input placeholder="https://exemplo.com/feed/" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <Button type="submit" disabled={!url.trim()} loading={addMut.isPending}>+ Adicionar</Button>
      </form>

      {feeds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {feeds.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={(e) => toggleMut.mutate({ id: f.id, enabled: e.target.checked })}
              />
              <span style={{ flex: 1, color: f.enabled ? "var(--lume-text)" : "var(--lume-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.title || f.url}
              </span>
              <button
                onClick={() => removeMut.mutate(f.id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--lume-text-soft)", fontSize: 16, lineHeight: 1 }}
                aria-label="Remover"
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
