import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Save, X, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  /** Nome sugerido (pré-preenchido) ao abrir. */
  defaultNome: string;
  /** true quando é uma ficha já existente sendo re-salva (muda o texto do título). */
  atualizando: boolean;
  /** true quando é "Salvar como…" — sempre cria uma cópia nova, nunca sobrescreve. */
  comoNovo?: boolean;
  onSalvar: (nome: string) => void | Promise<void>;
  onClose: () => void;
}

// Diálogo de "Salvar na nuvem": pede o nome da ficha (pré-preenchido) antes de gravar.
export function SalvarFichaModal({ open, defaultNome, atualizando, comoNovo, onSalvar, onClose }: Props) {
  const [nome, setNome] = useState(defaultNome);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ao abrir, repõe o nome sugerido e seleciona tudo p/ facilitar reescrever.
  useEffect(() => {
    if (!open) return;
    setNome(defaultNome);
    setSalvando(false);
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); };
  }, [open, defaultNome, onClose]);

  if (!open) return null;

  const confirmar = async () => {
    const titulo = nome.trim() || defaultNome.trim() || "Ficha BPA-I";
    setSalvando(true);
    await onSalvar(titulo);
    // o pai fecha o modal em caso de sucesso; se voltar, destrava o botão
    setSalvando(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4" role="dialog" aria-modal="true">
      <button aria-label="Fechar" className="fixed inset-0 cursor-default bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <div className="relative my-auto w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <button type="button" aria-label="Fechar" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>

        <div className="flex flex-col items-center px-6 pt-7 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
            <Save className="size-6" />
          </div>
          <h2 className="mt-3 text-lg font-semibold text-foreground">
            {comoNovo ? "Salvar como nova ficha" : atualizando ? "Salvar alterações" : "Salvar ficha na nuvem"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {comoNovo
              ? "Cria uma cópia independente — a ficha original não é alterada."
              : "Dê um nome para localizar esta ficha depois em “Minhas fichas”."}
          </p>
        </div>

        <div className="px-6 pb-2 pt-5">
          <label htmlFor="ficha-nome" className="mb-1.5 block text-xs font-medium text-foreground">Nome da ficha</label>
          <input
            id="ficha-nome"
            ref={inputRef}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !salvando) confirmar(); }}
            placeholder="Ex.: João · 07/07/2026 · Folha 001"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 transition focus:border-primary focus:ring-2"
          />
        </div>

        <div className="flex justify-end gap-2 px-6 pb-6 pt-4">
          <button type="button" onClick={onClose} disabled={salvando} className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60">
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={salvando} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
            {salvando ? <><Loader2 className="size-4 animate-spin" /> Salvando…</> : <><Save className="size-4" /> Salvar</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
