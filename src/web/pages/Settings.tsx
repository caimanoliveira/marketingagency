import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

function InstagramPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["instagram"], queryFn: api.getInstagram });

  const refresh = useMutation({
    mutationFn: () => api.refreshInstagram(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instagram"] }),
  });

  const disconnect = useMutation({
    mutationFn: () => api.disconnectInstagram(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instagram"] }),
  });

  if (!data?.connected) {
    return (
      <div>
        <p style={{ color: "#aaa" }}>Não conectado. Exige conta Instagram Business ligada a uma página do Facebook.</p>
        <a
          className="btn-primary"
          href="/api/connections/instagram/start"
          style={{ textDecoration: "none", display: "inline-block" }}
        >
          Conectar Instagram
        </a>
      </div>
    );
  }
  return (
    <div>
      <p><strong>{data.member!.fbUserName}</strong> (Facebook)</p>
      <p style={{ color: "#888", fontSize: 12 }}>
        Token expira em {new Date(data.member!.expiresAt).toLocaleDateString("pt-BR")}
      </p>
      <h3 style={{ fontSize: 14, marginTop: 16 }}>Contas Instagram ({data.accounts?.length ?? 0})</h3>
      {(data.accounts?.length ?? 0) === 0 && (
        <p style={{ color: "#888", fontSize: 13 }}>
          Nenhuma conta Instagram Business encontrada. Verifique se sua conta IG está configurada como Business e conectada a uma página do Facebook que você administra.
        </p>
      )}
      {data.accounts?.map((a) => (
        <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "6px 0" }}>
          {a.profilePictureUrl && (
            <img src={a.profilePictureUrl} alt="" style={{ width: 28, height: 28, borderRadius: 14 }} />
          )}
          <span>@{a.igUsername}</span>
          <span style={{ color: "#666", fontSize: 11 }}>via {a.fbPageName}</span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn-secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? "Atualizando..." : "Atualizar contas"}
        </button>
        <button className="btn-danger" onClick={() => { if (confirm("Desconectar Instagram?")) disconnect.mutate(); }}>
          Desconectar
        </button>
      </div>
    </div>
  );
}

export function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["linkedin"], queryFn: api.getLinkedIn });

  const refresh = useMutation({
    mutationFn: () => api.refreshLinkedInOrgs(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["linkedin"] }),
  });

  const disconnect = useMutation({
    mutationFn: () => api.disconnectLinkedIn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["linkedin"] }),
  });

  return (
    <div>
      <h1>Conexões</h1>
      <section style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 12, padding: 16, maxWidth: 640 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>LinkedIn</h2>
        {!data?.connected && (
          <div>
            <p style={{ color: "#aaa" }}>Não conectado. Clique pra autorizar.</p>
            <a className="btn-primary" href="/api/connections/linkedin/start" style={{ textDecoration: "none", display: "inline-block" }}>
              Conectar LinkedIn
            </a>
          </div>
        )}
        {data?.connected && (
          <div>
            <p><strong>{data.member!.memberName}</strong></p>
            <p style={{ color: "#888", fontSize: 12 }}>
              Token expira em {new Date(data.member!.expiresAt).toLocaleDateString("pt-BR")}
            </p>
            <h3 style={{ fontSize: 14, marginTop: 16 }}>Páginas de empresa ({data.orgs?.length ?? 0})</h3>
            {(data.orgs?.length ?? 0) === 0 && (
              <p style={{ color: "#888", fontSize: 13 }}>
                Nenhuma — você não é admin de nenhuma página, ou falta o scope <code>rw_organization_admin</code> (requer aprovação Marketing Developer Platform no app LinkedIn).
              </p>
            )}
            {data.orgs?.map((o) => (
              <div key={o.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "6px 0" }}>
                {o.orgLogoUrl && <img src={o.orgLogoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 4 }} />}
                <span>{o.orgName}</span>
                <span style={{ color: "#666", fontSize: 11 }}>{o.orgUrn}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
                {refresh.isPending ? "Atualizando..." : "Atualizar páginas"}
              </button>
              <button className="btn-danger" onClick={() => { if (confirm("Desconectar LinkedIn?")) disconnect.mutate(); }}>
                Desconectar
              </button>
            </div>
          </div>
        )}
      </section>
      <section style={{ background: "#111118", border: "1px solid #1f1f28", borderRadius: 12, padding: 16, maxWidth: 640, marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Instagram</h2>
        <InstagramPanel />
      </section>
    </div>
  );
}
