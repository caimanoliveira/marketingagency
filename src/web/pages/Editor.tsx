import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NetworkSelector } from "../components/NetworkSelector";
import { NetworkPreview } from "../components/NetworkPreview";
import { MediaUploader } from "../components/MediaUploader";
import { MediaPicker } from "../components/MediaPicker";
import { AIAssistant } from "../components/AIAssistant";
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
  const [showPicker, setShowPicker] = useState(false);

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
      const next: Record<Network, string | null> = { instagram: null, tiktok: null, linkedin: null };
      for (const t of post.targets) next[t.network] = t.bodyOverride;
      setOverrides(next);
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
        latest = await api.updateTarget(id, n, { bodyOverride: overrides[n] });
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
  if (isLoading) return <p>Carregando...</p>;

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
            <NetworkPreview
              key={n}
              network={n}
              baseBody={body}
              override={overrides[n]}
              media={media}
              onOverrideChange={(text) => setOverrides((prev) => ({ ...prev, [n]: text }))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
