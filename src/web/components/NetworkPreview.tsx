import { useState } from "react";
import { NETWORKS } from "../lib/networks";
import { CharCounter } from "./CharCounter";
import type { Network, Media } from "../../shared/types";

interface Props {
  network: Network;
  baseBody: string;
  override: string | null;
  media: Media | null;
  onOverrideChange: (text: string | null) => void;
}

export function NetworkPreview({ network, baseBody, override, media, onOverrideChange }: Props) {
  const cfg = NETWORKS[network];
  const [editing, setEditing] = useState(override !== null);
  const effective = override ?? baseBody;

  return (
    <div className="network-preview">
      <header>
        <span className="tag" style={{ background: cfg.color }}>{cfg.label}</span>
        <button
          className="btn-secondary"
          style={{ fontSize: 11, padding: "2px 6px", marginLeft: "auto" }}
          onClick={() => {
            if (editing) {
              onOverrideChange(null);
              setEditing(false);
            } else {
              onOverrideChange(baseBody);
              setEditing(true);
            }
          }}
        >
          {editing ? "Usar base" : "Customizar"}
        </button>
      </header>

      {media ? (
        media.mimeType.startsWith("image/") ? (
          <img src={media.url} className="preview-media" alt="" />
        ) : (
          <video src={media.url} className="preview-media" controls />
        )
      ) : (
        <div className="preview-media" style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
          (sem mídia)
        </div>
      )}

      {editing ? (
        <>
          <textarea
            value={override ?? ""}
            onChange={(e) => onOverrideChange(e.target.value)}
            style={{ width: "100%", marginTop: 8, background: "#0d0d12", color: "#eee", border: "1px solid #2a2a36", borderRadius: 6, padding: 8, fontSize: 13 }}
            rows={4}
          />
          <CharCounter value={override ?? ""} limit={cfg.charLimit} />
        </>
      ) : (
        <>
          <div className="preview-body">{effective || <span style={{ color: "#555" }}>(sem copy)</span>}</div>
          <CharCounter value={effective} limit={cfg.charLimit} />
        </>
      )}
    </div>
  );
}
