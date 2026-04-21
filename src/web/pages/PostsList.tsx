import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NETWORKS } from "../lib/networks";
import type { PostListItem, Network } from "../../shared/types";

function formatDate(ms: number) {
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bodyExcerpt(body: string, n = 80) {
  const t = body.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t || "(sem copy)";
}

export function PostsList() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: api.listPosts,
  });

  const createMutation = useMutation({
    mutationFn: () => api.createPost({ body: "", networks: [] }),
    onSuccess: (post) => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      nav(`/posts/${post.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deletePost(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1>Posts</h1>
        <button className="btn-primary" onClick={() => createMutation.mutate()}>
          + Novo post
        </button>
      </div>

      {isLoading && <p>Carregando...</p>}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <p style={{ color: "#888" }}>Nenhum post ainda. Clique em "+ Novo post" pra começar.</p>
      )}

      {(data?.items ?? []).length > 0 && (
        <table className="posts-table">
          <thead>
            <tr>
              <th style={{ width: 72 }}></th>
              <th>Copy</th>
              <th style={{ width: 160 }}>Redes</th>
              <th style={{ width: 100 }}>Status</th>
              <th style={{ width: 160 }}>Atualizado</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {data!.items.map((p: PostListItem) => (
              <tr key={p.id}>
                <td>
                  {p.mediaThumb ? (
                    <img src={p.mediaThumb} className="thumb" alt="" />
                  ) : (
                    <div className="thumb" />
                  )}
                </td>
                <td>
                  <Link to={`/posts/${p.id}`} style={{ color: "#eee" }}>
                    {bodyExcerpt(p.body)}
                  </Link>
                </td>
                <td>
                  {p.networks.map((n: Network) => (
                    <span
                      key={n}
                      style={{
                        background: NETWORKS[n].color,
                        color: "white",
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        marginRight: 4,
                      }}
                    >
                      {NETWORKS[n].label}
                    </span>
                  ))}
                </td>
                <td>
                  <span className={`status-${p.status}`}>{p.status}</span>
                </td>
                <td style={{ color: "#888", fontSize: 12 }}>{formatDate(p.updatedAt)}</td>
                <td>
                  <button
                    className="btn-danger"
                    onClick={() => {
                      if (confirm("Deletar esse post?")) deleteMutation.mutate(p.id);
                    }}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
