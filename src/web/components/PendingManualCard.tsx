import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Item {
  postId: string;
  targetId: string;
  network: string;
  body: string;
  mediaUrl: string | null;
  mediaMime: string | null;
  scheduledAt: number | null;
}

interface Props { item: Item; }

export function PendingManualCard({ item }: Props) {
  const qc = useQueryClient();
  const [externalUrl, setExternalUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const mark = useMutation({
    mutationFn: () => api.markPublished(item.postId, item.network, externalUrl || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-manual"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  async function copyCopy() {
    await navigator.clipboard.writeText(item.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ textTransform: "capitalize" }}>{item.network}</strong>
        {item.scheduledAt && (
          <span style={{ color: "#888", fontSize: 12 }}>
            agendado pra {new Date(item.scheduledAt).toLocaleString("pt-BR")}
          </span>
        )}
      </div>
      {item.mediaUrl && (
        <div style={{ marginBottom: 8 }}>
          {item.mediaMime?.startsWith("image/") ? (
            <img src={item.mediaUrl} style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 6 }} alt="" />
          ) : (
            <video src={item.mediaUrl} style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 6 }} controls />
          )}
        </div>
      )}
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, margin: "0 0 12px" }}>{item.body}</pre>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn-secondary" onClick={copyCopy}>
          {copied ? "Copiado!" : "Copiar copy"}
        </button>
        {item.mediaUrl && (
          <a className="btn-secondary" href={item.mediaUrl} download style={{ textDecoration: "none" }}>
            Baixar mídia
          </a>
        )}
        <input
          type="url"
          placeholder="URL do post publicado (opcional)"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: 6, background: "#0d0d12", color: "#eee", border: "1px solid #2a2a36", borderRadius: 6, fontSize: 13 }}
        />
        <button className="btn-primary" onClick={() => mark.mutate()} disabled={mark.isPending}>
          {mark.isPending ? "Salvando..." : "Marcar como publicado"}
        </button>
      </div>
    </div>
  );
}
