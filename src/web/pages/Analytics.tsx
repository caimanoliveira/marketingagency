import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { api } from "../lib/api";
import { NETWORKS } from "../lib/networks";
import { KpiCard, formatNumber } from "../components/KpiCard";
import { SkeletonRow } from "../components/Skeleton";

type Period = 7 | 30 | 90;

export function Analytics() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>(30);
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-summary", period],
    queryFn: () => api.analyticsSummary(period),
  });

  const collect = useMutation({
    mutationFn: () => api.collectMetricsNow(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["analytics-summary"] });
      qc.invalidateQueries({ queryKey: ["post-performance"] });
    },
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1>Analytics</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="period-toggle">
            {([7, 30, 90] as Period[]).map((p) => (
              <button
                key={p}
                className={period === p ? "active" : ""}
                onClick={() => setPeriod(p)}
              >
                {p}d
              </button>
            ))}
          </div>
          <button
            className="btn-secondary"
            onClick={() => collect.mutate()}
            disabled={collect.isPending}
          >
            {collect.isPending ? "Coletando..." : "🔄 Coletar agora"}
          </button>
        </div>
      </div>

      {isLoading && <SkeletonRow count={3} />}
      {!isLoading && data && (
        <>
          <div className="kpi-row">
            <KpiCard
              label="Alcance"
              value={formatNumber(data.totalReach)}
              hint={`últimos ${data.periodDays} dias`}
            />
            <KpiCard
              label="Engajamento"
              value={formatNumber(data.totalEngagement)}
              hint="likes + comentários + shares + saves"
            />
            <KpiCard
              label="Crescimento"
              value={`${data.followerGrowth >= 0 ? "+" : ""}${formatNumber(data.followerGrowth)}`}
              deltaPositive={data.followerGrowth >= 0}
              hint="seguidores"
            />
            <KpiCard
              label="Posts publicados"
              value={data.postsPublished}
              hint={`no período de ${data.periodDays}d`}
            />
          </div>

          <div className="charts-row">
            <div className="chart-card">
              <h3>Engajamento semanal (4 semanas)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.weeklyEngagement}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f28" />
                  <XAxis dataKey="weekStart" stroke="#888" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#888" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="likes" stackId="a" fill="#6e56cf" />
                  <Bar dataKey="comments" stackId="a" fill="#4a9cff" />
                  <Bar dataKey="shares" stackId="a" fill="#7ecf8a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h3>Mix de conteúdo</h3>
              {data.contentMix.length === 0 ? (
                <p style={{ color: "#888" }}>Sem posts no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={data.contentMix}
                      dataKey="count"
                      nameKey="network"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(entry) => (entry as unknown as { network: string }).network}
                    >
                      {data.contentMix.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={NETWORKS[entry.network as keyof typeof NETWORKS]?.color ?? "#666"}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {(data.postsPublished === 0 && data.totalEngagement === 0) && (
            <p style={{ color: "#888", textAlign: "center", marginTop: 32, fontSize: 13 }}>
              Ainda não há dados. Publique alguns posts e clique em "🔄 Coletar agora" pra buscar métricas.
            </p>
          )}
        </>
      )}
    </div>
  );
}
