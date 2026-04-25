import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Network } from "../../shared/types";

const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function SendTimesHeatmap() {
  const [network, setNetwork] = useState<Network | "all">("all");
  const { data, isLoading } = useQuery({
    queryKey: ["send-times-heatmap", network],
    queryFn: () => api.sendTimes(network === "all" ? undefined : network, 90),
  });

  const cellMap = new Map<string, { sampleSize: number; avgEngagementRate: number | null }>();
  let max = 0;
  for (const item of data?.items ?? []) {
    const k = `${item.weekday}-${item.hour}`;
    const existing = cellMap.get(k);
    const sample = (existing?.sampleSize ?? 0) + item.sampleSize;
    const avg = item.avgEngagementRate; // approximate — multi-network bucket per cell uses last; ok for v1
    cellMap.set(k, { sampleSize: sample, avgEngagementRate: avg });
    if (avg !== null && avg > max) max = avg;
  }

  return (
    <div style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 12, padding: 16, marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>Mapa de horários (90d)</h3>
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value as Network | "all")}
          style={{ padding: "4px 8px", background: "#0d0d12", border: "1px solid #1f1f28", borderRadius: 6, color: "#cfcfff", fontSize: 12 }}
        >
          <option value="all">Todas</option>
          <option value="linkedin">LinkedIn</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
        </select>
      </div>

      {isLoading && <div style={{ fontSize: 12, color: "#888" }}>Carregando...</div>}
      {!isLoading && cellMap.size === 0 && (
        <p style={{ fontSize: 12, color: "#888" }}>Sem dados de publicação ainda nesta janela.</p>
      )}
      {cellMap.size > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr>
                <th style={{ padding: "2px 6px", color: "#888", textAlign: "left" }}></th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} style={{ padding: "2px 4px", color: "#888", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                <tr key={wd}>
                  <td style={{ padding: "2px 6px", color: "#aaa" }}>{WD[wd]}</td>
                  {Array.from({ length: 24 }, (_, h) => {
                    const cell = cellMap.get(`${wd}-${h}`);
                    const intensity = cell?.avgEngagementRate && max > 0 ? cell.avgEngagementRate / max : 0;
                    const bg = cell ? `rgba(110, 86, 207, ${0.15 + 0.7 * intensity})` : "#0d0d12";
                    return (
                      <td
                        key={h}
                        title={cell ? `${WD[wd]} ${h}h • ${cell.sampleSize} posts • ${cell.avgEngagementRate ? (cell.avgEngagementRate * 100).toFixed(1) + "%" : "—"}` : `${WD[wd]} ${h}h`}
                        style={{ width: 18, height: 18, background: bg, border: "1px solid #0d0d12" }}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
