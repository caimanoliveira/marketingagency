import { useEffect, useState } from "react";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  durationMs?: number;
}

type Listener = (items: ToastItem[]) => void;

const state: { items: ToastItem[]; listeners: Set<Listener> } = {
  items: [],
  listeners: new Set(),
};

function emit() {
  for (const l of state.listeners) l(state.items);
}

export function toast(item: Omit<ToastItem, "id">): string {
  const id = String(Date.now()) + Math.random().toString(36).slice(2, 8);
  const full: ToastItem = { ...item, id, durationMs: item.durationMs ?? 4000 };
  state.items = [...state.items, full];
  emit();
  if (full.durationMs && full.durationMs > 0) {
    setTimeout(() => dismissToast(id), full.durationMs);
  }
  return id;
}

export function dismissToast(id: string) {
  state.items = state.items.filter((t) => t.id !== id);
  emit();
}

export const toasts = {
  success: (title: string, description?: string) => toast({ kind: "success", title, description }),
  error: (title: string, description?: string) => toast({ kind: "error", title, description, durationMs: 6000 }),
  info: (title: string, description?: string) => toast({ kind: "info", title, description }),
};

export function useToastList(): ToastItem[] {
  const [items, setItems] = useState<ToastItem[]>(state.items);
  useEffect(() => {
    const listener: Listener = (next) => setItems(next);
    state.listeners.add(listener);
    return () => { state.listeners.delete(listener); };
  }, []);
  return items;
}

export function ToastContainer() {
  const items = useToastList();
  if (items.length === 0) return null;
  return (
    <div className="lume-toast-container" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`lume-toast lume-toast-${t.kind}`}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{t.title}</div>
            {t.description && <div style={{ color: "var(--lume-text-muted)", fontSize: 13, marginTop: 2 }}>{t.description}</div>}
          </div>
          <button
            onClick={() => dismissToast(t.id)}
            aria-label="Fechar"
            style={{ background: "transparent", border: 0, color: "var(--lume-text-soft)", cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}
          >×</button>
        </div>
      ))}
    </div>
  );
}
