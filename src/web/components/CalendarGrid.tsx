import { useMemo } from "react";
import { NETWORKS } from "../lib/networks";

export interface CalendarItem {
  id: string;
  body: string;
  status: string;
  networks: string[];
  scheduledAt: number;
}

interface Props {
  year: number;
  month: number;          // 0-indexed
  items: CalendarItem[];
  onPostClick: (id: string) => void;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function startOfMonthGrid(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  const offset = first.getDay();
  return new Date(year, month, 1 - offset);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function shortBody(body: string, n = 28): string {
  const t = body.replace(/\s+/g, " ").trim();
  if (!t) return "(sem copy)";
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export function CalendarGrid({ year, month, items, onPostClick }: Props) {
  const today = new Date();
  const monthStart = useMemo(() => startOfMonthGrid(year, month), [year, month]);
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      out.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() + i));
    }
    return out;
  }, [monthStart]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const d = new Date(item.scheduledAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

  return (
    <div className="calendar-scroll">
      <div className="calendar-header">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">{w}</div>
        ))}
      </div>
      <div className="calendar">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === month;
          const isToday = isSameDay(d, today);
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayItems = itemsByDay.get(key) ?? [];
          return (
            <div
              key={i}
              className={`cal-day ${inMonth ? "" : "cal-day-outside"} ${isToday ? "cal-day-today" : ""}`}
            >
              <div className="cal-day-num">{d.getDate()}</div>
              {dayItems.map((it) => {
                const d = new Date(it.scheduledAt);
                const hm = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
                return (
                  <div
                    key={it.id}
                    className={`cal-item status-${it.status}`}
                    onClick={() => onPostClick(it.id)}
                    title={it.body}
                  >
                    <span style={{ fontSize: 9, opacity: 0.7, flexShrink: 0, marginRight: 2 }}>{hm}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
                      {shortBody(it.body, 22)}
                    </span>
                    <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      {it.networks.map((n) => (
                        <span key={n} className="cal-net-dot" style={{ background: NETWORKS[n as keyof typeof NETWORKS]?.color ?? "#666" }} />
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
