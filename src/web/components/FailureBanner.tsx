import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NETWORKS } from "../lib/networks";

function bodyExcerpt(body: string, n = 60): string {
  const t = body.replace(/\s+/g, " ").trim();
  if (!t) return "(sem copy)";
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export function FailureBanner() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["failures"],
    queryFn: api.listFailures,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const retry = useMutation({
    mutationFn: ({ postId, network }: { postId: string; network: string }) =>
      api.retryTarget(postId, network),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["failures"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <>
      <div className="failure-banner" onClick={() => setOpen((s) => !s)}>
        <span>⚠️ {items.length} {items.length === 1 ? "publicação falhou" : "publicações falharam"}</span>
        <span style={{ fontSize: 12, opacity: 0.8 }}>{open ? "Fechar" : "Ver detalhes"}</span>
      </div>
      {open && (
        <div className="failure-panel">
          {items.map((it) => (
            <div key={`${it.postId}-${it.network}`} className="failure-row">
              <div className="failure-row-info">
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span
                    className="failure-net-badge"
                    style={{ background: NETWORKS[it.network as keyof typeof NETWORKS]?.color ?? "#666" }}
                  >
                    {NETWORKS[it.network as keyof typeof NETWORKS]?.label ?? it.network}
                  </span>
                  <span style={{ fontSize: 12, color: "#888" }}>
                    {it.attempts} tentativa{it.attempts === 1 ? "" : "s"}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#eee", marginBottom: 4 }}>
                  {bodyExcerpt(it.postBody)}
                </div>
                {it.lastError && (
                  <div style={{ fontSize: 11, color: "#ff9d9d", fontFamily: "monospace" }}>
                    {it.lastError}
                  </div>
                )}
              </div>
              <div className="failure-row-actions">
                <Link to={`/posts/${it.postId}`} className="btn-secondary" style={{ textDecoration: "none", fontSize: 12, padding: "4px 8px" }}>
                  Abrir
                </Link>
                <button
                  className="btn-primary"
                  style={{ fontSize: 12, padding: "4px 8px" }}
                  onClick={() => retry.mutate({ postId: it.postId, network: it.network })}
                  disabled={retry.isPending}
                >
                  Tentar de novo
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
