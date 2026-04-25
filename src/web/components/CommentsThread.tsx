import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Props {
  postId: string;
}

export function CommentsThread({ postId }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["comments", postId],
    queryFn: () => api.listPostComments(postId),
  });
  const addMut = useMutation({
    mutationFn: (body: string) => api.addPostComment(postId, body),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["comments", postId] });
    },
  });

  const items = data?.items ?? [];
  if (isLoading) return null;

  const reviewerComments = items.filter((c) => c.authorLabel.startsWith("reviewer"));

  return (
    <section style={{ marginTop: 24, background: "#0d0d12", border: "1px solid #1f1f28", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>Comentários</h3>
        {reviewerComments.length > 0 && (
          <span style={{ fontSize: 11, color: "#cfcfff" }}>{reviewerComments.length} do revisor</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {items.length === 0 && <p style={{ fontSize: 12, color: "#888", margin: 0 }}>Nenhum comentário ainda.</p>}
        {items.map((c) => {
          const isReviewer = c.authorLabel.startsWith("reviewer");
          const accent = c.authorLabel.includes("approved") ? "#7ecf8a" : c.authorLabel.includes("rejected") ? "#ff6b6b" : "#aaa";
          return (
            <div key={c.id} style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: accent, marginBottom: 4 }}>
                {isReviewer ? c.authorLabel : "Você"} · {new Date(c.createdAt).toLocaleString("pt-BR")}
              </div>
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{c.body}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Adicionar nota interna..."
          style={{ flex: 1, padding: "6px 10px", background: "#111118", border: "1px solid #2a2a36", borderRadius: 6, color: "#e0e0e0", fontSize: 13 }}
        />
        <button
          className="btn-secondary"
          onClick={() => draft.trim() && addMut.mutate(draft.trim())}
          disabled={!draft.trim() || addMut.isPending}
        >
          {addMut.isPending ? "..." : "Enviar"}
        </button>
      </div>
    </section>
  );
}
