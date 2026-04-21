import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { NETWORK_LIST } from "../lib/networks";
import type { Network, Tone } from "../../shared/types";

interface Props {
  body: string;
  onApply: (text: string) => void;
}

type Mode = null | "variations" | "rewrite" | "tone";

const TONES: { id: Tone; label: string }[] = [
  { id: "formal", label: "Formal" },
  { id: "casual", label: "Casual" },
  { id: "playful", label: "Brincalhão" },
  { id: "direct", label: "Direto" },
];

export function AIAssistant({ body, onApply }: Props) {
  const [mode, setMode] = useState<Mode>(null);
  const [brief, setBrief] = useState("");
  const [network, setNetwork] = useState<Network>("linkedin");
  const [tone, setTone] = useState<Tone>("casual");
  const [results, setResults] = useState<string[]>([]);

  const variationsMut = useMutation({
    mutationFn: () => api.aiVariations({ brief, network, tone }),
    onSuccess: (r) => setResults(r.variations),
  });
  const rewriteMut = useMutation({
    mutationFn: () => api.aiRewrite({ body, network }),
    onSuccess: (r) => setResults([r.rewritten]),
  });
  const toneMut = useMutation({
    mutationFn: () => api.aiTone({ body, tone }),
    onSuccess: (r) => setResults([r.adjusted]),
  });

  function close() { setMode(null); setResults([]); }
  const busy = variationsMut.isPending || rewriteMut.isPending || toneMut.isPending;

  return (
    <div className="ai-panel">
      <div className="ai-buttons">
        <button className="btn-secondary" onClick={() => setMode("variations")}>
          ✨ Gerar variações
        </button>
        <button
          className="btn-secondary"
          onClick={() => setMode("rewrite")}
          disabled={!body.trim()}
          title={!body.trim() ? "Escreva uma copy base primeiro" : ""}
        >
          🔀 Reescrever pra rede
        </button>
        <button
          className="btn-secondary"
          onClick={() => setMode("tone")}
          disabled={!body.trim()}
          title={!body.trim() ? "Escreva uma copy base primeiro" : ""}
        >
          🎨 Ajustar tom
        </button>
      </div>

      {mode === "variations" && (
        <div className="ai-form">
          <label>Brief (o que é o post?)</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="Ex: lançamento do novo recurso de exportação em PDF"
          />
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <label style={{ flex: 1 }}>Rede alvo
              <select value={network} onChange={(e) => setNetwork(e.target.value as Network)}>
                {NETWORK_LIST.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </label>
            <label style={{ flex: 1 }}>Tom
              <select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                {TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
          </div>
          <div className="ai-actions">
            <button className="btn-secondary" onClick={close}>Fechar</button>
            <button
              className="btn-primary"
              onClick={() => variationsMut.mutate()}
              disabled={brief.trim().length < 3 || busy}
            >
              {busy ? "Gerando..." : "Gerar"}
            </button>
          </div>
        </div>
      )}

      {mode === "rewrite" && (
        <div className="ai-form">
          <label>Rede alvo</label>
          <select value={network} onChange={(e) => setNetwork(e.target.value as Network)}>
            {NETWORK_LIST.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <div className="ai-actions">
            <button className="btn-secondary" onClick={close}>Fechar</button>
            <button className="btn-primary" onClick={() => rewriteMut.mutate()} disabled={busy}>
              {busy ? "Reescrevendo..." : "Reescrever"}
            </button>
          </div>
        </div>
      )}

      {mode === "tone" && (
        <div className="ai-form">
          <label>Tom alvo</label>
          <select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
            {TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <div className="ai-actions">
            <button className="btn-secondary" onClick={close}>Fechar</button>
            <button className="btn-primary" onClick={() => toneMut.mutate()} disabled={busy}>
              {busy ? "Ajustando..." : "Ajustar"}
            </button>
          </div>
        </div>
      )}

      {(variationsMut.isError || rewriteMut.isError || toneMut.isError) && (
        <p className="err">A IA travou. Tenta de novo.</p>
      )}

      {results.length > 0 && (
        <div className="ai-results">
          {results.map((r, i) => (
            <div key={i} className="ai-result">
              <pre>{r}</pre>
              <button className="btn-primary" onClick={() => { onApply(r); close(); }}>
                Usar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
