import { useEffect, useMemo, useState } from "react";
import type { jsPDF } from "jspdf";
import { Download, Printer, X, Loader2 } from "lucide-react";

// Modal ÚNICO de pré-visualização de PDF: mostra o relatório num iframe ANTES de baixar.
// Recebe um jsPDF já construído + o nome do arquivo. Botões: Baixar e Imprimir.
// Usado por todos os relatórios do sistema para padronizar "ver antes de baixar".
export function PreviewPdfModal({ pdf, filename, titulo = "Pré-visualização do relatório", onClose }: {
  pdf: jsPDF;
  filename: string;
  titulo?: string;
  onClose: () => void;
}) {
  // Gera o blob uma vez e monta uma URL para o iframe; revoga ao fechar (evita vazamento).
  const url = useMemo(() => {
    try { return URL.createObjectURL(pdf.output("blob")); } catch { return ""; }
  }, [pdf]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => { window.removeEventListener("keydown", onEsc); if (url) URL.revokeObjectURL(url); };
  }, [onClose, url]);

  const baixar = () => { try { pdf.save(filename); } catch { /* noop */ } };
  const imprimir = () => {
    // Imprime a partir da própria visualização (mesma URL do blob), sem baixar.
    try { pdf.autoPrint(); const w = window.open(url, "_blank"); if (!w) baixar(); } catch { baixar(); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-foreground/50 backdrop-blur-sm sm:p-4" onMouseDown={onClose}>
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-card shadow-xl sm:rounded-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold text-foreground">
            <span className="truncate">{titulo}</span>
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={imprimir} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              <Printer className="size-4" /> <span className="hidden sm:inline">Imprimir</span>
            </button>
            <button onClick={baixar} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Download className="size-4" /> Baixar PDF
            </button>
            <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
          </div>
        </header>
        <div className="relative min-h-0 flex-1 bg-muted/40">
          {carregando && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
          {url ? (
            <iframe src={url} title={titulo} className="h-full w-full" onLoad={() => setCarregando(false)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
              Não foi possível pré-visualizar aqui. Use o botão abaixo para baixar.
              <button onClick={baixar} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Download className="size-4" /> Baixar PDF</button>
            </div>
          )}
        </div>
        <p className="border-t border-border px-4 py-2 text-center text-[11px] text-muted-foreground">
          Confira o conteúdo antes de baixar. No celular, se a prévia não abrir, use “Baixar PDF”.
        </p>
      </div>
    </div>
  );
}

// Hook prático: estado + nó do modal. `abrirPreview(pdf, filename, titulo?)` mostra a prévia.
export function usePreviewPdf() {
  const [state, setState] = useState<{ pdf: jsPDF; filename: string; titulo?: string } | null>(null);
  const abrirPreview = (pdf: jsPDF, filename: string, titulo?: string) => setState({ pdf, filename, titulo });
  const previewNode = state
    ? <PreviewPdfModal pdf={state.pdf} filename={state.filename} titulo={state.titulo} onClose={() => setState(null)} />
    : null;
  return { abrirPreview, previewNode };
}
