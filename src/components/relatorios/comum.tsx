import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ChevronDown, Check, Lock, ArrowLeft } from "lucide-react";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";

// ---- Utilidades de período (AAAAMM) ----
export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const mesLabel = (comp: string) =>
  (comp.length === 6 ? `${MESES[Number(comp.slice(4, 6)) - 1] ?? comp.slice(4, 6)}/${comp.slice(0, 4)}` : comp);
export const competenciaAtual = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`; };
// Desloca um AAAAMM em n meses (n<0 = passado). Ex.: mesOffset("202608", -2) = "202606".
export const mesOffset = (base: string, n: number): string => {
  let a = Number(base.slice(0, 4)); let m = Number(base.slice(4, 6)) + n;
  a += Math.floor((m - 1) / 12); m = ((((m - 1) % 12) + 12) % 12) + 1;
  return `${a}${String(m).padStart(2, "0")}`;
};
// Presets do seletor de período. range() devolve [de, ate].
export const PRESETS_PERIODO: { key: string; label: string; range: () => [string, string] }[] = [
  { key: "atual", label: "Mês atual", range: () => { const a = competenciaAtual(); return [a, a]; } },
  { key: "ultimo", label: "Último mês", range: () => { const a = mesOffset(competenciaAtual(), -1); return [a, a]; } },
  { key: "3m", label: "Últimos 3 meses", range: () => { const a = competenciaAtual(); return [mesOffset(a, -2), a]; } },
  { key: "6m", label: "Últimos 6 meses", range: () => { const a = competenciaAtual(); return [mesOffset(a, -5), a]; } },
  { key: "12m", label: "Último ano", range: () => { const a = competenciaAtual(); return [mesOffset(a, -11), a]; } },
];
// Últimos N meses (AAAAMM), do atual para trás.
export const ultimosMeses = (n: number): string[] => {
  const d = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) { out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() - 1); }
  return out;
};
export const ultimosMesesMod = ultimosMeses; // alias mantido para os relatórios de detalhe

export const selCls2 = "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm";
export const lblCls2 = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
export const cardCls = "rounded-2xl border border-border bg-card p-5 shadow-sm";

// ---- MultiSelect (filtro de múltipla escolha com dropdown de checkboxes) ----
export function MultiSelect({ titulo, opcoes, sel, onChange, allLabel = "Todos", comCodigo = false }: {
  titulo: string;
  opcoes: { code: string; label: string }[];
  sel: Set<string>;
  onChange: (s: Set<string>) => void;
  allLabel?: string;
  comCodigo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const rotulo = (o: { code: string; label: string }) => (comCodigo && o.label !== o.code ? `${o.label} (${o.code})` : o.label);
  const filtradas = q.trim() ? opcoes.filter((o) => `${o.label} ${o.code}`.toLowerCase().includes(q.trim().toLowerCase())) : opcoes;
  const MAX = 200;
  const mostradas = filtradas.slice(0, MAX);
  const toggle = (code: string) => { const n = new Set(sel); if (n.has(code)) n.delete(code); else n.add(code); onChange(n); };
  const resumo = sel.size === 0 ? allLabel
    : sel.size === 1 ? (rotulo(opcoes.find((o) => o.code === [...sel][0]) ?? { code: [...sel][0], label: [...sel][0] }))
      : `${sel.size} selecionados`;
  return (
    <label className="block">
      <span className={lblCls2}>{titulo}</span>
      <div className="relative" ref={ref}>
        <button type="button" onClick={() => setAberto((a) => !a)} className={`${selCls2} flex items-center justify-between gap-2 text-left`}>
          <span className="truncate">{resumo}</span>
          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
        </button>
        {aberto && (
          <div className="absolute z-30 mt-1 w-full min-w-[220px] rounded-md border border-border bg-popover shadow-lg">
            {opcoes.length > 8 && (
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filtrar…" autoFocus data-nocaps
                className="w-full border-b border-border bg-background px-2.5 py-1.5 text-xs outline-none" />
            )}
            <div className="max-h-60 overflow-auto p-1">
              <button type="button" onClick={() => onChange(new Set())}
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${sel.size === 0 ? "font-semibold text-primary" : ""}`}>
                {allLabel} {sel.size === 0 && <Check className="size-3.5" />}
              </button>
              {mostradas.map((o) => (
                <button key={o.code} type="button" onClick={() => toggle(o.code)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                  <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${sel.has(o.code) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                    {sel.has(o.code) && <Check className="size-3" />}
                  </span>
                  <span className="truncate">{rotulo(o)}</span>
                </button>
              ))}
              {filtradas.length > MAX && <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Mostrando {MAX} de {filtradas.length} — refine pela busca.</div>}
              {filtradas.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">Nenhuma opção.</div>}
            </div>
          </div>
        )}
      </div>
    </label>
  );
}

// ---- KPI compacto ----
export function MiniStat({ label, value, destaque = false, loading = false }: { label: string; value: number; destaque?: boolean; loading?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destaque ? "border-primary/30 bg-primary/5" : "border-border bg-muted/40"}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {loading
        ? <span className="mt-2 block h-5 w-16 animate-pulse rounded bg-muted-foreground/20" />
        : <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value.toLocaleString("pt-BR")}</p>}
    </div>
  );
}

// ---- Card do CATÁLOGO: navega para a página do relatório (ou cadeado se bloqueado) ----
export function RelatorioCard({ icon, titulo, desc, to, bloqueado = false }: { icon: React.ReactNode; titulo: string; desc: string; to: string; bloqueado?: boolean }) {
  if (bloqueado) {
    return (
      <div title="Sem permissão — fale com o gestor" className="relative flex cursor-not-allowed flex-col rounded-2xl border border-border bg-muted/40 p-5 text-left opacity-70">
        <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">{icon}</span>
        <span className="text-sm font-bold text-muted-foreground">{titulo}</span>
        <span className="mt-1 text-xs text-muted-foreground">{desc}</span>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Lock className="size-3.5" /> Sem permissão</span>
      </div>
    );
  }
  return (
    <Link to={to} className="group flex flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
      <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
      <span className="text-sm font-bold text-foreground">{titulo}</span>
      <span className="mt-1 text-xs text-muted-foreground">{desc}</span>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">Abrir relatório →</span>
    </Link>
  );
}

// ---- Cabeçalho de uma página de relatório (voltar + título) ----
export function CabecalhoRelatorio({ titulo, desc, icon }: { titulo: string; desc?: string; icon?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <Link to="/relatorios" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Voltar aos relatórios
      </Link>
      <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">{icon}{titulo}</h1>
      {desc && <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>}
    </div>
  );
}

// ---- Tela de "Sem acesso" (permissão do relatório) ----
export function SemAcesso() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Lock className="size-6" /></div>
      <h2 className="mt-3 text-base font-bold text-foreground">Sem permissão para este relatório</h2>
      <p className="mt-1 text-sm text-muted-foreground">Seu perfil não pode emitir este relatório. Fale com o gestor/administrador da sua organização.</p>
    </div>
  );
}

// ---- BARRA DE FILTROS-BASE (período + unidade) — rege os relatórios de produção ----
export function BarraFiltrosBase() {
  const { compDe, compAte, setCompDe, setCompAte, cnesSel, setCnesSel, cnesOpcoes, periodoLabel } = useRelatoriosCtx();
  const presetAtivo = PRESETS_PERIODO.find((p) => { const [d, a] = p.range(); return compDe === d && compAte === a; })?.key ?? "custom";
  const unidadeOpts = cnesOpcoes.map((u) => ({ code: u.cnes, label: u.nome }));
  const lblTopo = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
  return (
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}
      className="mb-5 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <label className="block">
          <span className={lblTopo}>Atalho de período</span>
          <select value={presetAtivo} onChange={(e) => { const p = PRESETS_PERIODO.find((x) => x.key === e.target.value); if (p) { const [d, a] = p.range(); setCompDe(d); setCompAte(a); } }} className={selCls2}>
            {PRESETS_PERIODO.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            <option value="custom">Personalizado</option>
          </select>
        </label>
        <label className="block">
          <span className={lblTopo}>De</span>
          <select value={compDe} onChange={(e) => { const v = e.target.value; setCompDe(v); if (v > compAte) setCompAte(v); }} className={selCls2}>
            {ultimosMeses(12).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={lblTopo}>Até</span>
          <select value={compAte} onChange={(e) => { const v = e.target.value; setCompAte(v); if (v < compDe) setCompDe(v); }} className={selCls2}>
            {ultimosMeses(12).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
        </label>
        <div className="col-span-2 sm:col-span-1 lg:col-span-2">
          <MultiSelect titulo="Unidade" allLabel="Todas as unidades" opcoes={unidadeOpts} sel={cnesSel} onChange={setCnesSel} />
        </div>
      </div>
      <p className="mt-2.5 text-xs text-muted-foreground">
        Estes filtros <strong className="text-foreground">regem os relatórios de produção desta seção</strong>.{" "}
        Selecionado: <strong className="text-foreground">{periodoLabel}</strong> · <strong className="text-foreground">{cnesSel.size > 0 ? `${cnesSel.size} unidade(s)` : "todas as unidades"}</strong>.
      </p>
    </motion.section>
  );
}
