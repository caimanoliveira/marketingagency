import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";

interface ReviewView {
  postId: string;
  body: string;
  pillarTitle: string | null;
  networks: string[];
  expired: boolean;
  alreadyDecided: boolean;
  decision: "approved" | "rejected" | null;
}

export function Review() {
  const { token } = useParams<{ token: string }>();
  const [comment, setComment] = useState("");
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["review", token],
    queryFn: async (): Promise<ReviewView> => {
      const res = await fetch(`/api/review/${token}`);
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const decisionMut = useMutation({
    mutationFn: async (decision: "approved" | "rejected") => {
      const res = await fetch(`/api/review/${token}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, comment: comment || undefined }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return decision;
    },
    onSuccess: (decision) => setDone(decision),
  });

  if (isLoading) return <div style={{ padding: 40, color: "#aaa" }}>Carregando...</div>;
  if (error) return <div style={{ padding: 40, color: "#ff6b6b" }}>Link inválido ou expirado.</div>;
  if (!data) return null;

  const finalDecision = done ?? data.decision;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d12", color: "#e0e0e0", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Aprovação de post</h1>
        <p style={{ color: "#888", fontSize: 13, marginBottom: 24 }}>
          Você foi convidado a revisar um post antes da publicação.
        </p>

        {data.pillarTitle && (
          <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>Pilar: {data.pillarTitle}</div>
        )}
        <div style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
            Redes: {data.networks.join(", ")}
          </div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5 }}>{data.body}</div>
        </div>

        {finalDecision ? (
          <div style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 14, color: finalDecision === "approved" ? "#7ecf8a" : "#ff6b6b" }}>
              {finalDecision === "approved" ? "✓ Aprovado" : "✗ Rejeitado"}
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Decisão registrada. Você pode fechar essa janela.</div>
          </div>
        ) : data.expired ? (
          <div style={{ color: "#ff6b6b" }}>Link expirado.</div>
        ) : (
          <>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentário opcional (visível ao autor)"
              style={{ width: "100%", minHeight: 80, padding: 10, background: "#111118", border: "1px solid #1f1f28", borderRadius: 8, color: "#e0e0e0", fontSize: 13, fontFamily: "inherit", marginBottom: 12 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => decisionMut.mutate("approved")}
                disabled={decisionMut.isPending}
                style={{ flex: 1, padding: "10px 16px", background: "#2a8a3a", border: "none", borderRadius: 8, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                {decisionMut.isPending ? "Aprovando..." : "✓ Aprovar"}
              </button>
              <button
                onClick={() => decisionMut.mutate("rejected")}
                disabled={decisionMut.isPending}
                style={{ flex: 1, padding: "10px 16px", background: "#8a2a2a", border: "none", borderRadius: 8, color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                ✗ Rejeitar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
