import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Printer, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/imprimir")({
  head: () => ({ meta: [{ title: "Imprimir fichas — BPA" }] }),
  component: ImprimirPage,
});

interface Item { tipo: "BPA-C" | "BPA-I"; id: string }

// itens = "I~<id>,C~<id>,…" (I = BPA-I, C = BPA-C). Passado por "Minhas fichas".
function parseItens(): Item[] {
  const raw = new URLSearchParams(window.location.search).get("itens") ?? "";
  return raw
    .split(",")
    .map((tok) => { const [t, id] = tok.split("~"); return { tipo: t === "C" ? "BPA-C" : "BPA-I", id } as Item; })
    .filter((x) => x.id);
}
const rotaEditor = (it: Item) => (it.tipo === "BPA-C" ? "/bpa-c-v3" : "/bpa-i-v3");

const TIMEOUT_MS = 25000; // trava de segurança por folha

function ImprimirPage() {
  const [itens] = useState<Item[]>(() => (typeof window !== "undefined" ? parseItens() : []));
  // Resultado por folha, na ordem: dataURL da imagem ou null (falhou). O próximo a capturar
  // é sempre o de índice = capturas.length (captura sequencial, um iframe por vez).
  const [capturas, setCapturas] = useState<(string | null)[]>([]);
  const [pronto, setPronto] = useState(false);
  const jaImprimiu = useRef(false);
  const idx = capturas.length;
  const concluido = itens.length > 0 && idx >= itens.length;

  // Escuta as imagens que cada iframe (folha) devolve.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { tipo?: string; img?: string } | null;
      if (!d || d.tipo !== "bpa-captura") return;
      setCapturas((prev) => [...prev, d.img ?? null]);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Trava de segurança: se a folha atual não responder a tempo, marca como falha e avança.
  useEffect(() => {
    if (concluido || itens.length === 0) return;
    const alvo = idx;
    const t = window.setTimeout(() => setCapturas((prev) => (prev.length === alvo ? [...prev, null] : prev)), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [idx, concluido, itens.length]);

  // Terminou de capturar tudo → abre a impressão do navegador (uma vez).
  useEffect(() => {
    if (!concluido || jaImprimiu.current) return;
    jaImprimiu.current = true;
    setPronto(true);
    const t = window.setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [concluido]);

  const okCount = capturas.filter(Boolean).length;
  const falhas = capturas.filter((c) => c === null).length;

  if (itens.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/40 text-sm text-muted-foreground">
        Nenhuma ficha para imprimir.
        <a href="/minhas-fichas" className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 font-medium text-foreground hover:bg-muted"><ArrowLeft className="size-4" /> Voltar</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-200">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .folhas-wrap { max-width: none !important; margin: 0 !important; padding: 0 !important; }
          /* Cada folha = EXATAMENTE uma página A4. A imagem (aspecto ~A4) é contida dentro
             dos 210×297mm (width/height auto + max 100%), então nunca estoura para a página
             seguinte — antes cada folha virava 2 páginas (25 fichas → 51 páginas). */
          .folha-print {
            margin: 0 !important; padding: 0 !important; box-shadow: none !important;
            width: 210mm; height: 297mm; display: flex; align-items: center; justify-content: center;
            overflow: hidden; page-break-after: always; break-after: page;
            page-break-inside: avoid; break-inside: avoid;
          }
          .folha-print:last-child { page-break-after: auto; break-after: auto; }
          .folha-print img { max-width: 100%; max-height: 100%; width: auto; height: auto; display: block; }
        }
      `}</style>

      {/* Barra de progresso / ações (não sai na impressão). */}
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <a href="/minhas-fichas" className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"><ArrowLeft className="size-4" /> Voltar</a>
        {!concluido ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Preparando folha {Math.min(idx + 1, itens.length)} de {itens.length}…</span>
        ) : (
          <span className="text-sm text-foreground">{okCount} folha{okCount === 1 ? "" : "s"} pronta{okCount === 1 ? "" : "s"}{falhas > 0 ? ` · ${falhas} falhou(aram)` : ""}.</span>
        )}
        <button
          onClick={() => window.print()}
          disabled={!concluido || okCount === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        ><Printer className="size-4" /> Imprimir</button>
      </div>

      {/* Iframe de captura da folha atual: oculto e fora da impressão. Um por vez (key=idx). */}
      {!concluido && (
        <iframe
          key={idx}
          title="captura"
          className="no-print"
          style={{ position: "fixed", left: -10000, top: 0, width: 1200, height: 1500, border: 0 }}
          src={`${rotaEditor(itens[idx])}?ficha=${itens[idx].id}&capture=1`}
        />
      )}

      {/* Folhas capturadas — uma por página A4 na impressão. */}
      <div className="folhas-wrap mx-auto max-w-[820px] py-4">
        {capturas.map((img, i) =>
          img ? (
            <div key={i} className="folha-print mx-auto mb-4 bg-white shadow">
              <img src={img} alt={`Folha ${i + 1}`} className="block w-full" />
            </div>
          ) : (
            <div key={i} className="no-print mx-auto mb-4 flex h-24 items-center justify-center rounded border border-dashed border-rose-300 bg-rose-50 text-xs text-rose-600">
              Folha {i + 1}: falha ao preparar (pulada).
            </div>
          ),
        )}
        {!pronto && (
          <div className="no-print flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Montando as folhas…
          </div>
        )}
      </div>
    </div>
  );
}
