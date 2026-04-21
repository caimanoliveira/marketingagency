import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { MediaUploader } from "../components/MediaUploader";
import type { Media } from "../../shared/types";

export function MediaPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["media"], queryFn: api.listMedia });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteMedia(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });

  return (
    <div>
      <h1>Biblioteca de mídia</h1>
      <MediaUploader />
      <div style={{ marginTop: 24 }}>
        {(data?.items.length ?? 0) === 0 && <p style={{ color: "#888" }}>Nenhuma mídia ainda.</p>}
        <div className="media-grid">
          {(data?.items ?? []).map((m: Media) => (
            <div key={m.id} className="media-tile">
              {m.mimeType.startsWith("image/") ? (
                <img src={m.url} alt={m.originalName} />
              ) : (
                <video src={m.url} controls />
              )}
              <div className="meta">
                <span>{m.originalName}</span>
                <button
                  className="btn-danger"
                  style={{ padding: "2px 6px", fontSize: 11 }}
                  onClick={() => {
                    if (confirm("Deletar essa mídia?")) deleteMut.mutate(m.id);
                  }}
                >
                  X
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
