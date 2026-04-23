import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { CalendarGrid } from "../components/CalendarGrid";
import { SkeletonRow } from "../components/Skeleton";

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

  function prev() {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  }
  function next() {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1>Calendário</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn-secondary" onClick={prev}>← Anterior</button>
          <span style={{ minWidth: 180, textAlign: "center", fontWeight: 600 }}>
            {MONTH_NAMES[month]} {year}
          </span>
          <button className="btn-secondary" onClick={next}>Próximo →</button>
        </div>
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
