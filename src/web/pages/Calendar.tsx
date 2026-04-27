import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { CalendarGrid } from "../components/CalendarGrid";
import { SkeletonRow } from "../components/Skeleton";
import { Button } from "../ui";

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const STATUS_COLORS: Record<string, string> = {
  published: "var(--lume-success)",
  scheduled: "var(--lume-warning)",
  draft:     "var(--lume-text-soft)",
  failed:    "var(--lume-danger)",
};

export function Calendar() {
  const nav = useNavigate();
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const { data, isLoading } = useQuery({
    queryKey: ["posts-by-month", year, month],
    queryFn: () => api.postsByMonth(year, month),
  });

  function prev() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }

  const isCurrent = year === today.getFullYear() && month === today.getMonth();
  const totalPosts = data?.items.length ?? 0;
  const scheduled  = data?.items.filter(i => i.status === "scheduled").length ?? 0;
  const published  = data?.items.filter(i => i.status === "published").length ?? 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Calendário</h1>
          {totalPosts > 0 && !isLoading && (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--lume-text-inverse)", opacity: 0.6 }}>
              {totalPosts} post{totalPosts !== 1 ? "s" : ""} em {MONTHS[month]}
              {scheduled > 0 && ` · ${scheduled} agendado${scheduled !== 1 ? "s" : ""}`}
              {published > 0 && ` · ${published} publicado${published !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={prev} aria-label="Mês anterior"
            style={{ color: "var(--lume-text-inverse)", borderColor: "rgba(255,255,255,0.15)" }}>
            ←
          </Button>
          <div style={{
            minWidth: 160, textAlign: "center",
            fontWeight: 700, fontSize: 16,
            color: "var(--lume-text-inverse)",
            letterSpacing: "-0.3px",
          }}>
            {MONTHS[month]} {year}
          </div>
          <Button variant="ghost" size="sm" onClick={next} aria-label="Próximo mês"
            style={{ color: "var(--lume-text-inverse)", borderColor: "rgba(255,255,255,0.15)" }}>
            →
          </Button>
          {!isCurrent && (
            <Button variant="secondary" size="sm" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}>
              Hoje
            </Button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries({ Publicado: "published", Agendado: "scheduled", Draft: "draft", Falhou: "failed" }).map(([label, status]) => (
          <div key={status} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLORS[status], flexShrink: 0 }} />
            {label}
          </div>
        ))}
      </div>

      {isLoading && <SkeletonRow count={6} />}
      {!isLoading && (
        <CalendarGrid
          year={year}
          month={month}
          items={data?.items ?? []}
          onPostClick={(id) => nav(`/posts/${id}`)}
        />
      )}
    </div>
  );
}
