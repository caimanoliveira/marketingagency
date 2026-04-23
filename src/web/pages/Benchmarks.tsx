import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { EmptyState } from "../components/EmptyState";
import { SkeletonRow } from "../components/Skeleton";

export function Benchmarks() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["competitors"], queryFn: api.listCompetitors });

  const addMut = useMutation({
    mutationFn: (u: string) => api.addCompetitor(u),
    onSuccess: () => {
      setUsername("");
      qc.invalidateQueries({ queryKey: ["competitors"] });
    },
    onError: (e: Error) => {
      alert("Falhou: " + e.message);
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => api.removeCompetitor(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitors"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const u = username.trim().replace(/^@/, "");
    if (!u) return;
    addMut.mutate(u);
  }

  return (
    <div>
      <h1>Benchmarks (Instagram)</h1>
      <p style={{ color: "#888", fontSize: 13 }}>
        Adicione contas Instagram Business pra acompanhar followers, crescimento e engajamento médio.
        Requer conexão Instagram em Configurações.
      </p>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, margin: "16px 0", maxWidth: 480 }}>
        <input
          type="text"
          placeholder="username (sem @)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ flex: 1, padding: 8, background: "#111118", color: "#eee", border: "1px solid #2a2a36", borderRadius: 6, fontSize: 13 }}
        />
        <button className="btn-primary" disabled={addMut.isPending || !username.trim()}>
          {addMut.isPending ? "Adicionando..." : "+ Adicionar"}
        </button>
      </form>

      {isLoading && <SkeletonRow count={3} />}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <EmptyState
          icon="🔎"
          title="Nenhum concorrente ainda"
          description="Adicione usernames do Instagram acima pra começar a monitorar."
        />
      )}

      {!isLoading && (data?.items.length ?? 0) > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data!.items.map((c) => (
            <CompetitorRow key={c.id} id={c.id} username={c.username} displayName={c.displayName} profilePictureUrl={c.profilePictureUrl} onRemove={() => { if (confirm(`Remover @${c.username}?`)) removeMut.mutate(c.id); }} />
          ))}
        </div>
      )}
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

  const followerGrowth =
    latest?.followers != null && first?.followers != null ? latest.followers - first.followers : null;

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", background: "#111118", border: "1px solid #1f1f28", borderRadius: 10, padding: 12 }}>
      {profilePictureUrl ? (
        <img src={profilePictureUrl} alt="" style={{ width: 48, height: 48, borderRadius: 24, flexShrink: 0 }} />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: 24, background: "#1a1a24", flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{displayName ?? `@${username}`}</div>
        <div style={{ fontSize: 12, color: "#888" }}>@{username}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 11, color: "#888" }}>Followers</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          {latest?.followers != null ? latest.followers.toLocaleString("pt-BR") : "—"}
        </div>
        {followerGrowth !== null && (
          <div style={{ fontSize: 11, color: followerGrowth >= 0 ? "#7ecf8a" : "#ff6b6b" }}>
            {followerGrowth >= 0 ? "+" : ""}{followerGrowth.toLocaleString("pt-BR")} em 30d
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", minWidth: 100 }}>
        <div style={{ fontSize: 11, color: "#888" }}>Engajam. médio</div>
        <div style={{ fontSize: 13 }}>
          {latest?.recentAvgLikes != null ? `${Math.round(latest.recentAvgLikes)} curt.` : "—"}
        </div>
        <div style={{ fontSize: 11, color: "#888" }}>
          {latest?.recentAvgComments != null ? `${Math.round(latest.recentAvgComments)} coment.` : ""}
        </div>
      </div>
      <button className="btn-danger" onClick={onRemove} style={{ fontSize: 11, padding: "4px 8px" }}>
        Remover
      </button>
    </div>
  );
}
