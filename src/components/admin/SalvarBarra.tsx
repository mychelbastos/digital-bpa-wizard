// Barra "Alterações não salvas · Descartar · Salvar" (fixa no rodapé da área de conteúdo).
import { Loader2 } from "lucide-react";
import { btnOutline, btnPrimario } from "./ui";

export function SalvarBarra({
  visivel,
  salvando,
  onDescartar,
  onSalvar,
  rotuloSalvar = "Salvar alterações",
}: {
  visivel: boolean;
  salvando: boolean;
  onDescartar: () => void;
  onSalvar: () => void;
  rotuloSalvar?: string;
}) {
  if (!visivel) return null;
  return (
    <div
      role="region"
      aria-label="Alterações não salvas"
      className="sticky bottom-4 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-card px-5 py-3 shadow-lg"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span aria-hidden="true" className="size-2 rounded-full bg-amber-500" /> Alterações não
        salvas
      </span>
      <div className="flex gap-2">
        <button type="button" onClick={onDescartar} disabled={salvando} className={btnOutline}>
          Descartar
        </button>
        <button type="button" onClick={onSalvar} disabled={salvando} className={btnPrimario}>
          {salvando && <Loader2 className="size-4 animate-spin" />} {rotuloSalvar}
        </button>
      </div>
    </div>
  );
}
