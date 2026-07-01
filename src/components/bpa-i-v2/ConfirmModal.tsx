import { useEffect, type ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Modal de confirmação estilizado (substitui o confirm() nativo do navegador).
export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button aria-label="Fechar" className="absolute inset-0 cursor-default bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {children && <div className="mt-3 text-sm text-muted-foreground">{children}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium ${danger ? "bg-destructive text-white hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
