import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Printer, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/imprimir")({
  head: () => ({ meta: [{ title: "Imprimir fichas — BPA" }] }),
  component: ImprimirPage,
});

interface Item { tipo: "BPA-C" | "BPA-I" | "RAAS"; id: string }

// itens = "I~<id>,C~<id>,R~<id>,…" (I = BPA-I, C = BPA-C, R = RAAS). Passado por "Minhas fichas".
function parseItens(): Item[] {
  const raw = new URLSearchParams(window.location.search).get("itens") ?? "";
  return raw
    .split(",")
    .map((tok) => {
      const [t, id] = tok.split("~");
      const tipo: Item["tipo"] = t === "C" ? "BPA-C" : t === "R" ? "RAAS" : "BPA-I";
      return { tipo, id } as Item;
    })
    .filter((x) => x.id);
}
const rotaEditor = (it: Item) => (it.tipo === "BPA-C" ? "/bpa-c-v3" : it.tipo === "RAAS" ? "/raas-folha" : "/bpa-i-v3");

const TIMEOUT_MS = 30000; // trava de segurança por ficha

// pages = imagens A4 acumuladas (uma ficha pode devolver mais de uma folha);
// done = quantas fichas já foram processadas (define qual é a próxima a capturar).
interface Estado { pages: (string | null)[]; done: number }

function ImprimirPage() {
  const [itens] = useState<Item[]>(() => (typeof window !== "undefined" ? parseItens() : []));
  const [estado, setEstado] = useState<Estado>({ pages: [], done: 0 });
  const jaImprimiu = useRef(false);
  const idx = estado.done;
  const concluido = itens.length > 0 && estado.done >= itens.length;

  // Recebe as imagens que cada iframe (ficha) devolve. Uma ficha pode mandar N folhas.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { tipo?: string; imgs?: string[]; img?: string } | null;
      if (!d || d.tipo !== "bpa-captura") return;
      const pages = Array.isArray(d.imgs) ? d.imgs : d.img ? [d.img] : [];
      setEstado((s) => ({ pages: [...s.pages, ...(pages.length ? pages : [null])], done: s.done + 1 }));
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Trava de segurança: se a ficha atual não responder a tempo, marca falha e avança.
  useEffect(() => {
    if (concluido || itens.length === 0) return;
    const alvo = idx;
    const t = window.setTimeout(() => setEstado((s) => (s.done === alvo ? { pages: [...s.pages, null], done: s.done + 1 } : s)), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [idx, concluido, itens.length]);

  // Terminou tudo → abre a impressão do navegador (uma vez).
  useEffect(() => {
    if (!concluido || jaImprimiu.current) return;
    jaImprimiu.current = true;
    const t = window.setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [concluido]);

  const okCount = estado.pages.filter(Boolean).length;
  const falhas = estado.pages.filter((c) => c === null).length;

  if (itens.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/40 text-sm text-muted-foreground">
        Nenhuma ficha para imprimir.
        <a href="/minhas-fichas" className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 font-medium text-foreground hover:bg-muted"><ArrowLeft className="size-4" /> Voltar</a>
      </div>
    );
  }

  return (
    <div className="imprimir-root min-h-screen bg-neutral-200">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .imprimir-root { min-height: 0 !important; background: #fff !important; }
          .no-print { display: none !important; }
          .folhas-wrap { max-width: none !important; margin: 0 !important; padding: 0 !important; }
          /* Uma ficha por página A4. A proporção da ficha (1653:2339) dá 297,15mm de ALTURA a
             210mm de largura — sempre um tico maior que a A4 —, então NUNCA dimensionar pela
             largura: a imagem é fixada pela ALTURA em 296mm (1mm a menos que a página, sem
             estouro). A quebra é BEFORE entre folhas (o seletor ~ ignora placeholders de falha),
             assim não há página em branco no começo nem folha extra no fim. */
          .folha-print {
            margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: 0 !important;
            line-height: 0; text-align: center;
            break-inside: avoid; page-break-inside: avoid;
          }
          .folha-print ~ .folha-print { break-before: page; page-break-before: always; }
          .folha-print img { display: block; margin: 0 auto; width: auto !important; height: 296mm !important; max-width: 100% !important; }
        }
      `}</style>

      {/* Barra de progresso / ações (não sai na impressão). */}
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <a href="/minhas-fichas" className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"><ArrowLeft className="size-4" /> Voltar</a>
        {!concluido ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Preparando ficha {Math.min(idx + 1, itens.length)} de {itens.length}…</span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground">
            {okCount} folha{okCount === 1 ? "" : "s"} pronta{okCount === 1 ? "" : "s"}{falhas > 0 ? ` · ${falhas} falhou(aram)` : ""}.
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              Na janela de impressão, deixe <strong>Margens: Nenhuma</strong> (senão o Chrome adiciona uma página em branco).
            </span>
          </span>
        )}
        <button
          onClick={() => window.print()}
          disabled={!concluido || okCount === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        ><Printer className="size-4" /> Imprimir</button>
      </div>

      {/* Iframe de captura da ficha atual: oculto e fora da impressão. Uma por vez (key=idx). */}
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
        {estado.pages.map((img, i) =>
          img ? (
            <div key={i} className="folha-print mx-auto mb-4 bg-white shadow">
              <img src={img} alt={`Folha ${i + 1}`} className="block w-full" />
            </div>
          ) : (
            <div key={i} className="no-print mx-auto mb-4 flex h-24 items-center justify-center rounded border border-dashed border-rose-300 bg-rose-50 text-xs text-rose-600">
              Uma ficha falhou ao preparar (pulada).
            </div>
          ),
        )}
        {!concluido && (
          <div className="no-print flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Montando as folhas…
          </div>
        )}
      </div>
    </div>
  );
}
