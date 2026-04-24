import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NETWORKS } from "../lib/networks";
import { Link } from "react-router-dom";
import { Card, Badge, Select } from "../ui";

function bodyExcerpt(b: string, n = 100) {
  const t = b.replace(/\s+/g, " ").trim();
  if (!t) return "(sem copy)";
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export function TopPostsCard() {
  const [by, setBy] = useState<"likes" | "engagement_rate">("likes");
  const { data } = useQuery({ queryKey: ["top-posts", by], queryFn: () => api.topPosts(by, 10) });

  return (
    <Card padding="md" style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Top Posts</h3>
        <Select
          value={by}
          onChange={(e) => setBy(e.target.value as "likes" | "engagement_rate")}
          style={{ minWidth: 180 }}
        >
          <option value="likes">Por curtidas+coment.</option>
          <option value="engagement_rate">Por taxa de engajamento</option>
        </Select>
      </div>
      {(data?.items.length ?? 0) === 0 && (
        <p style={{ color: "var(--lume-text-muted)", fontSize: 13 }}>Nenhum post publicado ainda.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(data?.items ?? []).map((p, i) => (
          <div
            key={p.postId}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: 8,
              background: "var(--lume-surface-soft)",
              borderRadius: "var(--lume-radius-sm)",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--lume-text-muted)", minWidth: 20 }}>#{i + 1}</span>
            <Badge
              color={NETWORKS[p.network as keyof typeof NETWORKS]?.color ?? "#666"}
              variant="solid"
            >
              {p.network.slice(0, 3).toUpperCase()}
            </Badge>
            <Link
              to={`/posts/${p.postId}`}
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 13,
                color: "var(--lume-text)",
              }}
            >
              {bodyExcerpt(p.body)}
            </Link>
            <div style={{ fontSize: 11, color: "var(--lume-text-muted)", flexShrink: 0 }}>
              {p.likes ?? 0} curt. · {p.comments ?? 0} com.
              {p.reach ? ` · ${p.reach} reach` : ""}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
