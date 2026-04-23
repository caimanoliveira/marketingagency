interface Props {
  label: string;
  value: string | number;
  delta?: string | null;
  deltaPositive?: boolean;
  hint?: string;
}

export function KpiCard({ label, value, delta, deltaPositive, hint }: Props) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {delta && (
        <div className={`kpi-delta ${deltaPositive ? "kpi-delta-pos" : "kpi-delta-neg"}`}>
          {delta}
        </div>
      )}
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
