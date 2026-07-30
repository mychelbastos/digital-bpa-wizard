import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  FileBarChart, Download, FileText, Printer, RefreshCw, FileSpreadsheet, Ambulance, X, Loader2,
} from "lucide-react";
import {
  carregarProducaoDashboard, carregarNomesProcedimentos, carregarDescricoesCid, carregarDescricoesCbo,
  carregarVinculosUsuario, type ProducaoBpaRow,
} from "@/lib/dashboard-producao";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";
import { carregarLogoOrg } from "@/lib/org-logo";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { CNES_TFD, carregarRelatorioTfd, type TfdStatus, type TfdRelatorioRow } from "@/lib/tfd/tfd";
import { carregarComparacaoFpo, type FpoComparacaoRow } from "@/lib/fpo/fpo";
import { gerarRelatorioFpo, gerarRelatorioFpoPorUnidade } from "@/lib/fpo/relatorio-fpo";
import { construirPdfTfd, construirPdfTfdPorUnidade } from "@/lib/tfd/relatorio-tfd";
import { csvProducao, baixarCsv, construirPdfProducao, type MapasNome } from "@/lib/relatorios/producao";
import {
  montarRelatorioTfd, csvTabela, AGRUPAMENTOS, STATUS_ROTULO, compLabelTfd, brlTfd, type AgrupamentoRel,
} from "@/lib/relatorios/tfd-rel";
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
  const [cnesOpcoes, setCnesOpcoes] = useState<{ cnes: string; nome: string }[]>([]);
  const [fpoOpen, setFpoOpen] = useState(false);
  const [tfdOpen, setTfdOpen] = useState(false);

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
  useEffect(() => {
    carregarLogoOrg().then(setLogo);
    carregarVinculosUsuario().then(async (v) => {
      const unicos = [...new Set(v.map((x) => x.cnes).filter(Boolean))];
      setPodeTfd(unicos.some((c) => CNES_TFD.includes(c)));
      const nomes = await Promise.all(unicos.map(async (c) => ({ cnes: c, nome: (await buscarEstabelecimento(c)) || c })));
      setCnesOpcoes(nomes);
    });
  }, []);

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

        {/* ============ Outros relatórios — gerados AQUI (validam filtros e baixam) ============ */}
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Outros relatórios</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RelatorioCard icon={<FileSpreadsheet className="size-5" />} titulo="FPO × Produção"
            desc="Orçamento vs. produção por unidade e competência. Gera PDF (timbre)."
            onClick={() => setFpoOpen(true)} />
          {podeTfd && (
            <RelatorioCard icon={<Ambulance className="size-5" />} titulo="TFD"
              desc="Por unidade e faixa de competência, com agrupamentos. Gera CSV e PDF (timbre)."
              onClick={() => setTfdOpen(true)} />
          )}
        </div>
      </div>

      {fpoOpen && <FpoModal unidades={cnesOpcoes} logo={logo} responsavel={user?.nome ?? null} onClose={() => setFpoOpen(false)} />}
      {tfdOpen && <TfdModal unidades={cnesOpcoes.filter((u) => CNES_TFD.includes(u.cnes))} logo={logo} onClose={() => setTfdOpen(false)} />}
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

function RelatorioCard({ icon, titulo, desc, onClick }: { icon: React.ReactNode; titulo: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
      <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
      <span className="text-sm font-bold text-foreground">{titulo}</span>
      <span className="mt-1 text-xs text-muted-foreground">{desc}</span>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">Gerar relatório →</span>
    </button>
  );
}

function ModalRel({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground"><FileBarChart className="size-4 text-primary" /> {titulo}</h2>
          <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const selCls2 = "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm";
const lblCls2 = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const ultimosMesesMod = (n: number): string[] => {
  const d = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) { out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() - 1); }
  return out;
};

// Agrega linhas de FPO×Produção de várias unidades por procedimento (consolidado municipal).
function agregarFpo(rows: FpoComparacaoRow[]): FpoComparacaoRow[] {
  const m = new Map<string, FpoComparacaoRow>();
  for (const r of rows) {
    const e = m.get(r.procedimento);
    if (!e) { m.set(r.procedimento, { ...r, herdado: false, tetoCompetencia: null }); continue; }
    e.qtdOrcada += r.qtdOrcada; e.produzido += r.produzido; e.saldo += r.saldo;
    e.tetoRS += r.tetoRS; e.produzidoRS += r.produzidoRS; e.saldoRS += r.saldoRS;
    e.temTeto = e.temTeto || r.temTeto;
    e.resolvido = e.resolvido && r.resolvido;
  }
  return [...m.values()].sort((a, b) => a.descricao.localeCompare(b.descricao));
}

// ---- FPO: unidade (ou todas) + competência → PDF (timbre) gerado aqui ----
function FpoModal({ unidades, logo, responsavel, onClose }: { unidades: { cnes: string; nome: string }[]; logo: string | null; responsavel: string | null; onClose: () => void }) {
  const [cnes, setCnes] = useState(unidades.length > 1 ? "todas" : (unidades[0]?.cnes ?? ""));
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [formato, setFormato] = useState<"porUnidade" | "consolidado">("porUnidade");
  const [gerando, setGerando] = useState(false);
  const gerar = async () => {
    if (!cnes) { toast.error("Selecione uma unidade."); return; }
    setGerando(true);
    try {
      if (cnes === "todas") {
        const todas = await Promise.all(unidades.map((u) => carregarComparacaoFpo(u.cnes, competencia)));
        if (formato === "porUnidade") {
          const comRows = unidades.map((u, i) => ({ nome: u.nome, cnes: u.cnes, rows: todas[i] })).filter((x) => x.rows.length > 0);
          if (comRows.length === 0) { toast.error("Sem dados de FPO/produção nesta competência."); return; }
          gerarRelatorioFpoPorUnidade({ unidades: comRows, competencia, logo, responsavel });
          toast.success("PDF do FPO gerado."); onClose(); return;
        }
        const rows = agregarFpo(todas.flat());
        if (rows.length === 0) { toast.error("Sem dados de FPO/produção nesta competência."); return; }
        gerarRelatorioFpo({ nomeUnidade: `Todas as unidades (${unidades.length})`, cnes: "TODAS", competencia, rows, responsavel, logo });
      } else {
        const rows = await carregarComparacaoFpo(cnes, competencia);
        if (rows.length === 0) { toast.error("Sem dados de FPO/produção nesta unidade/competência."); return; }
        const nomeUnidade = unidades.find((u) => u.cnes === cnes)?.nome ?? cnes;
        gerarRelatorioFpo({ nomeUnidade, cnes, competencia, rows, responsavel, logo });
      }
      toast.success("PDF do FPO gerado.");
      onClose();
    } finally { setGerando(false); }
  };
  return (
    <ModalRel titulo="Relatório FPO × Produção" onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={lblCls2}>Unidade</span>
          <select value={cnes} onChange={(e) => setCnes(e.target.value)} className={selCls2}>
            {unidades.length === 0 && <option value="">Sem unidade vinculada</option>}
            {unidades.length > 1 && <option value="todas">Todas as unidades ({unidades.length})</option>}
            {unidades.map((u) => <option key={u.cnes} value={u.cnes}>{u.nome} ({u.cnes})</option>)}
          </select>
        </label>
        <label className="block">
          <span className={lblCls2}>Competência</span>
          <select value={competencia} onChange={(e) => setCompetencia(e.target.value)} className={selCls2}>
            {ultimosMesesMod(12).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
        </label>
        {cnes === "todas" && (
          <label className="block sm:col-span-2">
            <span className={lblCls2}>Formato (todas as unidades)</span>
            <select value={formato} onChange={(e) => setFormato(e.target.value as typeof formato)} className={selCls2}>
              <option value="porUnidade">Agrupado por unidade (seção por unidade + resumo geral no fim)</option>
              <option value="consolidado">Consolidado (tudo junto por procedimento)</option>
            </select>
          </label>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button onClick={gerar} disabled={gerando || !cnes} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {gerando ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Gerar PDF (timbre)
        </button>
      </div>
    </ModalRel>
  );
}

// ---- TFD: unidade + faixa de competência + status + agrupamento → CSV/PDF aqui ----
function TfdModal({ unidades, logo, onClose }: { unidades: { cnes: string; nome: string }[]; logo: string | null; onClose: () => void }) {
  const [cnes, setCnes] = useState(unidades.length > 1 ? "todas" : (unidades[0]?.cnes ?? ""));
  const [compDe, setCompDe] = useState(competenciaAtual());
  const [compAte, setCompAte] = useState(competenciaAtual());
  const [status, setStatus] = useState<"" | TfdStatus>("");
  const [agrup, setAgrup] = useState<AgrupamentoRel>("detalhado");
  const [formato, setFormato] = useState<"porUnidade" | "consolidado">("porUnidade");
  const [porUnidade, setPorUnidade] = useState<{ cnes: string; nome: string; rows: TfdRelatorioRow[] }[]>([]);
  const [carregando, setCarregando] = useState(false);
  const unidadesKey = unidades.map((u) => u.cnes).join(",");

  useEffect(() => {
    if (!cnes) { setPorUnidade([]); return; }
    let cancel = false;
    setCarregando(true);
    const alvos = cnes === "todas" ? unidades : unidades.filter((u) => u.cnes === cnes);
    Promise.all(alvos.map((u) => carregarRelatorioTfd(u.cnes, compDe, compAte)))
      .then((res) => { if (!cancel) { setPorUnidade(alvos.map((u, i) => ({ cnes: u.cnes, nome: u.nome, rows: res[i] }))); setCarregando(false); } });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnes, compDe, compAte, unidadesKey]);

  const rows = useMemo(() => porUnidade.flatMap((u) => u.rows), [porUnidade]);
  const montado = useMemo(() => montarRelatorioTfd(rows, status, agrup), [rows, status, agrup]);
  const nomeUnidade = cnes === "todas" ? `Todas as unidades (${unidades.length})` : (unidades.find((u) => u.cnes === cnes)?.nome ?? cnes);
  const periodo = compDe === compAte ? compLabelTfd(compDe) : `${compLabelTfd(compDe)} a ${compLabelTfd(compAte)}`;
  const agrupPorSecao = cnes === "todas" && formato === "porUnidade";

  const baixarCsvTfd = () => {
    if (montado.dados.length === 0) return;
    baixarCsv(`tfd_${agrup}_${compDe}-${compAte}.csv`, csvTabela(montado.colunas, montado.dados));
    toast.success("CSV gerado.");
  };
  const baixarPdfTfd = () => {
    if (montado.dados.length === 0) return;
    if (agrupPorSecao) {
      const secoes = porUnidade
        .map((u) => ({ u, m: montarRelatorioTfd(u.rows, status, agrup) }))
        .filter((x) => x.m.dados.length > 0);
      const pdf = construirPdfTfdPorUnidade({
        logo, periodo, status: status ? STATUS_ROTULO[status] : "Todos",
        agrupamento: AGRUPAMENTOS.find((a) => a.valor === agrup)?.rotulo ?? agrup,
        unidades: secoes.map(({ u, m }) => ({ nome: u.nome, cnes: u.cnes, colunas: m.colunas, dados: m.dados, totalTfd: m.totalTfd, totalViagens: m.totalViagens, totalRS: brlTfd(m.totalRS) })),
        totalGeralTfd: montado.totalTfd, totalGeralViagens: montado.totalViagens, totalGeralRS: brlTfd(montado.totalRS),
        resumoPorUnidade: secoes.map(({ u, m }) => [u.nome, u.cnes, String(m.totalTfd), String(m.totalViagens), brlTfd(m.totalRS)]),
      });
      pdf.save(`tfd_todas_por-unidade_${compDe}-${compAte}.pdf`);
      toast.success("PDF gerado."); return;
    }
    const pdf = construirPdfTfd({
      logo, nomeUnidade, periodo, status: status ? STATUS_ROTULO[status] : "Todos",
      agrupamento: AGRUPAMENTOS.find((a) => a.valor === agrup)?.rotulo ?? agrup,
      colunas: montado.colunas, dados: montado.dados, totalTfd: montado.totalTfd,
      totalViagens: montado.totalViagens, totalRS: brlTfd(montado.totalRS),
    });
    pdf.save(`tfd_${agrup}_${compDe}-${compAte}.pdf`);
    toast.success("PDF gerado.");
  };

  return (
    <ModalRel titulo="Relatório de TFD" onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={lblCls2}>Unidade</span>
          <select value={cnes} onChange={(e) => setCnes(e.target.value)} className={selCls2}>
            {unidades.length === 0 && <option value="">Sem unidade de TFD</option>}
            {unidades.length > 1 && <option value="todas">Todas as unidades ({unidades.length})</option>}
            {unidades.map((u) => <option key={u.cnes} value={u.cnes}>{u.nome} ({u.cnes})</option>)}
          </select>
        </label>
        <label className="block"><span className={lblCls2}>Competência de</span>
          <select value={compDe} onChange={(e) => setCompDe(e.target.value)} className={selCls2}>{ultimosMesesMod(18).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}</select>
        </label>
        <label className="block"><span className={lblCls2}>até</span>
          <select value={compAte} onChange={(e) => setCompAte(e.target.value)} className={selCls2}>{ultimosMesesMod(18).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}</select>
        </label>
        <label className="block"><span className={lblCls2}>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as "" | TfdStatus)} className={selCls2}>
            <option value="">Todos</option><option value="agendada">Agendada</option><option value="realizada">Realizada</option><option value="faturada">Faturada</option><option value="cancelada">Cancelada</option>
          </select>
        </label>
        <label className="block"><span className={lblCls2}>Agrupar</span>
          <select value={agrup} onChange={(e) => setAgrup(e.target.value as AgrupamentoRel)} className={selCls2}>
            {AGRUPAMENTOS.map((a) => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
          </select>
        </label>
        {cnes === "todas" && (
          <label className="block sm:col-span-2"><span className={lblCls2}>Formato (todas as unidades)</span>
            <select value={formato} onChange={(e) => setFormato(e.target.value as typeof formato)} className={selCls2}>
              <option value="porUnidade">Agrupado por unidade (seção por unidade + resumo geral no fim)</option>
              <option value="consolidado">Consolidado (tudo junto)</option>
            </select>
          </label>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{carregando ? "Carregando…" : `${montado.totalTfd} TFD · ${montado.totalViagens} viagens · ${brlTfd(montado.totalRS)}`}</span>
        <div className="flex gap-2">
          <button onClick={baixarPdfTfd} disabled={montado.dados.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><FileText className="size-4" /> PDF (timbre)</button>
          <button onClick={baixarCsvTfd} disabled={montado.dados.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"><Download className="size-4" /> CSV</button>
        </div>
      </div>
    </ModalRel>
  );
}
