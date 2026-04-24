import { useEffect, ReactNode } from "react";
import { Button } from "./Button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

export function Modal({ open, onClose, title, children, footer, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const maxWidth = size === "sm" ? 400 : size === "lg" ? 640 : 480;

  return (
    <div className="lume-modal-scrim" onClick={onClose} role="dialog" aria-modal>
      <div className="lume-modal" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">×</Button>
          </div>
        )}
        <div>{children}</div>
        {footer && <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title = "Tem certeza?",
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{cancelLabel}</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ color: "var(--lume-text-muted)", fontSize: 14, margin: 0 }}>{message}</p>
    </Modal>
  );
}
