import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRow } from "../components/Skeleton";
import { Button, Input, Card, Avatar, ConfirmDialog } from "../ui";
import { toasts } from "../ui/toast";

export function Benchmarks() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; username: string } | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["competitors"], queryFn: api.listCompetitors });

  const addMut = useMutation({
    mutationFn: (u: string) => api.addCompetitor(u),
    onSuccess: () => { setUsername(""); qc.invalidateQueries({ queryKey: ["competitors"] }); toasts.success("Concorrente adicionado"); },
    onError: (e: Error) => toasts.error("Falha", e.message),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => api.removeCompetitor(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["competitors"] }); toasts.success("Concorrente removido"); },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const u = username.trim().replace(/^@/, "");
    if (!u) return;
    addMut.mutate(u);
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1>Benchmarks</h1>
        <p style={{ color: "var(--lume-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
          Acompanhe contas Instagram Business — followers, crescimento e engajamento médio.
        </p>
      </header>

      <Card padding="md" style={{ marginBottom: 16, maxWidth: 640 }}>
        <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Input label="Username Instagram" placeholder="sem @" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <Button type="submit" disabled={!username.trim()} loading={addMut.isPending}>
            + Adicionar
          </Button>
        </form>
      </Card>

      {isLoading && <SkeletonRow count={3} />}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <EmptyState
          icon="🔎"
          title="Nenhum concorrente ainda"
          description="Adicione usernames Instagram pra começar a monitorar."
        />
      )}
      {!isLoading && (data?.items.length ?? 0) > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data!.items.map((c) => (
            <CompetitorRow
              key={c.id}
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
        danger
        confirmLabel="Remover"
        onConfirm={() => confirmRemove && removeMut.mutate(confirmRemove.id)}
        onClose={() => setConfirmRemove(null)}
      />
    </div>
  );
}

interface RowProps {
  id: string;
  username: string;
  displayName: string | null;
  profilePictureUrl: string | null;
  onRemove: () => void;
}

function CompetitorRow({ id, username, displayName, profilePictureUrl, onRemove }: RowProps) {
  const { data } = useQuery({ queryKey: ["comp-snaps", id], queryFn: () => api.competitorSnapshots(id, 30) });
  const snapshots = data?.items ?? [];
  const latest = snapshots[snapshots.length - 1];
  const first = snapshots[0];
  const followerGrowth = latest?.followers != null && first?.followers != null ? latest.followers - first.followers : null;

  return (
    <Card padding="md" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <Avatar src={profilePictureUrl} alt={username} size={52} fallback={username} />
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{displayName ?? `@${username}`}</div>
        <div style={{ fontSize: 13, color: "var(--lume-text-muted)" }}>@{username}</div>
      </div>
      <div style={{ textAlign: "right", minWidth: 110 }}>
        <div style={{ fontSize: 11, color: "var(--lume-text-muted)" }}>Followers</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          {latest?.followers != null ? latest.followers.toLocaleString("pt-BR") : "—"}
        </div>
        {followerGrowth !== null && (
          <div style={{ fontSize: 11, color: followerGrowth >= 0 ? "var(--lume-success)" : "var(--lume-danger)", fontWeight: 500 }}>
            {followerGrowth >= 0 ? "+" : ""}{followerGrowth.toLocaleString("pt-BR")} em 30d
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", minWidth: 110 }}>
        <div style={{ fontSize: 11, color: "var(--lume-text-muted)" }}>Engajam. médio</div>
        <div style={{ fontSize: 14 }}>
          {latest?.recentAvgLikes != null ? `${Math.round(latest.recentAvgLikes)} curt.` : "—"}
        </div>
        <div style={{ fontSize: 11, color: "var(--lume-text-muted)" }}>
          {latest?.recentAvgComments != null ? `${Math.round(latest.recentAvgComments)} coment.` : ""}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onRemove}>Remover</Button>
    </Card>
  );
}
