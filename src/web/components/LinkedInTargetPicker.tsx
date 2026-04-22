import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Props {
  value: string | null;
  onChange: (ref: string | null) => void;
}

export function LinkedInTargetPicker({ value, onChange }: Props) {
  const { data } = useQuery({ queryKey: ["linkedin"], queryFn: api.getLinkedIn });
  if (!data?.connected) {
    return <span style={{ color: "#ff9d4a", fontSize: 12 }}>Conecte o LinkedIn em Configurações.</span>;
  }
  return (
    <select
      value={value ?? "self"}
      onChange={(e) => onChange(e.target.value === "self" ? null : e.target.value)}
      style={{ padding: 6, background: "#111118", color: "#eee", border: "1px solid #2a2a36", borderRadius: 6, fontSize: 13 }}
    >
      <option value="self">Perfil ({data.member!.memberName})</option>
      {data.orgs?.map((o) => (
        <option key={o.id} value={o.orgUrn}>Página: {o.orgName}</option>
      ))}
    </select>
  );
}
