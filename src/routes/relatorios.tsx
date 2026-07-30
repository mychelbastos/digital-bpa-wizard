import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  FileBarChart, Download, FileText, Printer, RefreshCw, FileSpreadsheet, Ambulance,
  CalendarCheck, FolderOpen, Home, ArrowRight,
} from "lucide-react";
import {
  carregarProducaoDashboard, carregarNomesProcedimentos, carregarDescricoesCid, carregarDescricoesCbo,
  carregarVinculosUsuario, type ProducaoBpaRow,
} from "@/lib/dashboard-producao";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";
import { carregarLogoOrg } from "@/lib/org-logo";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import { CNES_TFD } from "@/lib/tfd/tfd";
import { csvProducao, baixarCsv, construirPdfProducao, type MapasNome } from "@/lib/relatorios/producao";
import { toast } from "sonner";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — BPA Digital" }] }),
  component: RelatoriosPage,
});

const CARATER_NOME = new Map(CARATERES.map((c) => [c.code, c.label]));
const nomeCarater = (code: string | null) => (code ? CARATER_NOME.get(code) ?? null : null);
const nomeOuCodigo = (nome: string | null, codigo: string | null) => nome?.trim() || codigo || "Não informado";
const chaveProfissional = (r: ProducaoBpaRow) => r.profissional_cns || r.profissional_nome || r.cbo || "sem-profissional";

const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const mesLabel = (comp: string) => (comp.length === 6 ? `${meses[Number(comp.slice(4, 6)) - 1] ?? comp.slice(4, 6)}/${comp.slice(0, 4)}` : comp);
const competenciaAtual = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`; };
// Últimos 12 meses de produção (AAAAMM), do atual para trás.
const ultimosMeses = (n: number): string[] => {
  const d = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) { out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() - 1); }
  return out;
};

function RelatoriosPage() {
  const user = useAuthUser();
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [rows, setRows] = useState<ProducaoBpaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nomesProc, setNomesProc] = useState<Record<string, string>>({});
  const [nomesCid, setNomesCid] = useState<Record<string, string>>({});
  const [nomesCbo, setNomesCbo] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<string | null>(null);
  const [podeTfd, setPodeTfd] = useState(false);

  // Filtros
  const [cnes, setCnes] = useState("todos");
  const [prof, setProf] = useState("todos");
  const [proc, setProc] = useState("todos");
  const [tipo, setTipo] = useState<"todos" | "BPA-C" | "BPA-I">("todos");
  const [cid, setCid] = useState("todos");
  const [carater, setCarater] = useState("todos");

  const carregar = async () => {
    setLoading(true);
    const producao = await carregarProducaoDashboard(competencia);
    setRows(producao);
    setNomesProc(await carregarNomesProcedimentos(producao.map((r) => r.procedimento)));
    setNomesCid(await carregarDescricoesCid(producao.map((r) => r.cid).filter((c): c is string => !!c)));
    setNomesCbo(await carregarDescricoesCbo(producao.map((r) => r.cbo).filter((c): c is string => !!c)));
    setLoading(false);
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [competencia]);
  useEffect(() => { setCnes("todos"); setProf("todos"); setProc("todos"); setTipo("todos"); setCid("todos"); setCarater("todos"); }, [competencia]);
  useEffect(() => { carregarLogoOrg().then(setLogo); carregarVinculosUsuario().then((v) => setPodeTfd(v.some((x) => CNES_TFD.includes(x.cnes)))); }, []);

  const nomeProc = (c: string) => nomesProc[c] || null;
  const nomeCbo = (c: string | null) => (c ? (nomesCbo[c] ? nomesCbo[c].toUpperCase() : null) : null);
  const rotuloCid = (c: string | null) => { if (!c) return "Sem CID"; const d = nomesCid[c]; return d ? `${c} — ${d}` : c; };
  const mapas: MapasNome = { nomeProc, rotuloCid, nomeCbo, nomeCarater };

  // Listas de opções derivadas das linhas do mês.
  const uniq = <T,>(arr: T[]) => [...new Set(arr)];
  const unidades = useMemo(() => uniq(rows.map((r) => r.cnes || "")).filter(Boolean).map((c) => ({ code: c, label: nomeOuCodigo(rows.find((r) => r.cnes === c)?.estabelecimento_nome ?? null, c) })), [rows]);
  const profissionais = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) { const k = chaveProfissional(r); if (!m.has(k)) m.set(k, nomeOuCodigo(r.profissional_nome, nomeCbo(r.cbo) || r.profissional_cns || r.cbo)); }
    return [...m.entries()].map(([code, label]) => ({ code, label })).sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, nomesCbo]);
  const procedimentos = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (!m.has(r.procedimento)) m.set(r.procedimento, nomeProc(r.procedimento) || r.procedimento);
    return [...m.entries()].map(([code, label]) => ({ code, label })).sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, nomesProc]);
  const cids = useMemo(() => uniq(rows.map((r) => r.cid).filter((c): c is string => !!c)).map((c) => ({ code: c, label: rotuloCid(c) })).sort((a, b) => a.label.localeCompare(b.label)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, nomesCid]);
  const carateres = useMemo(() => uniq(rows.map((r) => r.carater).filter((c): c is string => !!c)).map((c) => ({ code: c, label: nomeCarater(c) || `Caráter ${c}` })), [rows]);

  const filtradas = useMemo(() => rows.filter((r) =>
    (cnes === "todos" || r.cnes === cnes) &&
    (prof === "todos" || chaveProfissional(r) === prof) &&
    (proc === "todos" || r.procedimento === proc) &&
    (tipo === "todos" || r.tipo === tipo) &&
    (cid === "todos" || r.cid === cid) &&
    (carater === "todos" || r.carater === carater),
  ), [rows, cnes, prof, proc, tipo, cid, carater]);

  const totalQtd = filtradas.reduce((s, r) => s + r.quantidade, 0);
  const bpaC = filtradas.filter((r) => r.tipo === "BPA-C").reduce((s, r) => s + r.quantidade, 0);
  const bpaI = filtradas.filter((r) => r.tipo === "BPA-I").reduce((s, r) => s + r.quantidade, 0);

  const filtrosLabel = () => {
    const p: string[] = [];
    if (tipo !== "todos") p.push(`Tipo: ${tipo}`);
    if (cnes !== "todos") p.push(`Unidade: ${unidades.find((u) => u.code === cnes)?.label ?? cnes}`);
    if (prof !== "todos") p.push(`Profissional: ${profissionais.find((x) => x.code === prof)?.label ?? prof}`);
    if (proc !== "todos") p.push(`Procedimento: ${procedimentos.find((x) => x.code === proc)?.label ?? proc}`);
    if (cid !== "todos") p.push(`CID: ${cids.find((x) => x.code === cid)?.label ?? cid}`);
    if (carater !== "todos") p.push(`Caráter: ${carateres.find((x) => x.code === carater)?.label ?? carater}`);
    return p.length ? p.join("  ·  ") : "Sem filtros (toda a produção do mês)";
  };

  const nomeArq = () => `producao-${competencia}${cnes !== "todos" ? `-${cnes}` : ""}`;
  const baixarCsvProd = () => {
    if (filtradas.length === 0) return;
    baixarCsv(`${nomeArq()}.csv`, csvProducao(filtradas, mapas));
    toast.success("CSV gerado.");
  };
  const baixarPdfProd = () => {
    if (filtradas.length === 0) return;
    const pdf = construirPdfProducao({ rows: filtradas, mapas, competenciaMes: competencia, filtros: filtrosLabel(), logo, responsavel: user?.nome ?? null });
    pdf.save(`${nomeArq()}.pdf`);
    toast.success("PDF gerado.");
  };
  const imprimirFichas = () => {
    const ids = [...new Set(filtradas.map((r) => `${r.tipo === "BPA-C" ? "C" : "I"}~${r.ficha_id}`))];
    if (ids.length === 0) return;
    window.open(`/imprimir?itens=${encodeURIComponent(ids.join(","))}`, "_blank");
  };

  const selCls = "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm";
  const cardCls = "rounded-2xl border border-border bg-card p-5 shadow-sm";

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Cabeçalho com timbre da prefeitura */}
        <header className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileBarChart className="size-5" /></span>
            <div>
              <h1 className="text-xl font-bold text-foreground">Relatórios</h1>
              <p className="text-sm text-muted-foreground">Baixe e imprima relatórios de produção, FPO, TFD e fechamento.</p>
            </div>
          </div>
          {logo && <img src={logo} alt="Timbre" className="hidden h-12 w-auto object-contain sm:block" />}
        </header>

        {/* ============ Relatório de Produção (BPA-I/BPA-C) ============ */}
        <section className={`${cardCls} mb-5`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground"><FileText className="size-4 text-primary" /> Produção (BPA-I / BPA-C)</h2>
            <button onClick={carregar} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Mês de produção</span>
              <select value={competencia} onChange={(e) => setCompetencia(e.target.value)} className={selCls}>
                {ultimosMeses(12).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tipo</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={selCls}>
                <option value="todos">Todos</option><option value="BPA-I">BPA-I</option><option value="BPA-C">BPA-C</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unidade</span>
              <select value={cnes} onChange={(e) => setCnes(e.target.value)} className={selCls}>
                <option value="todos">Todas</option>
                {unidades.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Profissional</span>
              <select value={prof} onChange={(e) => setProf(e.target.value)} className={selCls}>
                <option value="todos">Todos</option>
                {profissionais.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
              </select>
            </label>
            <label className="block lg:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Procedimento</span>
              <select value={proc} onChange={(e) => setProc(e.target.value)} className={selCls}>
                <option value="todos">Todos</option>
                {procedimentos.map((p) => <option key={p.code} value={p.code}>{p.label !== p.code ? `${p.label} (${p.code})` : p.code}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">CID</span>
              <select value={cid} onChange={(e) => setCid(e.target.value)} className={selCls}>
                <option value="todos">Todos</option>
                {cids.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Caráter</span>
              <select value={carater} onChange={(e) => setCarater(e.target.value)} className={selCls}>
                <option value="todos">Todos</option>
                {carateres.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </label>
          </div>

          {/* Prévia */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Procedimentos" value={totalQtd} destaque />
            <MiniStat label="Atendimentos" value={filtradas.length} />
            <MiniStat label="BPA-C" value={bpaC} />
            <MiniStat label="BPA-I" value={bpaI} />
          </div>

          {/* Ações */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={baixarCsvProd} disabled={filtradas.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
              <Download className="size-4" /> Baixar CSV
            </button>
            <button onClick={baixarPdfProd} disabled={filtradas.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <FileText className="size-4" /> Baixar PDF (timbre)
            </button>
            <button onClick={imprimirFichas} disabled={filtradas.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
              <Printer className="size-4" /> Imprimir fichas
            </button>
            <span className="self-center text-xs text-muted-foreground">{loading ? "Carregando…" : `${filtradas.length} linha(s) · ${filtrosLabel()}`}</span>
          </div>
        </section>

        {/* ============ Atalhos p/ os demais relatórios (não movidos: também acessíveis aqui) ============ */}
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Outros relatórios</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AtalhoCard to="/fpo" icon={<FileSpreadsheet className="size-5" />} titulo="FPO × Produção"
            desc="Relatório PDF (timbre) do orçamento vs. produção por unidade e competência." />
          {podeTfd && (
            <AtalhoCard to="/tfd" icon={<Ambulance className="size-5" />} titulo="TFD"
              desc="Relatório de TFD em CSV e PDF (timbre), por unidade e faixa de competência." />
          )}
          <AtalhoCard to="/fechamento" icon={<CalendarCheck className="size-5" />} titulo="Fechamento do mês (.txt)"
            desc="Gera e baixa o arquivo do BPA Magnético (.txt) para o SIA/SUS." />
          <AtalhoCard to="/minhas-fichas" icon={<FolderOpen className="size-5" />} titulo="Fichas (impressão)"
            desc="Imprima fichas BPA-I/BPA-C individualmente ou em lote." />
          <AtalhoCard to="/" icon={<Home className="size-5" />} titulo="Dashboard / Ranking"
            desc="Resumo e ranking por profissional, com impressão de resumo e fichas." />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, destaque = false }: { label: string; value: number; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destaque ? "border-primary/30 bg-primary/5" : "border-border bg-muted/40"}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}

function AtalhoCard({ to, icon, titulo, desc }: { to: string; icon: React.ReactNode; titulo: string; desc: string }) {
  return (
    <Link to={to} search={{}} className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
      <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
      <span className="flex items-center gap-1 text-sm font-bold text-foreground">{titulo} <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></span>
      <span className="mt-1 text-xs text-muted-foreground">{desc}</span>
    </Link>
  );
}
