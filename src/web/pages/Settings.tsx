import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Button, Avatar, ConfirmDialog } from "../ui";
import { toasts } from "../ui/toast";

function LinkedInPanel() {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["linkedin"], queryFn: api.getLinkedIn });

  const refresh = useMutation({
    mutationFn: () => api.refreshLinkedInOrgs(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["linkedin"] }); toasts.success("Páginas atualizadas"); },
    onError: () => toasts.error("Falha ao atualizar páginas"),
  });

  const disconnect = useMutation({
    mutationFn: () => api.disconnectLinkedIn(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["linkedin"] }); toasts.success("LinkedIn desconectado"); },
    onError: () => toasts.error("Falha ao desconectar"),
  });

  if (!data?.connected) {
    return (
      <div>
        <p style={{ color: "var(--lume-text-muted)", fontSize: 14, margin: "0 0 12px" }}>
          Não conectado. Clique para autorizar o acesso.
        </p>
        <a href="/api/connections/linkedin/start" className="lume-btn lume-btn-primary lume-btn-sm">
          Conectar LinkedIn
        </a>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Avatar alt={data.member!.memberName} size={36} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{data.member!.memberName}</div>
          <div style={{ color: "var(--lume-text-soft)", fontSize: 12 }}>
            Token expira em {new Date(data.member!.expiresAt).toLocaleDateString("pt-BR")}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--lume-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Páginas de empresa ({data.orgs?.length ?? 0})
        </div>
        {(data.orgs?.length ?? 0) === 0 ? (
          <p style={{ color: "var(--lume-text-muted)", fontSize: 13, margin: 0 }}>
            Nenhuma — você não é admin de nenhuma página, ou falta o scope{" "}
            <code style={{ fontSize: 12 }}>rw_organization_admin</code>.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.orgs?.map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar src={o.orgLogoUrl} alt={o.orgName} size={28} />
                <span style={{ fontSize: 14, fontWeight: 500 }}>{o.orgName}</span>
                <span style={{ color: "var(--lume-text-soft)", fontSize: 12 }}>{o.orgUrn}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" size="sm" loading={refresh.isPending} onClick={() => refresh.mutate()}>
          Atualizar páginas
        </Button>
        <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
          Desconectar
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Desconectar LinkedIn?"
        message="O acesso ao LinkedIn será revogado. Você precisará reconectar para publicar."
        confirmLabel="Desconectar"
        danger
        onConfirm={() => disconnect.mutate()}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}

function InstagramPanel() {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["instagram"], queryFn: api.getInstagram });

  const refresh = useMutation({
    mutationFn: () => api.refreshInstagram(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instagram"] }); toasts.success("Contas atualizadas"); },
    onError: () => toasts.error("Falha ao atualizar contas"),
  });

  const disconnect = useMutation({
    mutationFn: () => api.disconnectInstagram(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instagram"] }); toasts.success("Instagram desconectado"); },
    onError: () => toasts.error("Falha ao desconectar"),
  });

  if (!data?.connected) {
    return (
      <div>
        <p style={{ color: "var(--lume-text-muted)", fontSize: 14, margin: "0 0 12px" }}>
          Não conectado. Exige conta Instagram Business ligada a uma página do Facebook.
        </p>
        <a href="/api/connections/instagram/start" className="lume-btn lume-btn-primary lume-btn-sm">
          Conectar Instagram
        </a>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Avatar alt={data.member!.fbUserName} size={36} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{data.member!.fbUserName}</div>
          <div style={{ color: "var(--lume-text-soft)", fontSize: 12 }}>
            Token expira em {new Date(data.member!.expiresAt).toLocaleDateString("pt-BR")}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--lume-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Contas Instagram ({data.accounts?.length ?? 0})
        </div>
        {(data.accounts?.length ?? 0) === 0 ? (
          <p style={{ color: "var(--lume-text-muted)", fontSize: 13, margin: 0 }}>
            Nenhuma conta Instagram Business encontrada. Verifique se sua conta está configurada como Business e conectada a uma página do Facebook que você administra.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.accounts?.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar src={a.profilePictureUrl} alt={`@${a.igUsername}`} size={28} />
                <span style={{ fontSize: 14, fontWeight: 500 }}>@{a.igUsername}</span>
                <span style={{ color: "var(--lume-text-soft)", fontSize: 12 }}>via {a.fbPageName}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" size="sm" loading={refresh.isPending} onClick={() => refresh.mutate()}>
          Atualizar contas
        </Button>
        <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
          Desconectar
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Desconectar Instagram?"
        message="O acesso ao Instagram será revogado. Você precisará reconectar para publicar."
        confirmLabel="Desconectar"
        danger
        onConfirm={() => disconnect.mutate()}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}

export function Settings() {
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 4px" }}>Conexões</h1>
        <p style={{ color: "var(--lume-text-muted)", fontSize: 14, margin: 0 }}>
          Gerencie suas contas de redes sociais conectadas.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="lume-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden>
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>LinkedIn</h2>
          </div>
          <LinkedInPanel />
        </div>

        <div className="lume-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="url(#ig-grad)" aria-hidden>
              <defs>
                <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f09433" />
                  <stop offset="25%" stopColor="#e6683c" />
                  <stop offset="50%" stopColor="#dc2743" />
                  <stop offset="75%" stopColor="#cc2366" />
                  <stop offset="100%" stopColor="#bc1888" />
                </linearGradient>
              </defs>
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
            </svg>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Instagram</h2>
          </div>
          <InstagramPanel />
        </div>
      </div>
    </div>
  );
}
