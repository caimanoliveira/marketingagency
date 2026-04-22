interface Props {
  value: number | null;
  onChange: (ms: number | null) => void;
}

function toLocal(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocal(s: string): number | null {
  return s ? new Date(s).getTime() : null;
}

export function Schedule({ value, onChange }: Props) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        type="datetime-local"
        value={toLocal(value)}
        onChange={(e) => onChange(fromLocal(e.target.value))}
        style={{ padding: 6, background: "#111118", color: "#eee", border: "1px solid #2a2a36", borderRadius: 6, fontSize: 13, colorScheme: "dark" }}
      />
      {value !== null && (
        <button
          className="btn-secondary"
          onClick={() => onChange(null)}
          style={{ fontSize: 11, padding: "2px 8px" }}
        >
          Limpar
        </button>
      )}
    </div>
  );
}
