import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type RefObject, type KeyboardEvent as RKeyboardEvent } from "react";
import { FileDown, Eraser, Ruler, Pencil, Copy, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { exportSheetsPdf } from "@/lib/export-pdf";
import { focarProximoCampo } from "@/lib/foco-campos";
import { carregarNomesProcedimentos, carregarDescricoesCid } from "@/lib/dashboard-producao";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";

// Enter em qualquer campo (menos textarea) pula para o próximo — mesma navegação do BPA-I.
function aoTeclarEnter(e: RKeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") { e.preventDefault(); focarProximoCampo(e.currentTarget); }
}

// Campo/checkbox posicionado por % sobre a imagem de fundo. Suporta campos inteligentes
// (numérico, data/hora, células de 1 dígito) e múltiplas páginas (campo.pagina, 1-based).
export interface CampoForm {
  key: string;
  top: number;
  left: number;
  width: number;
  height?: number;
  area?: boolean;
  upper?: boolean;
  num?: boolean;
  letras?: boolean;
  maxLen?: number;
  data?: boolean;
  hora?: boolean;
  celulas?: number;
  pagina?: number;
  // Crivo (validação/preenchimento a partir das tabelas do sistema):
  crivo?: "procedimento" | "cnes" | "cid";
  alvo?: string; // key do campo a preencher com o nome/descrição encontrado
}
export interface CheckForm {
  key: string;
  top: number;
  left: number;
  grupo?: string;
  pagina?: number;
}
export interface PaginaForm { bg: string; aspect: string; }

interface Rect { top: number; left: number; width: number; height: number; }
const CHECK_W = 1.4;
const CHECK_H = 1.0;
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const pctS = (n: number) => `${n}%`;
const baseRectCampo = (c: CampoForm): Rect => ({ top: c.top, left: c.left, width: c.width, height: c.height ?? 1.3 });
const baseRectCheck = (t: number, l: number): Rect => ({ top: t, left: l, width: CHECK_W, height: CHECK_H });

function filtrar(c: CampoForm, v: string): string {
  if (c.num) { const s = v.replace(/\D/g, ""); return c.maxLen ? s.slice(0, c.maxLen) : s; }
  if (c.letras) { const s = v.replace(/[^A-Za-zÀ-ÿ]/g, "").toUpperCase(); return c.maxLen ? s.slice(0, c.maxLen) : s; }
  const s = c.upper ? v.toUpperCase() : v;
  return c.maxLen ? s.slice(0, c.maxLen) : s;
}

export function FormularioOverlay({ titulo, storageKey, campos, checks, paginas }: {
  titulo: string; storageKey: string; campos: CampoForm[]; checks: CheckForm[]; paginas: PaginaForm[];
}) {
  const rectsKey = `${storageKey}-rects`;
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [txt, setTxtState] = useState<Record<string, string>>({});
  const [chk, setChkState] = useState<Record<string, boolean>>({});
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [contornos, setContornos] = useState(false);
  const [editar, setEditar] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [crivoStatus, setCrivoStatus] = useState<Record<string, "ok" | "erro" | "buscando">>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) { const s = JSON.parse(raw); setTxtState(s.txt ?? {}); setChkState(s.chk ?? {}); }
      const rr = localStorage.getItem(rectsKey);
      if (rr) setRects(JSON.parse(rr));
    } catch { /* ignora */ }
  }, [storageKey, rectsKey]);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify({ txt, chk })); } catch { /* */ } }, [txt, chk, storageKey]);
  useEffect(() => { try { localStorage.setItem(rectsKey, JSON.stringify(rects)); } catch { /* */ } }, [rects, rectsKey]);

  const setTxt = (key: string, v: string) => setTxtState((e) => ({ ...e, [key]: v }));

  // Dígitos "puros" de um valor (células/data guardam "seg|seg|..."; junta).
  const digitos = (c: CampoForm, v: string) => (c.celulas || c.data || c.hora ? v.split("|").join("") : v).trim();

  // Crivo: valida contra as tabelas do sistema e, quando há alvo, preenche o nome/descrição.
  const dispararCrivo = async (c: CampoForm, valor: string) => {
    if (!c.crivo) return;
    setCrivoStatus((s) => ({ ...s, [c.key]: "buscando" }));
    let ok = false, nome: string | null = null;
    try {
      if (c.crivo === "procedimento") { const r = await carregarNomesProcedimentos([valor]); nome = r[valor] ?? null; ok = !!nome; }
      else if (c.crivo === "cnes") { nome = await buscarEstabelecimento(valor); ok = !!nome; }
      else if (c.crivo === "cid") { const r = await carregarDescricoesCid([valor.toUpperCase()]); nome = r[valor.toUpperCase()] ?? null; ok = !!nome; }
    } catch { ok = false; }
    setCrivoStatus((s) => ({ ...s, [c.key]: ok ? "ok" : "erro" }));
    if (ok && c.alvo && nome) setTxt(c.alvo, nome.toUpperCase());
  };

  // Mudança de valor de um campo (dispara o crivo quando o valor fica "completo").
  const aoMudar = (c: CampoForm, v: string) => {
    setTxt(c.key, v);
    if (!c.crivo) return;
    const dig = digitos(c, v);
    const completo = c.crivo === "procedimento" ? dig.length === 10
      : c.crivo === "cnes" ? dig.length === 7
      : dig.length >= 3; // CID
    if (completo) dispararCrivo(c, dig);
    else setCrivoStatus((s) => { const n = { ...s }; delete n[c.key]; return n; });
  };
  const crivoOutline = (key: string) => {
    const st = crivoStatus[key];
    return st === "ok" ? "outline outline-2 outline-emerald-500/70" : st === "erro" ? "outline outline-2 outline-rose-500/70" : "";
  };
  const toggle = (key: string) => setChkState((e) => {
    const marcado = e[key];
    const grupo = checks.find((c) => c.key === key)?.grupo;
    const novo = { ...e };
    if (grupo && !marcado) checks.forEach((c) => { if (c.grupo === grupo) novo[c.key] = false; });
    novo[key] = !marcado;
    return novo;
  });

  const rectCampo = (c: CampoForm): Rect => rects[c.key] ?? baseRectCampo(c);
  const rectCheck = (key: string, t: number, l: number): Rect => rects[key] ?? baseRectCheck(t, l);
  const setRect = (key: string, r: Rect) => setRects((prev) => ({ ...prev, [key]: { top: r1(clamp(r.top)), left: r1(clamp(r.left)), width: r1(Math.max(0.4, r.width)), height: r1(Math.max(0.3, r.height)) } }));

  const limpar = () => { if (confirm("Limpar todo o formulário?")) { setTxtState({}); setChkState({}); } };
  const restaurar = () => { if (confirm("Descartar seus ajustes de posição e voltar ao layout padrão?")) { setRects({}); setSel(null); } };

  const baixarPdf = async () => {
    const sheets = sheetRefs.current.filter((s): s is HTMLDivElement => !!s);
    if (!sheets.length) return;
    setExportando(true);
    try { await exportSheetsPdf(sheets, `${storageKey}.pdf`); toast.success("PDF gerado."); }
    catch { toast.error("Não foi possível gerar o PDF."); }
    finally { setExportando(false); }
  };

  const gerarCoords = () => {
    const lc = (c: CampoForm) => {
      const r = rectCampo(c);
      const h = r.height === 1.3 ? "" : `, height: ${r.height}`;
      const flags = [c.area && "area: true", c.upper && "upper: true", c.num && "num: true", c.letras && "letras: true", c.maxLen && `maxLen: ${c.maxLen}`, c.data && "data: true", c.hora && "hora: true", c.celulas && `celulas: ${c.celulas}`, c.pagina && `pagina: ${c.pagina}`].filter(Boolean).join(", ");
      return `  { key: "${c.key}", top: ${r.top}, left: ${r.left}, width: ${r.width}${h}${flags ? ", " + flags : ""} },`;
    };
    const lk = (c: CheckForm) => {
      const r = rectCheck(c.key, c.top, c.left);
      const flags = [c.grupo && `grupo: "${c.grupo}"`, c.pagina && `pagina: ${c.pagina}`].filter(Boolean).join(", ");
      return `  { key: "${c.key}", top: ${r.top}, left: ${r.left}${flags ? ", " + flags : ""} },`;
    };
    return `export const CAMPOS: Campo[] = [\n${campos.map(lc).join("\n")}\n];\n\nexport const CHECKS: Check[] = [\n${checks.map(lk).join("\n")}\n];`;
  };
  const copiarCoords = async () => {
    try { await navigator.clipboard.writeText(gerarCoords()); toast.success("Coordenadas copiadas."); }
    catch { toast.error("Copie manualmente do quadro."); }
  };

  const contornoCls = contornos ? "outline outline-1 outline-sky-400/70" : "";
  const selRect = sel ? rects[sel] ?? (campos.find((c) => c.key === sel) ? baseRectCampo(campos.find((c) => c.key === sel)!) : (() => { const ch = checks.find((c) => c.key === sel)!; return baseRectCheck(ch.top, ch.left); })()) : null;
  const selEhCheck = sel ? checks.some((c) => c.key === sel) : false;

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
          <h1 className="text-base font-semibold">{titulo}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setEditar((e) => !e)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${editar ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border bg-card text-foreground hover:bg-muted"}`}>
              <Pencil className="size-4" /> {editar ? "Editando posições" : "Editar posições"}
            </button>
            {editar ? (
              <>
                <button onClick={copiarCoords} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Copy className="size-4" /> Copiar coordenadas</button>
                <button onClick={() => setExportOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">Ver quadro</button>
                <button onClick={restaurar} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"><RotateCcw className="size-4" /> Restaurar</button>
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
            Arraste as caixas para posicionar; arraste o canto inferior-direito para redimensionar. Clique numa caixa para ajustar os números com precisão. Setas do teclado movem a selecionada. Ao terminar, <strong>Copiar coordenadas</strong> e me mande no chat.
          </div>
        )}
      </header>

      <main className="mx-auto mt-4 max-w-[1100px] space-y-4 px-4">
        {paginas.map((pg, pi) => {
          const nPag = pi + 1;
          const camposPag = campos.filter((c) => (c.pagina ?? 1) === nPag);
          const checksPag = checks.filter((c) => (c.pagina ?? 1) === nPag);
          const setSheet = (el: HTMLDivElement | null) => { sheetRefs.current[pi] = el; };
          return (
            <div key={pi} ref={setSheet} className="form-sheet" style={{ aspectRatio: pg.aspect, containerType: "inline-size" }} onPointerDown={() => editar && setSel(null)}>
              <img src={pg.bg} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />

              {!editar && camposPag.map((c) => {
                const r = rectCampo(c);
                const style = { top: pctS(r.top), left: pctS(r.left), width: pctS(r.width), height: pctS(r.height) } as const;
                const val = txt[c.key] ?? "";
                const cls = `${contornoCls} ${crivoOutline(c.key)}`;
                if (c.data) return <DataHoraCampo key={c.key} campo={c} rect={r} value={val} onChange={(v) => aoMudar(c, v)} contornoCls={cls} segmentos={[2, 2, 4]} />;
                if (c.hora) return <DataHoraCampo key={c.key} campo={c} rect={r} value={val} onChange={(v) => aoMudar(c, v)} contornoCls={cls} segmentos={[2, 2]} />;
                if (c.celulas) return <DataHoraCampo key={c.key} campo={c} rect={r} value={val} onChange={(v) => aoMudar(c, v)} contornoCls={cls} segmentos={Array(c.celulas).fill(1)} uniforme alfa={c.letras} />;
                if (c.area) return <textarea key={c.key} value={val} onChange={(e) => setTxt(c.key, filtrar(c, e.target.value))} className={`form-text absolute resize-none whitespace-pre-wrap ${contornoCls}`} style={{ ...style, textAlign: "left", lineHeight: 1.2 }} />;
                return <input key={c.key} value={val} inputMode={c.num ? "numeric" : undefined} onChange={(e) => aoMudar(c, filtrar(c, e.target.value))} onKeyDown={aoTeclarEnter} onBlur={c.crivo === "cid" && digitos(c, val).length >= 3 ? () => dispararCrivo(c, digitos(c, val)) : undefined} className={`form-text absolute ${cls}`} style={style} />;
              })}
              {!editar && checksPag.map((c) => {
                const r = rectCheck(c.key, c.top, c.left);
                return (
                  <button key={c.key} type="button" onClick={() => toggle(c.key)} className={`absolute flex items-center justify-center ${contornoCls}`} style={{ top: pctS(r.top), left: pctS(r.left), width: pctS(r.width), height: pctS(r.height) }} aria-label={c.key}>
                    {chk[c.key] && <span className="text-[#0a2540]" style={{ fontSize: "min(2.6cqw, 16px)", fontWeight: 800, lineHeight: 1 }}>✕</span>}
                  </button>
                );
              })}

              {editar && camposPag.map((c) => (
                <CaixaEditavel key={c.key} rect={rectCampo(c)} label={c.key} resizable selecionado={sel === c.key} sheetRef={{ current: sheetRefs.current[pi] }}
                  onSelect={() => setSel(c.key)} onChange={(r) => setRect(c.key, r)} />
              ))}
              {editar && checksPag.map((c) => (
                <CaixaEditavel key={c.key} rect={rectCheck(c.key, c.top, c.left)} label={c.key} selecionado={sel === c.key} sheetRef={{ current: sheetRefs.current[pi] }} check
                  onSelect={() => setSel(c.key)} onChange={(r) => setRect(c.key, r)} />
              ))}
            </div>
          );
        })}
        {!editar && <p className="text-center text-[11px] text-muted-foreground">Salvo automaticamente neste navegador. Use <strong>Contornos</strong> para ver a posição dos campos.</p>}
      </main>

      {editar && sel && selRect && (
        <PainelAjuste chave={sel} rect={selRect} check={selEhCheck} onChange={(r) => setRect(sel, r)} onClose={() => setSel(null)} />
      )}
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
    <div onPointerDown={(e) => start(e, "move")} onPointerMove={move} onPointerUp={end}
      className={`absolute cursor-move overflow-hidden rounded-sm border text-[8px] leading-none ${selecionado ? "z-20 border-amber-500 bg-amber-400/25 ring-1 ring-amber-500" : check ? "border-rose-500/70 bg-rose-400/15" : "border-sky-500/70 bg-sky-400/12"}`}
      style={{ top: pctS(rect.top), left: pctS(rect.left), width: pctS(rect.width), height: pctS(rect.height) }} title={label}>
      <span className="pointer-events-none block truncate px-0.5 text-sky-900/70">{label}</span>
      {resizable && <div onPointerDown={(e) => start(e, "resize")} onPointerMove={move} onPointerUp={end} className="absolute bottom-0 right-0 size-2 cursor-nwse-resize bg-amber-500" />}
    </div>
  );
}

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

function DataHoraCampo({ campo, rect, value, onChange, contornoCls, segmentos, uniforme, alfa }: {
  campo: CampoForm; rect: Rect; value: string; onChange: (v: string) => void; contornoCls: string; segmentos: number[]; uniforme?: boolean; alfa?: boolean;
}) {
  const partes = (value || "").split("|");
  const vals = segmentos.map((_, i) => partes[i] ?? "");
  // Divide a caixa em N partes iguais (uma por casinha impressa), com uma margem interna
  // pequena para não encostar no divisor. Antes o "gap" absoluto engolia a largura quando
  // havia muitas casinhas (ex.: 9 casinhas do telefone ficavam invisíveis).
  const uniformePos = (): number[][] => {
    const n = segmentos.length;
    const cw = 1 / n;
    const m = cw * 0.12;
    return segmentos.map((_, i) => [i * cw + m, (i + 1) * cw - m]);
  };
  // Data (3 seg): a caixa do APAC tem 2 barras (~0.34 e ~0.61 do box) — dia antes da 1ª,
  // mês entre as duas, ano DEPOIS da 2ª barra (no espaço largo à direita).
  const pos = uniforme ? uniformePos() : segmentos.length === 3 ? [[0.03, 0.31], [0.40, 0.57], [0.68, 0.99]] : [[0, 0.46], [0.54, 1.0]];
  const seg = (i: number) => document.getElementById(`seg-${campo.key}-${i}`) as HTMLInputElement | null;
  const onSeg = (i: number, raw: string) => {
    const nv = (alfa ? raw.replace(/[^A-Za-zÀ-ÿ]/g, "").toUpperCase() : raw.replace(/\D/g, "")).slice(0, segmentos[i]);
    const arr = segmentos.map((_, j) => (j === i ? nv : vals[j]));
    onChange(arr.join("|"));
    if (nv.length === segmentos[i] && nv.length > vals[i].length && i < segmentos.length - 1) seg(i + 1)?.focus();
  };
  // Navegação estilo BPA-I: auto-avanço (acima), Backspace em casinha vazia volta, Enter pula
  // o campo inteiro (salta as demais casinhas irmãs).
  const onKey = (i: number, e: RKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !vals[i] && i > 0) { e.preventDefault(); seg(i - 1)?.focus(); }
    else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); seg(i - 1)?.focus(); }
    else if (e.key === "ArrowRight" && i < segmentos.length - 1) { e.preventDefault(); seg(i + 1)?.focus(); }
    else if (e.key === "Enter") { e.preventDefault(); const irmas = segmentos.map((_, j) => seg(j)).filter((x): x is HTMLInputElement => !!x && x !== e.currentTarget); focarProximoCampo(e.currentTarget, irmas); }
  };
  return (
    <>
      {segmentos.map((_, i) => (
        <input key={i} id={`seg-${campo.key}-${i}`} value={vals[i]} inputMode={alfa ? "text" : "numeric"}
          onChange={(e) => onSeg(i, e.target.value)} onKeyDown={(e) => onKey(i, e)}
          className={`form-text absolute ${contornoCls}`}
          style={{ top: pctS(rect.top), left: pctS(rect.left + rect.width * pos[i][0]), width: pctS(rect.width * (pos[i][1] - pos[i][0])), height: pctS(rect.height), textAlign: "center", padding: "0 1px", fontSize: "clamp(6px, 0.95cqw, 11px)", lineHeight: 1 }} />
      ))}
    </>
  );
}
