import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Media } from "../../shared/types";

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function MediaPicker({ selectedId, onSelect }: Props) {
  const { data } = useQuery({ queryKey: ["media"], queryFn: api.listMedia });
  const items = data?.items ?? [];

  return (
    <div className="media-grid">
      <div
        className={`media-tile ${selectedId === null ? "selected" : ""}`}
        onClick={() => onSelect(null)}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: "1/1", color: "#888" }}
      >
        Sem mídia
      </div>
      {items.map((m: Media) => (
        <div
          key={m.id}
          className={`media-tile ${selectedId === m.id ? "selected" : ""}`}
          onClick={() => onSelect(m.id)}
        >
          {m.mimeType.startsWith("image/") ? (
            <img src={m.url} alt={m.originalName} />
          ) : (
            <video src={m.url} muted />
          )}
          <div className="meta">
            <span>{m.mimeType.split("/")[0]}</span>
            <span>{(m.sizeBytes / 1024 / 1024).toFixed(1)}MB</span>
          </div>
        </div>
      ))}
    </div>
  );
}
