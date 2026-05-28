import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NETWORKS } from "../lib/networks";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRow } from "../components/Skeleton";
import { Button, Input, Textarea, Select, Badge, ConfirmDialog } from "../ui";
import { toasts } from "../ui/toast";
import type { Hook, HookType, Network } from "../../shared/types";

const HOOK_TYPES: Array<{ value: HookType; label: string; color: string }> = [
  { value: "swap", label: "SWAP", color: "#D97706" },
  { value: "build", label: "BUILD", color: "#2563EB" },
  { value: "claim", label: "CLAIM", color: "#7C3AED" },
  { value: "list", label: "LIST", color: "#059669" },
  { value: "contrarian", label: "CONTRARIAN", color: "#DC2626" },
  { value: "story", label: "STORY", color: "#0891B2" },
  { value: "other", label: "OUTRO", color: "#6B7280" },
];

function typeMeta(t: HookType | null) {
  return HOOK_TYPES.find((h) => h.value === t) ?? null;
}

function formatViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function HookVault() {
  const qc = useQueryClient();
  const nav = useNavigate();

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<HookType | "">("");
  const [winnersOnly, setWinnersOnly] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Hook | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["hooks", q, typeFilter, winnersOnly],
    queryFn: () => api.listHooks({ q: q.trim() || undefined, type: typeFilter, winner: winnersOnly }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => api.deleteHook(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hooks"] }); toasts.success("Hook removido"); },
  });

  const useMut = useMutation({
    mutationFn: async (hook: Hook) => {
      const post = await api.createPost({ body: hook.template, networks: [], hookId: hook.id });
      await api.useHook(hook.id).catch(() => {});
      return post;
    },
    onSuccess: (post) => {
      qc.invalidateQueries({ queryKey: ["hooks"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
      nav(`/posts/${post.id}`);
    },
    onError: (e: Error) => toasts.error("Falha ao usar hook", e.message),
  });

  const items = data?.items ?? [];

  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Cofre de Hooks</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--lume-text-muted)" }}>
            Sua biblioteca de hooks templatizados. Salve, filtre e jogue direto num post novo.
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Fechar" : "+ Novo hook"}
        </Button>
      </header>

      {showForm && <AddHookForm onCreated={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["hooks"] }); }} />}

      {/* Search + type filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        <Input
          placeholder="Buscar por texto, nicho ou criador…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <FilterChip active={winnersOnly} onClick={() => setWinnersOnly((w) => !w)} label="🏆 Vencedores" color="#059669" />
          <FilterChip active={typeFilter === "" && !winnersOnly} onClick={() => { setTypeFilter(""); setWinnersOnly(false); }} label="Todos" color="var(--lume-text-muted)" />
          {HOOK_TYPES.map((t) => (
            <FilterChip
              key={t.value}
              active={typeFilter === t.value}
              onClick={() => setTypeFilter(typeFilter === t.value ? "" : t.value)}
              label={t.label}
              color={t.color}
            />
          ))}
        </div>
      </div>

      {isLoading && <SkeletonRow count={3} />}

      {!isLoading && items.length === 0 && (
        <EmptyState
          icon="🪝"
          title={q || typeFilter ? "Nenhum hook encontrado" : "Nenhum hook salvo ainda"}
          description={q || typeFilter
            ? "Tente ajustar a busca ou o filtro de tipo."
            : "Salve hooks que funcionam — '[X] just killed [Y]', 'Pare de fazer [X]', '[N] coisas que eu queria saber'. Depois é só reaproveitar."}
          action={!q && !typeFilter ? <Button onClick={() => setShowForm(true)}>Salvar primeiro hook</Button> : undefined}
        />
      )}

      {!isLoading && items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((h) => (
            <HookCard
              key={h.id}
              hook={h}
              onUse={() => useMut.mutate(h)}
              useLoading={useMut.isPending}
              onRemove={() => setConfirmRemove(h)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remover esse hook?"
        message="Essa ação não pode ser desfeita."
        danger
        confirmLabel="Remover"
        onConfirm={() => confirmRemove && removeMut.mutate(confirmRemove.id)}
        onClose={() => setConfirmRemove(null)}
      />
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

function HookCard({ hook, onUse, useLoading, onRemove }: { hook: Hook; onUse: () => void; useLoading: boolean; onRemove: () => void }) {
  const meta = typeMeta(hook.hookType);
  const net = hook.network ? NETWORKS[hook.network] : null;

  function copy() {
    navigator.clipboard.writeText(hook.template).then(
      () => toasts.success("Copiado"),
      () => toasts.error("Não foi possível copiar"),
    );
  }

  return (
    <div style={{
      background: "var(--lume-surface)", border: "1px solid var(--lume-border)",
      borderRadius: "var(--lume-radius-lg)", padding: "var(--lume-space-4)",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <p style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: "var(--lume-text)", lineHeight: 1.4 }}>
          {hook.template}
        </p>
        <button
          onClick={onRemove}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--lume-text-soft)", fontSize: 18, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
          aria-label="Remover"
        >×</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {hook.isWinner && <Badge color="#059669" variant="soft">🏆 VENCEDOR</Badge>}
        {meta && <Badge color={meta.color} variant="soft">{meta.label}</Badge>}
        {net && <Badge color={net.color} variant="soft">{net.label}</Badge>}
        {hook.niche && <Badge>#{hook.niche}</Badge>}
        {hook.sourceHandle && (
          <span style={{ fontSize: 12, color: "var(--lume-text-muted)" }}>@{hook.sourceHandle}</span>
        )}
        {hook.viewCount != null && (
          <span style={{ fontSize: 12, color: "var(--lume-text-muted)" }}>👁 {formatViews(hook.viewCount)}</span>
        )}
        {hook.useCount > 0 && (
          <span style={{ fontSize: 12, color: "var(--lume-text-muted)" }}>↺ usado {hook.useCount}×</span>
        )}
        {hook.postsPublished > 0 && (
          <span style={{ fontSize: 12, color: "var(--lume-text-muted)" }}>
            📈 {hook.postsPublished} {hook.postsPublished === 1 ? "post" : "posts"} · {formatViews(hook.avgEngagement)} eng médio
          </span>
        )}
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={copy}>Copiar</Button>
        <Button size="sm" loading={useLoading} onClick={onUse}>Usar este hook →</Button>
      </div>
    </div>
  );
}

function AddHookForm({ onCreated }: { onCreated: () => void }) {
  const [template, setTemplate] = useState("");
  const [hookType, setHookType] = useState<HookType | "">("");
  const [network, setNetwork] = useState<Network | "">("");
  const [niche, setNiche] = useState("");
  const [sourceHandle, setSourceHandle] = useState("");
  const [viewCount, setViewCount] = useState("");

  const createMut = useMutation({
    mutationFn: () => api.createHook({
      template: template.trim(),
      hookType: hookType || null,
      network: network || null,
      niche: niche.trim() || null,
      sourceHandle: sourceHandle.trim() || null,
      viewCount: viewCount.trim() ? parseInt(viewCount.trim(), 10) : null,
    }),
    onSuccess: () => {
      toasts.success("Hook salvo");
      onCreated();
    },
    onError: (e: Error) => toasts.error("Falha ao salvar", e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (template.trim().length < 3) return;
    createMut.mutate();
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        background: "var(--lume-surface)", border: "1px solid var(--lume-border)",
        borderRadius: "var(--lume-radius-lg)", padding: "var(--lume-space-4)",
        marginBottom: 24, display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <Textarea
        label="Hook (use [PLACEHOLDERS] pra templatizar)"
        placeholder="Ex.: Pare de fazer [X]. Comece a fazer [Y]."
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        style={{ minHeight: 80 }}
      />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px" }}>
          <Select label="Tipo" value={hookType} onChange={(e) => setHookType(e.target.value as HookType | "")}>
            <option value="">—</option>
            {HOOK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <Select label="Rede" value={network} onChange={(e) => setNetwork(e.target.value as Network | "")}>
            <option value="">—</option>
            {(Object.keys(NETWORKS) as Network[]).map((n) => <option key={n} value={n}>{NETWORKS[n].label}</option>)}
          </Select>
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <Input label="Nicho" placeholder="ex.: fitness" value={niche} onChange={(e) => setNiche(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <Input label="Criador" placeholder="@handle" value={sourceHandle} onChange={(e) => setSourceHandle(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <Input label="Views" type="number" placeholder="ex.: 187000" value={viewCount} onChange={(e) => setViewCount(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button type="submit" disabled={template.trim().length < 3} loading={createMut.isPending}>Salvar hook</Button>
      </div>
    </form>
  );
}
