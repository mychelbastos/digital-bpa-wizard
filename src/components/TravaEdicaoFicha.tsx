import { Lock, Pencil } from "lucide-react";

// Camada de proteção contra ALTERAÇÃO ACIDENTAL de uma ficha já salva. Quando `travado`, um
// overlay transparente cobre a folha e bloqueia os cliques nos campos (sem precisar tornar
// cada input read-only), e um botão fixo "EDITAR FICHA" libera a edição. Deve ser filho do
// container .form-sheet (usa `absolute inset-0`). Nunca entra no PDF (data-html2canvas-ignore).
//
// Fluxo: nova ficha = destravada (criando); ao SALVAR e ao ABRIR uma ficha salva = travada;
// clicar EDITAR FICHA = destrava.
export function TravaEdicaoFicha({ travado, onEditar }: { travado: boolean; onEditar: () => void }) {
  if (!travado) return null;
  return (
    <>
      {/* Bloqueador dos campos (transparente; só captura cliques). Rolagem segue normal. */}
      <div
        data-html2canvas-ignore="true"
        className="absolute inset-0 z-[55] cursor-not-allowed"
        style={{ background: "rgba(15,23,42,0.03)" }}
        onMouseDown={(e) => e.preventDefault()}
        title="Ficha protegida — clique em EDITAR FICHA para alterar"
      />
      {/* Botão fixo, sempre visível ao rolar. */}
      <div
        data-html2canvas-ignore="true"
        className="fixed left-1/2 top-20 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-300 bg-white px-4 py-2 text-sm shadow-lg"
      >
        <span className="flex items-center gap-1.5 font-medium text-amber-800">
          <Lock className="size-4" /> Ficha salva — protegida
        </span>
        <button
          type="button"
          onClick={onEditar}
          className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Pencil className="size-3.5" /> EDITAR FICHA
        </button>
      </div>
    </>
  );
}
