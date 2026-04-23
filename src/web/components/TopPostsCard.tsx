import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NETWORKS } from "../lib/networks";
import { Link } from "react-router-dom";

function bodyExcerpt(b: string, n = 100) {
  const t = b.replace(/\s+/g, " ").trim();
  if (!t) return "(sem copy)";
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export function TopPostsCard() {
  const [by, setBy] = useState<"likes" | "engagement_rate">("likes");
  const { data } = useQuery({ queryKey: ["top-posts", by], queryFn: () => api.topPosts(by, 10) });

  return (
    <div style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 12, padding: 16, marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Top Posts</h3>
        <select
          value={by}
          onChange={(e) => setBy(e.target.value as "likes" | "engagement_rate")}
          style={{ padding: 4, background: "#0d0d12", color: "#eee", border: "1px solid #2a2a36", borderRadius: 4, fontSize: 12 }}
        >
          <option value="likes">Por curtidas+coment.</option>
          <option value="engagement_rate">Por taxa de engajamento</option>
        </select>
      </div>
      {(data?.items.length ?? 0) === 0 && <p style={{ color: "#888", fontSize: 13 }}>Nenhum post publicado ainda.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(data?.items ?? []).map((p, i) => (
          <div key={p.postId} style={{ display: "flex", gap: 12, alignItems: "center", padding: 8, background: "#0d0d12", borderRadius: 6 }}>
            <span style={{ fontSize: 12, color: "#888", minWidth: 20 }}>#{i + 1}</span>
            <span
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                background: NETWORKS[p.network as keyof typeof NETWORKS]?.color ?? "#666",
                color: "white",
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {p.network.slice(0, 3).toUpperCase()}
            </span>
            <Link to={`/posts/${p.postId}`} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, color: "#eee" }}>
              {bodyExcerpt(p.body)}
            </Link>
            <div style={{ fontSize: 11, color: "#aaa", flexShrink: 0 }}>
              {p.likes ?? 0} curt. · {p.comments ?? 0} com.
              {p.reach ? ` · ${p.reach} reach` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
