import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NETWORKS } from "../lib/networks";
import { PendingManualCard } from "../components/PendingManualCard";
import { SkeletonRow } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { Button, Badge, ConfirmDialog } from "../ui";
import { toasts } from "../ui/toast";
import type { PostListItem, Network } from "../../shared/types";

function formatDate(ms: number) {
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function bodyExcerpt(body: string, n = 90) {
  const t = body.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t || "(sem copy)";
}

function PendingManualSection() {
  const { data } = useQuery({ queryKey: ["pending-manual"], queryFn: api.listPendingManual });
  if (!data?.items.length) return null;
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Pendentes manuais</h2>
        <Badge color="var(--lume-warning)" variant="soft">{data.items.length}</Badge>
      </div>
      <p style={{ color: "var(--lume-text-muted)", fontSize: 13, margin: "0 0 16px" }}>
        Esses posts chegaram na hora agendada. Copia, publica manualmente no app da rede, e marca como publicado.
      </p>
      {data.items.map((item) => (
        <PendingManualCard key={item.targetId} item={item} />
      ))}
    </section>
  );
}

export function PostsList() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["posts"], queryFn: api.listPosts });

  const createMutation = useMutation({
    mutationFn: () => api.createPost({ body: "", networks: [] }),
    onSuccess: (post) => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      nav(`/posts/${post.id}`);
    },
    onError: () => toasts.error("Falha ao criar post"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deletePost(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      toasts.success("Post excluído");
    },
    onError: () => toasts.error("Falha ao excluir"),
  });

  const items = data?.items ?? [];

  return (
    <div>
      <PendingManualSection />

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1>Posts</h1>
          <p style={{ color: "var(--lume-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
            {items.length} {items.length === 1 ? "post" : "posts"} no seu acervo.
          </p>
        </div>
        <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
          + Novo post
        </Button>
      </header>

      {isLoading && <SkeletonRow count={5} />}

      {!isLoading && items.length === 0 && (
        <EmptyState
          icon="📝"
          title="Nenhum post ainda"
          description="Comece criando seu primeiro post. Você pode salvar como rascunho, agendar pra qualquer rede, ou publicar na hora."
          action={
            <Button onClick={() => createMutation.mutate()} size="lg">
              Criar primeiro post
            </Button>
          }
        />
      )}

      {!isLoading && items.length > 0 && (
        <div className="lume-card lume-table-scroll" style={{ padding: 0 }}>
          <table className="lume-table">
            <thead>
              <tr>
                <th style={{ width: 72 }}></th>
                <th>Copy</th>
                <th style={{ width: 180 }}>Redes</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 160 }}>Atualizado</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p: PostListItem) => (
                <tr key={p.id}>
                  <td>
                    {p.mediaThumb ? (
                      <img src={p.mediaThumb} className="thumb" alt="" />
                    ) : (
                      <div className="thumb" aria-hidden />
                    )}
                  </td>
                  <td>
                    <Link to={`/posts/${p.id}`} style={{ color: "var(--lume-text)", fontWeight: 500, textDecoration: "none" }}>
                      {bodyExcerpt(p.body)}
                    </Link>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {p.networks.map((n: Network) => (
                        <Badge key={n} color={NETWORKS[n].color} variant="solid">
                          {NETWORKS[n].label}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`lume-badge status-${p.status}`}>{p.status}</span>
                  </td>
                  <td style={{ color: "var(--lume-text-muted)", fontSize: 13 }}>{formatDate(p.updatedAt)}</td>
                  <td>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmId(p.id)}>
                      Excluir
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmId}
        title="Excluir esse post?"
        message="Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        danger
        onConfirm={() => confirmId && deleteMutation.mutate(confirmId)}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}
