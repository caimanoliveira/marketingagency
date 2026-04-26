import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { MediaUploader } from "../components/MediaUploader";
import { EmptyState } from "../components/EmptyState";
import { Button, ConfirmDialog } from "../ui";
import { toasts } from "../ui/toast";
import type { Media } from "../../shared/types";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPage() {
  const qc = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["media"], queryFn: api.listMedia });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteMedia(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["media"] }); toasts.success("Mídia excluída"); },
    onError: () => toasts.error("Falha ao excluir mídia"),
  });

  const items: Media[] = data?.items ?? [];
  const confirmItem = items.find((m) => m.id === confirmId);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 4px" }}>Biblioteca de mídia</h1>
        <p style={{ color: "var(--lume-text-muted)", fontSize: 14, margin: 0 }}>
          {items.length > 0 ? `${items.length} arquivo${items.length !== 1 ? "s" : ""}` : "Nenhum arquivo ainda"}
        </p>
      </div>

      <div className="lume-card" style={{ padding: 20, marginBottom: 24 }}>
        <MediaUploader />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="🖼️"
          title="Biblioteca vazia"
          description="Arraste uma imagem ou vídeo no uploader acima pra começar."
        />
      ) : (
        <div className="media-grid">
          {items.map((m) => (
            <div key={m.id} className="media-tile">
              {m.mimeType.startsWith("image/") ? (
                <img src={m.url} alt={m.originalName} />
              ) : (
                <video src={m.url} controls />
              )}
              <div className="meta">
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.originalName}
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmId(m.id)}
                  aria-label={`Excluir ${m.originalName}`}
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        title="Excluir mídia?"
        message={confirmItem ? `"${confirmItem.originalName}" será removido permanentemente.` : "Este arquivo será removido permanentemente."}
        confirmLabel="Excluir"
        danger
        onConfirm={() => { if (confirmId) deleteMut.mutate(confirmId); }}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}
