import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

function chip(label: string, pct: number | null) {
  if (pct === null) return null;
  const color = pct >= 0 ? "#7ecf8a" : "#ff6b6b";
  const sign = pct >= 0 ? "+" : "";
  return (
    <span style={{ fontSize: 11, color, marginLeft: 6 }}>
      {sign}{pct.toFixed(0)}% vs sem. passada
    </span>
  );
}

export function WoWChips({ field }: { field: "reach" | "engagement" | "posts" }) {
  const { data } = useQuery({ queryKey: ["wow"], queryFn: api.wow });
  if (!data) return null;
  const pct =
    field === "reach" ? data.delta.totalReachPct :
    field === "engagement" ? data.delta.totalEngagementPct :
    data.delta.postsPublishedPct;
  return chip(field, pct);
}
