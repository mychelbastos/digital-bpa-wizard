import { useRef, useState } from "react";
import { Crosshair, X, Copy } from "lucide-react";

// Ferramenta de LAYOUT (só para a conta master/super-admin): mede coordenadas em % sobre a
// folha do formulário, para posicionar as caixinhas dos campos sem "adivinhar". Ligado o modo,
// um overlay cobre a folha: mova o mouse p/ ver left/top ao vivo; arraste um retângulo p/ obter
// left/top/width/height (as mesmas unidades % que o layout usa). Copie e mande os valores.
//
// NUNCA aparece no PDF (data-html2canvas-ignore) nem para quem não é super-admin.
// Deve ser filho DIRETO do .form-sheet (usa o próprio retângulo como referência de %).

const f = (n: number) => n.toFixed(2);

export function EditorCoordenadas() {
  const [ativo, setAtivo] = useState(false);
  const ovRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [sel, setSel] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  const dragIni = useRef<{ x: number; y: number } | null>(null);
  const [copiado, setCopiado] = useState<string>("");

  const pctDe = (clientX: number, clientY: number) => {
    const r = ovRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 };
  };

  const onDown = (e: React.MouseEvent) => {
    const p = pctDe(e.clientX, e.clientY);
    dragIni.current = p;
    setSel({ l: p.x, t: p.y, w: 0, h: 0 });
  };
  const onMove = (e: React.MouseEvent) => {
    const p = pctDe(e.clientX, e.clientY);
    setCursor(p);
    if (dragIni.current) {
      const a = dragIni.current;
      setSel({ l: Math.min(a.x, p.x), t: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
    }
  };
  const onUp = () => { dragIni.current = null; };

  const copiar = (txt: string) => {
    try { navigator.clipboard.writeText(txt); setCopiado(txt); setTimeout(() => setCopiado(""), 1500); } catch { /* ignora */ }
  };

  const snippet = sel
    ? `left ${f(sel.l)}  top ${f(sel.t)}  width ${f(sel.w)}  height ${f(sel.h)}`
    : "";
  const digitBoxesSnippet = sel ? `digitBoxes([${f(sel.l)}], ${f(sel.w)})  // top ${f(sel.t)}` : "";

  return (
    <>
      {/* Botão flutuante — liga/desliga o modo. Só o super-admin vê este componente. */}
      <button
        type="button"
        data-html2canvas-ignore="true"
        onClick={() => { setAtivo((v) => !v); setSel(null); }}
        title="Editor de coordenadas (só master)"
        className={`fixed bottom-4 right-4 z-[80] flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold shadow-lg ${ativo ? "bg-rose-600 text-white" : "bg-slate-800 text-white hover:bg-slate-700"}`}
      >
        <Crosshair className="size-4" /> {ativo ? "Coordenadas: ON" : "Coordenadas"}
      </button>

      {ativo && (
        <>
          {/* Overlay sobre a folha: captura o mouse p/ medir. */}
          <div
            ref={ovRef}
            data-html2canvas-ignore="true"
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={() => setCursor(null)}
            className="absolute inset-0 z-[70] cursor-crosshair"
            style={{ background: "rgba(37,99,235,0.04)" }}
          >
            {sel && (
              <div
                className="absolute border-2 border-rose-500 bg-rose-500/10"
                style={{ left: `${sel.l}%`, top: `${sel.t}%`, width: `${sel.w}%`, height: `${sel.h}%` }}
              />
            )}
          </div>

          {/* Painel de leitura (fixo, fora da folha) — não é capturado no PDF. */}
          <div
            data-html2canvas-ignore="true"
            className="fixed bottom-16 right-4 z-[80] w-72 rounded-lg border border-slate-300 bg-white p-3 text-xs shadow-xl"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-bold text-slate-800">Coordenadas (% da folha)</span>
              <button type="button" onClick={() => setAtivo(false)} className="text-slate-400 hover:text-slate-700"><X className="size-4" /></button>
            </div>
            <p className="text-slate-500">Cursor: {cursor ? `${f(cursor.x)} , ${f(cursor.y)}` : "—"}</p>
            <p className="mt-1 text-slate-500">Arraste um retângulo onde a caixinha deve ficar.</p>
            {sel && (
              <div className="mt-2 space-y-1.5">
                <div className="rounded bg-slate-100 p-1.5 font-mono text-[11px] text-slate-800">{snippet}</div>
                <div className="rounded bg-slate-100 p-1.5 font-mono text-[11px] text-slate-800">{digitBoxesSnippet}</div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => copiar(snippet)} className="flex flex-1 items-center justify-center gap-1 rounded bg-primary px-2 py-1 font-semibold text-primary-foreground hover:bg-primary/90"><Copy className="size-3" /> copiar</button>
                  <button type="button" onClick={() => setSel(null)} className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50">limpar</button>
                </div>
                {copiado && <p className="text-emerald-600">copiado!</p>}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
