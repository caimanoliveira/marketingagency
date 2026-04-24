import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { CalendarGrid } from "../components/CalendarGrid";
import { SkeletonRow } from "../components/Skeleton";
import { Button } from "../ui";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function Calendar() {
  const nav = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const { data, isLoading } = useQuery({
    queryKey: ["posts-by-month", year, month],
    queryFn: () => api.postsByMonth(year, month),
  });

  function prev() { if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1); }
  function next() { if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1); }

  function today_() { setYear(today.getFullYear()); setMonth(today.getMonth()); }

  const isCurrent = year === today.getFullYear() && month === today.getMonth();

  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1>Calendário</h1>
          <p style={{ color: "var(--lume-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
            Visualize seus posts agendados e publicados.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" onClick={prev} aria-label="Mês anterior">←</Button>
          <div style={{ minWidth: 180, textAlign: "center", fontWeight: 600, fontSize: 15, color: "var(--lume-text)" }}>
            {MONTH_NAMES[month]} {year}
          </div>
          <Button variant="secondary" size="sm" onClick={next} aria-label="Próximo mês">→</Button>
          {!isCurrent && <Button variant="ghost" size="sm" onClick={today_}>Hoje</Button>}
        </div>
      </header>

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
