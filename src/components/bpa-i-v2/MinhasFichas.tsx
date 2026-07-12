import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, X, Trash2, FilePlus2, Loader2, Pencil, Check } from "lucide-react";
import { listarFichas, excluirFicha, renomearFicha, type FichaResumo } from "@/lib/bpa-i-v2/fichas";

interface Props {
  open: boolean;
  fichaAtualId: string | null;
  onClose: () => void;
  onCarregar: (id: string, titulo: string) => void;
  onNova: () => void;
  /** Chamado quando a ficha renomeada é a que está aberta no formulário agora. */
  onRenomeada?: (id: string, titulo: string) => void;
  /** Filtra as fichas por tipo (omitido = todas). */
  tipo?: "BPA-C" | "BPA-I";
}

// Lista de fichas salvas no Supabase (do usuário logado). Abrir / nova / excluir.
export function MinhasFichas({ open, fichaAtualId, onClose, onCarregar, onNova, onRenomeada, tipo }: Props) {
  const [fichas, setFichas] = useState<FichaResumo[]>([]);
  const [carregando, setCarregando] = useState(false);
  // Renomear inline: id em edição + valor do input.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCarregando(true);
    setEditandoId(null);
    listarFichas(tipo).then((f) => { setFichas(f); setCarregando(false); });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, tipo]);

  if (!open) return null;

  const excluir = async (id: string) => {
    if (await excluirFicha(id)) setFichas((prev) => prev.filter((f) => f.id !== id));
  };

  const iniciarRenomeio = (f: FichaResumo) => {
    setEditandoId(f.id);
    setNovoNome(f.titulo || "");
    setTimeout(() => { editInputRef.current?.focus(); editInputRef.current?.select(); }, 30);
  };

  const confirmarRenomeio = async (id: string) => {
    const titulo = novoNome.trim();
    if (!titulo) { setEditandoId(null); return; }
    setSalvandoNome(true);
    const ok = await renomearFicha(id, titulo);
    setSalvandoNome(false);
    if (ok) {
      setFichas((prev) => prev.map((f) => (f.id === id ? { ...f, titulo } : f)));
      if (id === fichaAtualId) onRenomeada?.(id, titulo);
    }
    setEditandoId(null);
  };

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }
    catch { return iso; }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4" role="dialog" aria-modal="true">
      <button aria-label="Fechar" className="fixed inset-0 cursor-default bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <div className="relative my-auto max-h-[calc(100vh-2rem)] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <button type="button" aria-label="Fechar" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>

        <div className="flex flex-col items-center px-6 pt-7 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
            <FolderOpen className="size-6" />
          </div>
          <h2 className="mt-3 text-lg font-semibold text-foreground">Minhas fichas</h2>
          <p className="mt-1 text-xs text-muted-foreground">Abra, renomeie ou comece uma nova ficha.</p>
        </div>

        <div className="px-6 pt-4">
          <button onClick={() => { onNova(); onClose(); }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
            <FilePlus2 className="size-4" /> Nova ficha
          </button>
        </div>

        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto px-6 py-4">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando...
            </div>
          ) : fichas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma ficha salva ainda.</p>
          ) : (
            fichas.map((f) => (
              <div key={f.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${f.id === fichaAtualId ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                {editandoId === f.id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      ref={editInputRef}
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !salvandoNome) confirmarRenomeio(f.id);
                        if (e.key === "Escape") { e.stopPropagation(); setEditandoId(null); }
                      }}
                      className="min-w-0 flex-1 rounded-md border border-primary bg-background px-2 py-1 text-sm text-foreground outline-none ring-2 ring-primary/30"
                    />
                    <button aria-label="Confirmar novo nome" onClick={() => confirmarRenomeio(f.id)} disabled={salvandoNome} className="shrink-0 rounded-md p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:opacity-60">
                      {salvandoNome ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    </button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => { onCarregar(f.id, f.titulo || "Ficha BPA-I"); onClose(); }} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-medium text-foreground">{f.titulo || "Ficha BPA-I"}</div>
                      <div className="text-xs text-muted-foreground">{f.competencia ? `Comp. ${f.competencia} · ` : ""}{fmt(f.updated_at)}{f.id === fichaAtualId ? " · atual" : ""}</div>
                    </button>
                    <button aria-label="Renomear" onClick={() => iniciarRenomeio(f)} className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <Pencil className="size-4" />
                    </button>
                    <button aria-label="Excluir" onClick={() => excluir(f.id)} className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
