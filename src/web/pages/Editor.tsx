import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NetworkSelector } from "../components/NetworkSelector";
import { NetworkPreview } from "../components/NetworkPreview";
import { MediaUploader } from "../components/MediaUploader";
import { MediaPicker } from "../components/MediaPicker";
import { AIAssistant } from "../components/AIAssistant";
import { Schedule } from "../components/Schedule";
import { LinkedInTargetPicker } from "../components/LinkedInTargetPicker";
import { InstagramTargetPicker } from "../components/InstagramTargetPicker";
import { SkeletonRow } from "../components/Skeleton";
import type { Network, Post } from "../../shared/types";

export function Editor() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [body, setBody] = useState("");
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [pillarId, setPillarId] = useState<string | null>(null);
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

  const { data: post, isLoading } = useQuery({
    queryKey: ["post", id],
    queryFn: () => api.getPost(id!),
    enabled: !!id && id !== "new",
  });

  const { data: pillarsData } = useQuery({
    queryKey: ["pillars"],
    queryFn: () => api.listPillars(),
  });
  const pillars = pillarsData?.items ?? [];

  useEffect(() => {
    if (post) {
      setBody(post.body);
      setMediaId(post.mediaId);
      setPillarId(post.pillarId);
      setNetworks(post.targets.map((t) => t.network));
      const next: Record<Network, string | null> = { instagram: null, tiktok: null, linkedin: null };
      for (const t of post.targets) next[t.network] = t.bodyOverride;
      setOverrides(next);
      const nextSchedules: Record<Network, number | null> = { instagram: null, tiktok: null, linkedin: null };
      const nextRefs: Record<Network, string | null> = { instagram: null, tiktok: null, linkedin: null };
      for (const t of post.targets) {
        nextSchedules[t.network] = t.scheduledAt;
        nextRefs[t.network] = t.targetRef;
      }
      setSchedules(nextSchedules);
      setTargetRefs(nextRefs);
    }
  }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveBase = useMutation({
    mutationFn: async (): Promise<Post> => {
      if (!id || id === "new") throw new Error("no_id");
      return api.updatePost(id, { body, mediaId, pillarId });
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
    },
  });

  async function handleSave() {
    await saveBase.mutateAsync();
    await saveTargets.mutateAsync();
  }

  async function handleDelete() {
    if (!id || !confirm("Excluir esse post?")) return;
    await api.deletePost(id);
    qc.invalidateQueries({ queryKey: ["posts"] });
    nav("/posts");
  }

  if (!id || id === "new") {
    return (
      <div>
        <p>Redirecionando — use o botão "+ Novo post" na lista.</p>
      </div>
    );
  }
  if (isLoading) return <SkeletonRow count={3} />;

  const media = post?.media ?? null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1>{post?.body ? "Editar post" : "Novo post"}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-danger" onClick={handleDelete}>Excluir</button>
          <button className="btn-primary" onClick={handleSave} disabled={saveBase.isPending || saveTargets.isPending}>
            {saveBase.isPending || saveTargets.isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div className="editor-grid">
        <div className="editor-pane">
          <AIAssistant body={body} onApply={(text) => setBody(text)} />
          <label style={{ fontSize: 14, color: "#aaa", marginBottom: 8, display: "block" }}>Copy base</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva sua ideia. Você pode customizar por rede no painel ao lado."
          />

          <div style={{ marginTop: 20 }}>
            <label style={{ fontSize: 14, color: "#aaa", marginBottom: 8, display: "block" }}>Redes</label>
            <NetworkSelector value={networks} onChange={setNetworks} />
          </div>

          <div style={{ marginTop: 20 }}>
            <label style={{ fontSize: 14, color: "#aaa", marginBottom: 8, display: "block" }}>Pilar</label>
            <select
              value={pillarId ?? ""}
              onChange={(e) => setPillarId(e.target.value === "" ? null : e.target.value)}
              style={{ width: "100%", padding: "8px 10px", background: "#0d0d12", border: "1px solid #1f1f28", borderRadius: 8, color: "#e0e0e0", fontSize: 14 }}
            >
              <option value="">— sem pilar —</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            {pillars.length === 0 && (
              <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>Nenhum pilar cadastrado. Vá em Estratégia pra criar.</p>
            )}
          </div>

          <div style={{ marginTop: 20 }}>
            <label style={{ fontSize: 14, color: "#aaa", marginBottom: 8, display: "block" }}>Mídia</label>
            <MediaUploader onUploaded={(mid) => setMediaId(mid)} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn-secondary" onClick={() => setShowPicker((s) => !s)}>
                {showPicker ? "Fechar biblioteca" : "Escolher da biblioteca"}
              </button>
              {mediaId && (
                <button className="btn-secondary" onClick={() => setMediaId(null)}>Remover mídia</button>
              )}
            </div>
            {showPicker && (
              <div style={{ marginTop: 12 }}>
                <MediaPicker
                  selectedId={mediaId}
                  onSelect={(mid) => {
                    setMediaId(mid);
                    setShowPicker(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {networks.length === 0 && (
            <p style={{ color: "#888" }}>Selecione pelo menos uma rede pra ver o preview.</p>
          )}
          {networks.map((n) => (
            <div key={n} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <NetworkPreview
                network={n}
                baseBody={body}
                override={overrides[n]}
                media={media}
                onOverrideChange={(text) => setOverrides((prev) => ({ ...prev, [n]: text }))}
              />
              <div style={{ padding: "8px 12px", background: "#0d0d12", border: "1px solid #1f1f28", borderRadius: 8, fontSize: 12 }}>
                {post?.targets.find((t) => t.network === n) && (
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                    Status: <span className={`status-${post.targets.find((t) => t.network === n)!.status}`}>
                      {post.targets.find((t) => t.network === n)!.status}
                    </span>
                    {post.targets.find((t) => t.network === n)?.lastError && (
                      <span style={{ color: "#ff6b6b", marginLeft: 8 }}>
                        ({post.targets.find((t) => t.network === n)!.lastError})
                      </span>
                    )}
                  </div>
                )}
                {n === "linkedin" && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: "block", color: "#aaa", fontSize: 11, marginBottom: 4 }}>Publicar em:</label>
                    <LinkedInTargetPicker
                      value={targetRefs.linkedin}
                      onChange={(ref) => setTargetRefs((prev) => ({ ...prev, linkedin: ref }))}
                    />
                  </div>
                )}
                {n === "instagram" && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: "block", color: "#aaa", fontSize: 11, marginBottom: 4 }}>Conta Instagram:</label>
                    <InstagramTargetPicker
                      value={targetRefs.instagram}
                      onChange={(ref) => setTargetRefs((prev) => ({ ...prev, instagram: ref }))}
                    />
                  </div>
                )}
                <label style={{ display: "block", color: "#aaa", fontSize: 11, marginBottom: 4 }}>Agendar:</label>
                <Schedule
                  value={schedules[n]}
                  onChange={(ms) => setSchedules((prev) => ({ ...prev, [n]: ms }))}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    className="btn-primary"
                    style={{ fontSize: 11, padding: "4px 10px" }}
                    onClick={async () => {
                      if (!id) return;
                      // Save first (idempotent), then publish
                      try {
                        await saveBase.mutateAsync();
                        await saveTargets.mutateAsync();
                        await api.publishNow(id, n);
                        qc.invalidateQueries({ queryKey: ["post", id] });
                        qc.invalidateQueries({ queryKey: ["posts"] });
                        alert("Publicado!");
                      } catch (e) {
                        alert("Falhou: " + (e instanceof Error ? e.message : "erro"));
                      }
                    }}
                    disabled={!body.trim()}
                    title={!body.trim() ? "Copy vazio" : "Publicar agora nessa rede"}
                  >
                    🚀 Publicar agora
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
