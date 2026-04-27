import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRow } from "../components/Skeleton";
import { Button, Input, Avatar, ConfirmDialog } from "../ui";
import { toasts } from "../ui/toast";

export function Benchmarks() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; username: string } | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["competitors"], queryFn: api.listCompetitors });

  const addMut = useMutation({
    mutationFn: (u: string) => api.addCompetitor(u),
    onSuccess: () => { setUsername(""); qc.invalidateQueries({ queryKey: ["competitors"] }); toasts.success("Conta adicionada"); },
    onError: (e: Error) => toasts.error("Falha", e.message),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => api.removeCompetitor(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["competitors"] }); toasts.success("Conta removida"); },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const u = username.trim().replace(/^@/, "");
    if (u) addMut.mutate(u);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0 }}>Benchmarks</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--lume-text-inverse)", opacity: 0.55 }}>
          Monitore contas Instagram Business — seguidores, crescimento e engajamento.
        </p>
      </div>

      {/* Add form */}
      <div style={{
        background: "var(--lume-surface)", border: "1px solid var(--lume-border)",
        borderRadius: "var(--lume-radius-lg)", padding: "var(--lume-space-4)",
        marginBottom: 24, maxWidth: 560,
      }}>
        <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Input label="Username Instagram" placeholder="sem @" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <Button type="submit" disabled={!username.trim()} loading={addMut.isPending}>
            + Adicionar
          </Button>
        </form>
      </div>

      {isLoading && <SkeletonRow count={3} />}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <EmptyState
          icon="🔎"
          title="Nenhuma conta monitorada"
          description="Adicione usernames Instagram Business para começar a comparar métricas."
        />
      )}
      {!isLoading && (data?.items ?? []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data!.items.map((c, idx) => (
            <CompetitorCard
              key={c.id}
              rank={idx + 1}
              id={c.id}
              username={c.username}
              displayName={c.displayName}
              profilePictureUrl={c.profilePictureUrl}
              onRemove={() => setConfirmRemove({ id: c.id, username: c.username })}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmRemove}
        title={`Remover @${confirmRemove?.username ?? ""}?`}
        message="O histórico de snapshots também será removido."
        danger confirmLabel="Remover"
        onConfirm={() => confirmRemove && removeMut.mutate(confirmRemove.id)}
        onClose={() => setConfirmRemove(null)}
      />
    </div>
  );
}

interface CardProps {
  rank: number;
  id: string;
  username: string;
  displayName: string | null;
  profilePictureUrl: string | null;
  onRemove: () => void;
}

function CompetitorCard({ rank, id, username, displayName, profilePictureUrl, onRemove }: CardProps) {
  const { data } = useQuery({ queryKey: ["comp-snaps", id], queryFn: () => api.competitorSnapshots(id, 30) });
  const snapshots = data?.items ?? [];
  const latest = snapshots[snapshots.length - 1];
  const first  = snapshots[0];

  const followerGrowth = latest?.followers != null && first?.followers != null && first.followers > 0
    ? latest.followers - first.followers
    : null;
  const growthPct = followerGrowth !== null && first?.followers
    ? ((followerGrowth / first.followers) * 100)
    : null;

  const hasData = latest?.followers != null;

  return (
    <div style={{
      background: "var(--lume-surface)", border: "1px solid var(--lume-border)",
      borderRadius: "var(--lume-radius-lg)", padding: "var(--lume-space-4)",
      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
    }}>
      {/* Rank */}
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: rank === 1 ? "#D97706" : rank === 2 ? "var(--lume-text-soft)" : "var(--lume-surface-soft)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 800,
        color: rank <= 2 ? "#fff" : "var(--lume-text-muted)",
      }}>
        {rank}
      </div>

      {/* Avatar + identity */}
      <Avatar src={profilePictureUrl} alt={username} size={48} fallback={username} />
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--lume-text)" }}>
          {displayName ?? `@${username}`}
        </div>
        <div style={{ fontSize: 12, color: "var(--lume-text-muted)", marginTop: 2 }}>@{username}</div>
      </div>

      {/* Followers */}
      <div style={{ textAlign: "right", minWidth: 100 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--lume-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
          Seguidores
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--lume-text)", letterSpacing: "-0.5px", lineHeight: 1 }}>
          {hasData ? latest!.followers!.toLocaleString("pt-BR") : "—"}
        </div>
        {followerGrowth !== null && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 3, marginTop: 4,
            fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
            background: followerGrowth >= 0 ? "var(--lume-success-bg)" : "var(--lume-danger-bg)",
            color: followerGrowth >= 0 ? "var(--lume-success)" : "var(--lume-danger)",
          }}>
            {followerGrowth >= 0 ? "↑" : "↓"} {Math.abs(followerGrowth).toLocaleString("pt-BR")}
            {growthPct !== null && ` (${Math.abs(growthPct).toFixed(1)}%)`}
          </div>
        )}
      </div>

      {/* Engagement */}
      <div style={{ textAlign: "right", minWidth: 110 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--lume-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
          Eng. médio
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--lume-text)", lineHeight: 1 }}>
          {latest?.recentAvgLikes != null ? `${Math.round(latest.recentAvgLikes).toLocaleString("pt-BR")}` : "—"}
        </div>
        <div style={{ fontSize: 11, color: "var(--lume-text-muted)", marginTop: 2 }}>
          {latest?.recentAvgLikes != null ? "curtidas/post" : ""}
        </div>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--lume-text-soft)", fontSize: 18, padding: "4px 6px", lineHeight: 1, flexShrink: 0 }}
        aria-label="Remover"
      >×</button>
    </div>
  );
}
