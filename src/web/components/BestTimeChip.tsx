import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Network } from "../../shared/types";

const WD_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function nextOccurrenceMs(weekday: number, hour: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  let delta = (weekday - now.getDay() + 7) % 7;
  if (delta === 0 && target.getTime() <= now.getTime()) delta = 7;
  target.setDate(now.getDate() + delta);
  return target.getTime();
}

interface Props {
  network: Network;
  onPick: (ms: number) => void;
}

export function BestTimeChip({ network, onPick }: Props) {
  const { data } = useQuery({
    queryKey: ["send-times", network],
    queryFn: () => api.sendTimes(network, 30),
  });

  const items = (data?.items ?? [])
    .filter((b) => b.sampleSize >= 3 && b.avgEngagementRate !== null)
    .sort((a, b) => (b.avgEngagementRate ?? 0) - (a.avgEngagementRate ?? 0))
    .slice(0, 3);

  if (items.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      <span style={{ fontSize: 10, color: "#888" }}>Melhores horários:</span>
      {items.map((b, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(nextOccurrenceMs(b.weekday, b.hour))}
          style={{ fontSize: 10, padding: "2px 6px", background: "#1a1a24", border: "1px solid #2a2a36", borderRadius: 4, color: "#cfcfff", cursor: "pointer" }}
          title={`${b.sampleSize} posts, ${(b.avgEngagementRate! * 100).toFixed(1)}% eng`}
        >
          {WD_LABEL[b.weekday]} {String(b.hour).padStart(2, "0")}h
        </button>
      ))}
    </div>
  );
}
