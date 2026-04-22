import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Props {
  value: string | null;
  onChange: (ref: string | null) => void;
}

export function InstagramTargetPicker({ value, onChange }: Props) {
  const { data } = useQuery({ queryKey: ["instagram"], queryFn: api.getInstagram });
  if (!data?.connected) {
    return <span style={{ color: "#ff9d4a", fontSize: 12 }}>Conecte o Instagram em Configurações.</span>;
  }
  if (!data.accounts?.length) {
    return <span style={{ color: "#ff9d4a", fontSize: 12 }}>Nenhuma conta IG Business encontrada.</span>;
  }
  return (
    <select
      value={value ?? data.accounts[0].igUserId}
      onChange={(e) => onChange(e.target.value)}
      style={{ padding: 6, background: "#111118", color: "#eee", border: "1px solid #2a2a36", borderRadius: 6, fontSize: 13 }}
    >
      {data.accounts.map((a) => (
        <option key={a.id} value={a.igUserId}>@{a.igUsername}</option>
      ))}
    </select>
  );
}
