import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from "react";
import { FileDown, Eraser, Ruler, Pencil, Copy, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { exportSheetPdf } from "@/lib/export-pdf";
import laudoBg from "@/assets/laudo-aih.png";
import { CAMPOS, CHECKS, type Campo } from "@/lib/laudo-aih-layout";

export const Route = createFileRoute("/laudo-aih")({
  head: () => ({ meta: [{ title: "Laudo AIH — Solicitação de Internação Hospitalar" }] }),
  component: LaudoAihPage,
});

const STORAGE_KEY = "laudo-aih-state-v1";
const RECTS_KEY = "laudo-aih-rects-v1";
const CHECK_W = 1.4;
const CHECK_H = 1.0;

interface Rect { top: number; left: number; width: number; height: number; }
interface Estado { txt: Record<string, string>; chk: Record<string, boolean>; }
const initial = (): Estado => ({ txt: {}, chk: {} });

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(100, n));

// Retângulo base de cada campo/checkbox (antes de qualquer ajuste do usuário).
const baseRectCampo = (c: Campo): Rect => ({ top: c.top, left: c.left, width: c.width, height: c.height ?? 1.3 });
const baseRectCheck = (t: number, l: number): Rect => ({ top: t, left: l, width: CHECK_W, height: CHECK_H });

function LaudoAihPage() {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>(initial);
  const [contornos, setContornos] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [editar, setEditar] = useState(false);
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setEstado({ ...initial(), ...JSON.parse(raw) });
      const rr = localStorage.getItem(RECTS_KEY);
      if (rr) setRects(JSON.parse(rr));
    } catch { /* ignora */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(estado)); } catch { /* */ } }, [estado]);
  useEffect(() => { try { localStorage.setItem(RECTS_KEY, JSON.stringify(rects)); } catch { /* */ } }, [rects]);

  const setTxt = (key: string, v: string) => setEstado((e) => ({ ...e, txt: { ...e.txt, [key]: v } }));
  // Exclusão mútua: marcar um checkbox de um grupo desmarca os demais do mesmo grupo.
  const toggle = (key: string) => setEstado((e) => {
    const marcado = e.chk[key];
    const grupo = CHECKS.find((c) => c.key === key)?.grupo;
    const chk = { ...e.chk };
    if (grupo && !marcado) CHECKS.forEach((c) => { if (c.grupo === grupo) chk[c.key] = false; });
    chk[key] = !marcado;
    return { ...e, chk };
  });

  // Retângulo efetivo (override do usuário, se houver).
  const rectCampo = (c: Campo): Rect => rects[c.key] ?? baseRectCampo(c);
  const rectCheck = (key: string, t: number, l: number): Rect => rects[key] ?? baseRectCheck(t, l);
  const setRect = (key: string, r: Rect) => setRects((prev) => ({ ...prev, [key]: { top: r1(clamp(r.top)), left: r1(clamp(r.left)), width: r1(Math.max(0.4, r.width)), height: r1(Math.max(0.3, r.height)) } }));

  const limpar = () => { if (confirm("Limpar todo o Laudo AIH?")) setEstado(initial()); };
  const restaurarLayout = () => { if (confirm("Descartar seus ajustes de posição e voltar ao layout padrão?")) { setRects({}); setSel(null); } };

  const baixarPdf = async () => {
    if (!sheetRef.current) return;
    setExportando(true);
    try { await exportSheetPdf(sheetRef.current, "laudo-aih.pdf"); toast.success("PDF gerado."); }
    catch { toast.error("Não foi possível gerar o PDF."); }
    finally { setExportando(false); }
  };

  // Gera o texto TS das coordenadas ajustadas (para colar no chat / no layout).
  const gerarCoords = () => {
    const linhaCampo = (c: Campo) => {
      const r = rectCampo(c);
      const h = r.height === 1.3 ? "" : `, height: ${r.height}`;
      return `  { key: "${c.key}", top: ${r.top}, left: ${r.left}, width: ${r.width}${h}${c.area ? ", area: true" : ""}${c.upper ? ", upper: true" : ""} },`;
    };
    const linhaCheck = (key: string, t: number, l: number) => {
      const r = rectCheck(key, t, l);
      return `  { key: "${key}", top: ${r.top}, left: ${r.left} },`;
    };
    return `export const CAMPOS: Campo[] = [\n${CAMPOS.map(linhaCampo).join("\n")}\n];\n\nexport const CHECKS: Check[] = [\n${CHECKS.map((c) => linhaCheck(c.key, c.top, c.left)).join("\n")}\n];`;
  };
  const copiarCoords = async () => {
    try { await navigator.clipboard.writeText(gerarCoords()); toast.success("Coordenadas copiadas."); }
    catch { toast.error("Copie manualmente do quadro."); }
  };

  const pct = (n: number) => `${n}%`;
  const contornoCls = contornos ? "outline outline-1 outline-sky-400/70" : "";
  const selRect = sel ? rects[sel] ?? (CAMPOS.find((c) => c.key === sel) ? baseRectCampo(CAMPOS.find((c) => c.key === sel)!) : (() => { const ch = CHECKS.find((c) => c.key === sel)!; return baseRectCheck(ch.top, ch.left); })()) : null;
  const selEhCheck = sel ? CHECKS.some((c) => c.key === sel) : false;

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
            <h1 className="text-base font-semibold">Laudo AIH</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setEditar((e) => !e)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${editar ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border bg-card text-foreground hover:bg-muted"}`}>
              <Pencil className="size-4" /> {editar ? "Editando posições" : "Editar posições"}
            </button>
            {editar ? (
              <>
                <button onClick={copiarCoords} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Copy className="size-4" /> Copiar coordenadas</button>
                <button onClick={() => setExportOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">Ver quadro</button>
                <button onClick={restaurarLayout} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"><RotateCcw className="size-4" /> Restaurar</button>
              </>
            ) : (
              <>
                <button onClick={() => setContornos((c) => !c)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${contornos ? "border-sky-400 bg-sky-50 text-sky-700" : "border-border bg-card text-foreground hover:bg-muted"}`}><Ruler className="size-4" /> Contornos</button>
                <button onClick={limpar} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"><Eraser className="size-4" /> Limpar</button>
                <button onClick={baixarPdf} disabled={exportando} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"><FileDown className="size-4" /> {exportando ? "Gerando…" : "Baixar PDF"}</button>
              </>
            )}
          </div>
        </div>
        {editar && (
          <div className="mx-auto mt-2 max-w-[1100px] text-xs text-muted-foreground">
            Arraste as caixas para posicionar; arraste o canto inferior-direito para redimensionar. Clique numa caixa para ajustar os números com precisão. As setas do teclado movem a caixa selecionada. Ao terminar, clique em <strong>Copiar coordenadas</strong> e me mande no chat.
          </div>
        )}
      </header>

      <main className="mx-auto mt-4 max-w-[1100px] px-4">
        <div ref={sheetRef} className="form-sheet" style={{ aspectRatio: "1544 / 2204", containerType: "inline-size" }} onPointerDown={() => editar && setSel(null)}>
          <img src={laudoBg} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />

          {!editar && CAMPOS.map((c) => {
            const r = rectCampo(c);
            const style = { top: pct(r.top), left: pct(r.left), width: pct(r.width), height: pct(r.height) } as const;
            const val = estado.txt[c.key] ?? "";
            if (c.data) return <DataHoraCampo key={c.key} campo={c} rect={r} value={val} onChange={(v) => setTxt(c.key, v)} contornoCls={contornoCls} segmentos={[2, 2, 4]} />;
            if (c.hora) return <DataHoraCampo key={c.key} campo={c} rect={r} value={val} onChange={(v) => setTxt(c.key, v)} contornoCls={contornoCls} segmentos={[2, 2]} />;
            if (c.celulas) return <DataHoraCampo key={c.key} campo={c} rect={r} value={val} onChange={(v) => setTxt(c.key, v)} contornoCls={contornoCls} segmentos={Array(c.celulas).fill(1)} uniforme />;
            if (c.area) return <textarea key={c.key} value={val} onChange={(e) => setTxt(c.key, filtrar(c, e.target.value))} className={`form-text absolute resize-none whitespace-pre-wrap ${contornoCls}`} style={{ ...style, textAlign: "left", lineHeight: 1.2 }} />;
            return <input key={c.key} value={val} inputMode={c.num ? "numeric" : undefined} onChange={(e) => setTxt(c.key, filtrar(c, e.target.value))} className={`form-text absolute ${contornoCls}`} style={style} />;
          })}
          {!editar && CHECKS.map((c) => {
            const r = rectCheck(c.key, c.top, c.left);
            return (
              <button key={c.key} type="button" onClick={() => toggle(c.key)} className={`absolute flex items-center justify-center ${contornoCls}`} style={{ top: pct(r.top), left: pct(r.left), width: pct(r.width), height: pct(r.height) }} aria-label={c.key}>
                {estado.chk[c.key] && <span className="text-[#0a2540]" style={{ fontSize: "min(2.6cqw, 16px)", fontWeight: 800, lineHeight: 1 }}>✕</span>}
              </button>
            );
          })}

          {/* Modo edição: caixas arrastáveis/redimensionáveis */}
          {editar && CAMPOS.map((c) => (
            <CaixaEditavel key={c.key} rect={rectCampo(c)} label={c.key} resizable selecionado={sel === c.key} sheetRef={sheetRef}
              onSelect={() => setSel(c.key)} onChange={(r) => setRect(c.key, r)} />
          ))}
          {editar && CHECKS.map((c) => (
            <CaixaEditavel key={c.key} rect={rectCheck(c.key, c.top, c.left)} label={c.key} selecionado={sel === c.key} sheetRef={sheetRef} check
              onSelect={() => setSel(c.key)} onChange={(r) => setRect(c.key, r)} />
          ))}
        </div>

        {!editar && (
          <p className="mt-4 text-center text-[11px] text-muted-foreground">Salvo automaticamente neste navegador. Use <strong>Contornos</strong> para ver a posição dos campos.</p>
        )}
      </main>

      {/* Painel de ajuste fino do campo selecionado */}
      {editar && sel && selRect && (
        <PainelAjuste chave={sel} rect={selRect} check={selEhCheck} onChange={(r) => setRect(sel, r)} onClose={() => setSel(null)} />
      )}

      {/* Quadro de coordenadas p/ copiar */}
      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={() => setExportOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold">Coordenadas (copie e me mande)</h2>
              <div className="flex gap-2">
                <button onClick={copiarCoords} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"><Copy className="size-3.5" /> Copiar</button>
                <button onClick={() => setExportOpen(false)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
              </div>
            </div>
            <textarea readOnly value={gerarCoords()} className="h-[60vh] w-full resize-none bg-muted/30 p-3 font-mono text-[11px] outline-none" />
          </div>
        </div>
      )}
    </div>
  );
}

// Caixa arrastável e redimensionável (modo edição).
function CaixaEditavel({ rect, label, resizable, check, selecionado, sheetRef, onSelect, onChange }: {
  rect: Rect; label: string; resizable?: boolean; check?: boolean; selecionado: boolean;
  sheetRef: RefObject<HTMLDivElement | null>; onSelect: () => void; onChange: (r: Rect) => void;
}) {
  const drag = useRef<{ mode: "move" | "resize"; x: number; y: number; r: Rect; sw: number; sh: number } | null>(null);
  const start = (e: RPointerEvent, mode: "move" | "resize") => {
    e.preventDefault(); e.stopPropagation();
    onSelect();
    const s = sheetRef.current?.getBoundingClientRect();
    if (!s) return;
    drag.current = { mode, x: e.clientX, y: e.clientY, r: { ...rect }, sw: s.width, sh: s.height };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = ((e.clientX - d.x) / d.sw) * 100;
    const dy = ((e.clientY - d.y) / d.sh) * 100;
    if (d.mode === "move") onChange({ ...d.r, left: d.r.left + dx, top: d.r.top + dy });
    else onChange({ ...d.r, width: d.r.width + dx, height: d.r.height + dy });
  };
  const end = (e: RPointerEvent) => { drag.current = null; try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* */ } };
  return (
    <div
      onPointerDown={(e) => start(e, "move")} onPointerMove={move} onPointerUp={end}
      className={`absolute cursor-move overflow-hidden rounded-sm border text-[8px] leading-none ${selecionado ? "z-20 border-amber-500 bg-amber-400/25 ring-1 ring-amber-500" : check ? "border-rose-500/70 bg-rose-400/15" : "border-sky-500/70 bg-sky-400/12"}`}
      style={{ top: pctS(rect.top), left: pctS(rect.left), width: pctS(rect.width), height: pctS(rect.height) }}
      title={label}
    >
      <span className="pointer-events-none block truncate px-0.5 text-sky-900/70">{label}</span>
      {resizable && (
        <div onPointerDown={(e) => start(e, "resize")} onPointerMove={move} onPointerUp={end}
          className="absolute bottom-0 right-0 size-2 cursor-nwse-resize bg-amber-500" />
      )}
    </div>
  );
}
const pctS = (n: number) => `${n}%`;

// Painel flutuante de ajuste fino (números) + nudge por teclado.
function PainelAjuste({ chave, rect, check, onChange, onClose }: {
  chave: string; rect: Rect; check?: boolean; onChange: (r: Rect) => void; onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const step = e.shiftKey ? 1 : 0.1;
      if (e.key === "ArrowLeft") { e.preventDefault(); onChange({ ...rect, left: rect.left - step }); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onChange({ ...rect, left: rect.left + step }); }
      else if (e.key === "ArrowUp") { e.preventDefault(); onChange({ ...rect, top: rect.top - step }); }
      else if (e.key === "ArrowDown") { e.preventDefault(); onChange({ ...rect, top: rect.top + step }); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [rect, onChange]);
  const campo = (label: string, val: number, k: keyof Rect) => (
    <label className="flex items-center gap-1 text-xs">
      <span className="w-10 text-muted-foreground">{label}</span>
      <input type="number" step={0.1} value={val} onChange={(e) => onChange({ ...rect, [k]: Number(e.target.value) })}
        className="w-16 rounded border border-border bg-background px-1.5 py-1 text-right tabular-nums outline-none focus:border-primary" />
    </label>
  );
  return (
    <div className="fixed bottom-4 right-4 z-40 w-56 rounded-xl border border-border bg-card p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs font-semibold" title={chave}>{chave}</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:bg-muted"><X className="size-3.5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {campo("top", rect.top, "top")}
        {campo("left", rect.left, "left")}
        {!check && campo("larg.", rect.width, "width")}
        {!check && campo("alt.", rect.height, "height")}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Setas = mover · Shift+setas = passo maior.</p>
    </div>
  );
}

// Filtro de digitação por tipo do campo (só dígitos / só letras / limite).
function filtrar(c: Campo, v: string): string {
  if (c.num) { const s = v.replace(/\D/g, ""); return c.maxLen ? s.slice(0, c.maxLen) : s; }
  if (c.letras) { const s = v.replace(/[^A-Za-zÀ-ÿ]/g, "").toUpperCase(); return c.maxLen ? s.slice(0, c.maxLen) : s; }
  const s = c.upper ? v.toUpperCase() : v;
  return c.maxLen ? s.slice(0, c.maxLen) : s;
}

// Campo de data (dd/mm/aaaa) ou hora (hh:mm): sub-caixas numéricas com auto-avanço.
// O valor é guardado como "seg1|seg2|..." (separador que nunca aparece na tela).
function DataHoraCampo({ campo, rect, value, onChange, contornoCls, segmentos, uniforme }: {
  campo: Campo; rect: Rect; value: string; onChange: (v: string) => void; contornoCls: string; segmentos: number[]; uniforme?: boolean;
}) {
  const partes = (value || "").split("|");
  const vals = segmentos.map((_, i) => partes[i] ?? "");
  // Frações da largura por segmento. `uniforme` = células iguais de 1 dígito (ex.: código do
  // caráter). Senão: data (ano ganha mais espaço p/ 4 dígitos) ou hora (2 iguais).
  const uniformePos = (): number[][] => {
    const n = segmentos.length, gap = 0.12;
    const cw = (1 - gap * (n - 1)) / n;
    return segmentos.map((_, i) => { const s = i * (cw + gap); return [s, s + cw]; });
  };
  const pos = uniforme ? uniformePos() : segmentos.length === 3 ? [[0, 0.21], [0.29, 0.50], [0.56, 1.0]] : [[0, 0.46], [0.54, 1.0]];
  const focar = (i: number) => (document.getElementById(`seg-${campo.key}-${i}`) as HTMLInputElement | null)?.focus();
  const onSeg = (i: number, digs: string) => {
    const nv = digs.replace(/\D/g, "").slice(0, segmentos[i]);
    const arr = segmentos.map((_, j) => (j === i ? nv : vals[j]));
    onChange(arr.join("|"));
    if (nv.length === segmentos[i] && nv.length > vals[i].length && i < segmentos.length - 1) focar(i + 1);
  };
  return (
    <>
      {segmentos.map((_, i) => (
        <input key={i} id={`seg-${campo.key}-${i}`} value={vals[i]} inputMode="numeric"
          onChange={(e) => onSeg(i, e.target.value)}
          className={`form-text absolute ${contornoCls}`}
          style={{ top: pctS(rect.top), left: pctS(rect.left + rect.width * pos[i][0]), width: pctS(rect.width * (pos[i][1] - pos[i][0])), height: pctS(rect.height), textAlign: "center", padding: "0 1px", fontSize: "clamp(6px, 0.95cqw, 11px)", lineHeight: 1 }} />
      ))}
    </>
  );
}
