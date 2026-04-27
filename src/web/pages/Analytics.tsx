import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { api } from "../lib/api";
import { NETWORKS } from "../lib/networks";
import { KpiCard, formatNumber } from "../components/KpiCard";
import { SkeletonRow } from "../components/Skeleton";
import { WoWChips } from "../components/WoWChips";
import { TopPostsCard } from "../components/TopPostsCard";
import { Button } from "../ui";

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Analytics</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--lume-text-inverse)", opacity: 0.55 }}>
            Métricas agregadas das suas redes conectadas.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="period-toggle">
            {([7, 30, 90] as Period[]).map(p => (
              <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>{p}d</button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={() => collect.mutate()} loading={collect.isPending}>
            🔄 Coletar métricas
          </Button>
        </div>
      </div>

      {isLoading && <SkeletonRow count={3} />}
      {!isLoading && data && (
        <>
          <div className="kpi-row">
            <div>
              <KpiCard
                label="Alcance"
                value={formatNumber(data.totalReach)}
                hint={`últimos ${data.periodDays} dias`}
              />
              <div style={{ fontSize: 12, color: "var(--lume-text-muted)", marginTop: 4, paddingLeft: 4 }}><WoWChips field="reach" /></div>
            </div>
            <div>
              <KpiCard
                label="Engajamento"
                value={formatNumber(data.totalEngagement)}
                hint="likes + comentários + shares + saves"
              />
              <div style={{ fontSize: 12, color: "var(--lume-text-muted)", marginTop: 4, paddingLeft: 4 }}><WoWChips field="engagement" /></div>
            </div>
            <KpiCard
              label="Crescimento"
              value={`${data.followerGrowth >= 0 ? "+" : ""}${formatNumber(data.followerGrowth)}`}
              deltaPositive={data.followerGrowth >= 0}
              hint="seguidores"
            />
            <div>
              <KpiCard
                label="Posts publicados"
                value={data.postsPublished}
                hint={`no período de ${data.periodDays}d`}
              />
              <div style={{ fontSize: 12, color: "var(--lume-text-muted)", marginTop: 4, paddingLeft: 4 }}><WoWChips field="posts" /></div>
            </div>
          </div>

          <div className="charts-row">
            <div className="chart-card">
              <h3>Engajamento semanal (4 semanas)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.weeklyEngagement}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--lume-border)" />
                  <XAxis dataKey="weekStart" stroke="var(--lume-text-soft)" tick={{ fontSize: 11 }} />
                  <YAxis stroke="var(--lume-text-soft)" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "var(--lume-surface)", border: "1px solid var(--lume-border)", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="likes" stackId="a" fill="var(--lume-primary)" />
                  <Bar dataKey="comments" stackId="a" fill="var(--lume-info)" />
                  <Bar dataKey="shares" stackId="a" fill="var(--lume-success)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h3>Mix de conteúdo</h3>
              {data.contentMix.length === 0 ? (
                <p style={{ color: "var(--lume-text-muted)" }}>Sem posts no período.</p>
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
                    <Tooltip contentStyle={{ background: "var(--lume-surface)", border: "1px solid var(--lume-border)", borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {(data.postsPublished === 0 && data.totalEngagement === 0) && (
            <div style={{
              background: "var(--lume-surface)", border: "1px solid var(--lume-border)",
              borderRadius: "var(--lume-radius-lg)", padding: "var(--lume-space-8)",
              textAlign: "center", marginTop: 24,
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--lume-text)", marginBottom: 8 }}>
                Sem dados ainda
              </div>
              <p style={{ color: "var(--lume-text-muted)", fontSize: 14, margin: "0 0 16px", maxWidth: 360, marginInline: "auto" }}>
                Publique posts pelas redes conectadas e clique em "Coletar métricas" para ver seus números aqui.
              </p>
              <Button variant="secondary" onClick={() => collect.mutate()} loading={collect.isPending}>
                🔄 Coletar agora
              </Button>
            </div>
          )}

          <TopPostsCard />
        </>
      )}
    </div>
  );
}
