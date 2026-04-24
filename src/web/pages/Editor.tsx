import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NetworkSelector } from "../components/NetworkSelector";
import { NetworkPreview } from "../components/NetworkPreview";
import { MediaUploader } from "../components/MediaUploader";
import { MediaPicker } from "../components/MediaPicker";
import { Schedule } from "../components/Schedule";
import { LinkedInTargetPicker } from "../components/LinkedInTargetPicker";
import { InstagramTargetPicker } from "../components/InstagramTargetPicker";
import { AIAssistant } from "../components/AIAssistant";
import { SkeletonRow } from "../components/Skeleton";
import { Button, ConfirmDialog } from "../ui";
import { toasts } from "../ui/toast";
import type { Network, Post } from "../../shared/types";

export function Editor() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [body, setBody] = useState("");
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [overrides, setOverrides] = useState<Record<Network, string | null>>({
    instagram: null, tiktok: null, linkedin: null,
  });
  const [schedules, setSchedules] = useState<Record<Network, number | null>>({
    instagram: null, tiktok: null, linkedin: null,
  });
  const [targetRefs, setTargetRefs] = useState<Record<Network, string | null>>({
    instagram: null, tiktok: null, linkedin: null,
  });
  const [showPicker, setShowPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: post, isLoading } = useQuery({
    queryKey: ["post", id],
    queryFn: () => api.getPost(id!),
    enabled: !!id && id !== "new",
  });

  useEffect(() => {
    if (post) {
      setBody(post.body);
      setMediaId(post.mediaId);
      setNetworks(post.targets.map((t) => t.network));
      const overr: Record<Network, string | null> = { instagram: null, tiktok: null, linkedin: null };
      const sched: Record<Network, number | null> = { instagram: null, tiktok: null, linkedin: null };
      const refs: Record<Network, string | null> = { instagram: null, tiktok: null, linkedin: null };
      for (const t of post.targets) {
        overr[t.network] = t.bodyOverride;
        sched[t.network] = t.scheduledAt;
        refs[t.network] = t.targetRef;
      }
      setOverrides(overr);
      setSchedules(sched);
      setTargetRefs(refs);
    }
  }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveBase = useMutation({
    mutationFn: async (): Promise<Post> => {
      if (!id || id === "new") throw new Error("no_id");
      return api.updatePost(id, { body, mediaId });
    },
  });

  const saveTargets = useMutation({
    mutationFn: async (): Promise<Post> => {
      if (!id || id === "new") throw new Error("no_id");
      const withTargets = await api.setTargets(id, networks);
      let latest = withTargets;
      for (const n of networks) {
        latest = await api.updateTarget(id, n, {
          bodyOverride: overrides[n],
          scheduledAt: schedules[n],
          targetRef: targetRefs[n],
        });
      }
      return latest;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["post", id] });
      qc.invalidateQueries({ queryKey: ["posts"] });
      toasts.success("Salvo");
    },
  });

  async function handleSave() {
    try {
      await saveBase.mutateAsync();
      await saveTargets.mutateAsync();
    } catch (e) {
      toasts.error("Falha ao salvar", e instanceof Error ? e.message : undefined);
    }
  }

  async function handleDelete() {
    if (!id) return;
    try {
      await api.deletePost(id);
      qc.invalidateQueries({ queryKey: ["posts"] });
      toasts.success("Post excluído");
      nav("/posts");
    } catch (e) {
      toasts.error("Falha ao excluir");
    }
  }

  if (!id || id === "new") {
    return (
      <div>
        <p style={{ color: "var(--lume-text-muted)" }}>Redirecionando — use o botão "+ Novo post" na lista.</p>
      </div>
    );
  }

  if (isLoading) return <SkeletonRow count={3} />;

  const media = post?.media ?? null;
  const isBusy = saveBase.isPending || saveTargets.isPending;
  const hasCopy = body.trim().length > 0;

  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1>{post?.body ? "Editar post" : "Novo post"}</h1>
          <p style={{ color: "var(--lume-text-muted)", fontSize: 14, margin: "4px 0 0" }}>
            Escreva, customize por rede, agende.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>Excluir</Button>
          <Button onClick={handleSave} loading={isBusy}>Salvar</Button>
        </div>
      </header>

      <div className="editor-grid">
        <div className="editor-pane">
          <AIAssistant body={body} onApply={(text) => setBody(text)} />

          <label style={{ marginBottom: 8, display: "block" }}>Copy base</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva sua ideia. Você pode customizar por rede no painel ao lado."
            style={{ minHeight: 260 }}
          />

          <div style={{ marginTop: 24 }}>
            <label>Redes</label>
            <NetworkSelector value={networks} onChange={setNetworks} />
          </div>

          <div style={{ marginTop: 24 }}>
            <label>Mídia</label>
            <MediaUploader onUploaded={(mid) => setMediaId(mid)} />
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Button variant="secondary" size="sm" onClick={() => setShowPicker((s) => !s)}>
                {showPicker ? "Fechar biblioteca" : "Escolher da biblioteca"}
              </Button>
              {mediaId && (
                <Button variant="secondary" size="sm" onClick={() => setMediaId(null)}>Remover mídia</Button>
              )}
            </div>
            {showPicker && (
              <div style={{ marginTop: 16 }}>
                <MediaPicker
                  selectedId={mediaId}
                  onSelect={(mid) => { setMediaId(mid); setShowPicker(false); }}
                />
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {networks.length === 0 && (
            <div className="empty-state" style={{ margin: 0 }}>
              <div className="empty-state-icon" aria-hidden>👆</div>
              <div className="empty-state-title">Selecione uma rede</div>
              <div className="empty-state-desc">Escolha pelo menos uma rede pra ver o preview.</div>
            </div>
          )}
          {networks.map((n) => (
            <div key={n} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <NetworkPreview
                network={n}
                baseBody={body}
                override={overrides[n]}
                media={media}
                onOverrideChange={(text) => setOverrides((prev) => ({ ...prev, [n]: text }))}
              />
              <div style={{ padding: 12, background: "var(--lume-surface)", border: "1px solid var(--lume-border)", borderRadius: 12, fontSize: 13 }}>
                {post?.targets.find((t) => t.network === n) && (
                  <div style={{ fontSize: 12, color: "var(--lume-text-muted)", marginBottom: 8 }}>
                    Status: <span className={`status-${post.targets.find((t) => t.network === n)!.status}`}>
                      {post.targets.find((t) => t.network === n)!.status}
                    </span>
                    {post.targets.find((t) => t.network === n)?.lastError && (
                      <span style={{ color: "var(--lume-danger)", marginLeft: 8 }}>
                        ({post.targets.find((t) => t.network === n)!.lastError})
                      </span>
                    )}
                  </div>
                )}
                {n === "linkedin" && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11 }}>Publicar em</label>
                    <LinkedInTargetPicker
                      value={targetRefs.linkedin}
                      onChange={(ref) => setTargetRefs((prev) => ({ ...prev, linkedin: ref }))}
                    />
                  </div>
                )}
                {n === "instagram" && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11 }}>Conta Instagram</label>
                    <InstagramTargetPicker
                      value={targetRefs.instagram}
                      onChange={(ref) => setTargetRefs((prev) => ({ ...prev, instagram: ref }))}
                    />
                  </div>
                )}
                <label style={{ fontSize: 11 }}>Agendar</label>
                <Schedule
                  value={schedules[n]}
                  onChange={(ms) => setSchedules((prev) => ({ ...prev, [n]: ms }))}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Button
                    size="sm"
                    disabled={!hasCopy}
                    onClick={async () => {
                      if (!id) return;
                      try {
                        await saveBase.mutateAsync();
                        await saveTargets.mutateAsync();
                        await api.publishNow(id, n);
                        qc.invalidateQueries({ queryKey: ["post", id] });
                        qc.invalidateQueries({ queryKey: ["posts"] });
                        toasts.success(`Publicado no ${n}`);
                      } catch (e) {
                        toasts.error("Publicação falhou", e instanceof Error ? e.message : undefined);
                      }
                    }}
                  >
                    🚀 Publicar agora
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir esse post?"
        message="Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
