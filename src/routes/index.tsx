import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  Activity, Building2, ChevronDown, FileText, IdCard, MapPin, Printer, RefreshCw,
  Stethoscope, TrendingUp, Users, X,
} from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  carregarVinculosUsuario, carregarNomesProcedimentos, carregarDescricoesCid, carregarDescricoesCbo, carregarProducaoDashboard,
  type VinculoResumo, type ProducaoBpaRow, type TipoBpa,
} from "@/lib/dashboard-producao";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";
import { carregarResumoFpo, type FpoResumoUnidade } from "@/lib/fpo/fpo";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { carregarLogoOrg } from "@/lib/org-logo";

const CARATER_NOME = new Map(CARATERES.map((c) => [c.code, c.label]));
const nomeCarater = (code: string | null) => (code ? CARATER_NOME.get(code) ?? null : null);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard SPA Digital" },
      { name: "description", content: "Dashboard de produção BPA-C e BPA-I com filtros por unidade, profissional, procedimento e competência." },
    ],
  }),
  component: Home,
});

const competenciaAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const mesLabel = (comp: string) => {
  if (comp.length !== 6) return comp;
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const mes = meses[Number(comp.slice(4, 6)) - 1] ?? comp.slice(4, 6);
  return `${mes}/${comp.slice(0, 4)}`;
};
const nomeOuCodigo = (nome: string | null, codigo: string | null) => nome?.trim() || codigo || "Não informado";
// Chave de agrupamento de "profissional": CNS (BPA-I) → nome (BPA-C v3, controle interno do
// painel) → CBO (fallback p/ fichas BPA-C antigas sem nome). Mantém profissionais distintos
// separados mesmo quando compartilham o CBO.
const chaveProfissional = (r: ProducaoBpaRow) => r.profissional_cns || r.profissional_nome || r.cbo || "sem-profissional";
const CHART_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

// Tick do eixo X do gráfico de unidades: nomes de estabelecimento são longos e se
// sobrepõem. Quebra em até 2 linhas (~18 chars cada) e trunca com reticências o excedente,
// centralizado sob a barra. O nome completo continua no tooltip da barra.
function TickUnidade({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  const full = payload?.value ?? "";
  const MAX_LINHA = 18;
  const palavras = full.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const w of palavras) {
    const tentativa = atual ? `${atual} ${w}` : w;
    if (tentativa.length > MAX_LINHA && atual) {
      linhas.push(atual);
      atual = w;
    } else {
      atual = tentativa;
    }
    if (linhas.length === 2) break; // no máximo 2 linhas
  }
  if (atual && linhas.length < 2) linhas.push(atual);
  // Se sobrou texto (mais de 2 linhas), sinaliza corte com reticências na 2ª linha.
  const usadas = linhas.join(" ");
  if (usadas.length < full.replace(/\s+/g, " ").length && linhas.length === 2) {
    linhas[1] = `${linhas[1].slice(0, MAX_LINHA - 1)}…`;
  }
  return (
    <g transform={`translate(${x},${y})`}>
      {linhas.map((l, i) => (
        <text key={i} x={0} y={0} dy={12 + i * 11} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
          {l}
        </text>
      ))}
    </g>
  );
}

const selectCls =
  "mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

function agrupar<T extends string>(rows: ProducaoBpaRow[], key: (r: ProducaoBpaRow) => T, label: (r: ProducaoBpaRow) => string) {
  const map = new Map<T, { key: T; name: string; quantidade: number; atendimentos: number }>();
  for (const r of rows) {
    const k = key(r);
    const atual = map.get(k) ?? { key: k, name: label(r), quantidade: 0, atendimentos: 0 };
    atual.quantidade += r.quantidade;
    atual.atendimentos += 1;
    map.set(k, atual);
  }
  return [...map.values()].sort((a, b) => b.quantidade - a.quantidade);
}

function Home() {
  const [rows, setRows] = useState<ProducaoBpaRow[]>([]);
  const [vinculos, setVinculos] = useState<VinculoResumo[]>([]);
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [cnes, setCnes] = useState("todos");
  const [profissional, setProfissional] = useState("todos");
  const [procedimento, setProcedimento] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [nomesProc, setNomesProc] = useState<Record<string, string>>({});
  const [nomesCid, setNomesCid] = useState<Record<string, string>>({});
  const [nomesCbo, setNomesCbo] = useState<Record<string, string>>({});
  const [profDetalhe, setProfDetalhe] = useState<string | null>(null);
  const [procModalOpen, setProcModalOpen] = useState(false);
  const [resumoFpo, setResumoFpo] = useState<FpoResumoUnidade[]>([]);
  const [logoOrg, setLogoOrg] = useState<string | null>(null);
  const [nomesEstabFpo, setNomesEstabFpo] = useState<Record<string, string>>({});
  const fpoDetalheRef = useRef<HTMLDivElement>(null);
  // "Ver detalhes" do total: abre o "Ver mais" e rola até o detalhe por unidade.
  const verDetalhesFpo = () => {
    setVerMais(true);
    setTimeout(() => fpoDetalheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  // Detalhes (Top procedimentos, Ranking, FPO × Produção) ocultos por padrão; "Ver mais" expande.
  const [verMais, setVerMais] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const [vincs, producao] = await Promise.all([
      carregarVinculosUsuario(),
      carregarProducaoDashboard(competencia),
    ]);
    setVinculos(vincs);
    setRows(producao);
    setNomesProc(await carregarNomesProcedimentos(producao.map((r) => r.procedimento)));
    setNomesCid(await carregarDescricoesCid(producao.map((r) => r.cid).filter((c): c is string => !!c)));
    setNomesCbo(await carregarDescricoesCbo(producao.map((r) => r.cbo).filter((c): c is string => !!c)));
    setAtualizadoEm(new Date());
    setLoading(false);
  };

  const nomeProc = (codigo: string) => nomesProc[codigo] || null;
  // Descrição do CBO em MAIÚSCULAS, p/ casar com os nomes dos profissionais (também
  // gravados em maiúsculas) e manter o design uniforme no ranking.
  const nomeCbo = (cbo: string | null) => (cbo ? (nomesCbo[cbo] ? nomesCbo[cbo].toUpperCase() : null) : null);
  // Rótulo do profissional no ranking/filtros: nome (BPA-I/BPA-C v3) → descrição do CBO
  // (ocupação, p/ fichas antigas sem nome) → CNS → código do CBO. Assim o destaque é o
  // NOME DA OCUPAÇÃO e o código aparece pequeno ao lado (via detailFor), como nos procedimentos.
  const rotuloProfissional = (r: ProducaoBpaRow) =>
    nomeOuCodigo(r.profissional_nome, nomeCbo(r.cbo) || r.profissional_cns || r.cbo);
  // CID: "código — descrição" quando existe na tabela CID-10; senão só o código (fallback,
  // nunca inventa descrição).
  const rotuloCid = (cid: string | null) => {
    if (!cid) return "Sem CID";
    const d = nomesCid[cid];
    return d ? `${cid} — ${d}` : cid;
  };

  useEffect(() => { carregar(); }, [competencia]);
  useEffect(() => { carregarLogoOrg().then(setLogoOrg); }, []);
  useEffect(() => { setCnes("todos"); setProfissional("todos"); setProcedimento("todos"); }, [competencia]);

  const unidades = useMemo(() => agrupar(rows, (r) => r.cnes || "sem-cnes", (r) => nomeOuCodigo(r.estabelecimento_nome, r.cnes)), [rows]);
  const profissionais = useMemo(() => agrupar(rows, (r) => chaveProfissional(r), rotuloProfissional), [rows, nomesCbo]);
  // Opções do filtro de Procedimento: NOME (código), em ordem CRESCENTE de código.
  const procedimentos = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.procedimento && !map.has(r.procedimento)) map.set(r.procedimento, nomeProc(r.procedimento) || r.procedimento);
    return [...map.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, nomesProc]);

  const filtradas = useMemo(() => rows.filter((r) =>
    (cnes === "todos" || (r.cnes || "sem-cnes") === cnes) &&
    (profissional === "todos" || (chaveProfissional(r)) === profissional) &&
    (procedimento === "todos" || r.procedimento === procedimento)
  ), [rows, cnes, profissional, procedimento]);

  const kpis = useMemo(() => {
    const total = filtradas.reduce((s, r) => s + r.quantidade, 0);
    const bpaC = filtradas.filter((r) => r.tipo === "BPA-C").reduce((s, r) => s + r.quantidade, 0);
    const bpaI = filtradas.filter((r) => r.tipo === "BPA-I").reduce((s, r) => s + r.quantidade, 0);
    const unidadesAtivas = new Set(filtradas.map((r) => r.cnes).filter(Boolean)).size;
    const profissionaisAtivos = new Set(filtradas.map((r) => r.profissional_cns || r.profissional_nome || r.cbo).filter(Boolean)).size;
    return { total, bpaC, bpaI, unidadesAtivas, profissionaisAtivos };
  }, [filtradas]);

  const porTipo = useMemo(() => [
    { name: "BPA-C", value: kpis.bpaC },
    { name: "BPA-I", value: kpis.bpaI },
  ].filter((r) => r.value > 0), [kpis]);
  const topUnidades = useMemo(() => agrupar(filtradas, (r) => r.cnes || "sem-cnes", (r) => nomeOuCodigo(r.estabelecimento_nome, r.cnes)).slice(0, 8), [filtradas]);
  // Sem corte fixo: o ranking lista TODOS os profissionais do período (antes só top 8, o
  // que divergia do KPI "profissionais ativos"). A chave é a mesma do KPI (chaveProfissional).
  const topProfissionais = useMemo(() => agrupar(filtradas, (r) => chaveProfissional(r), rotuloProfissional), [filtradas, nomesCbo]);
  // Lista COMPLETA de procedimentos (todos), e o recorte top 10 exibido no card. O botão
  // "Ver completo" abre o modal com a lista inteira e detalhada.
  const procedimentosFull = useMemo(() => agrupar(filtradas, (r) => r.procedimento, (r) => nomeProc(r.procedimento) || r.procedimento), [filtradas, nomesProc]);
  const topProcedimentos = useMemo(() => procedimentosFull.slice(0, 10), [procedimentosFull]);

  // FPO × Produção: escopo = CNES vinculados (ou a unidade filtrada), no mês selecionado.
  const cnesEscopo = useMemo(
    () => (cnes === "todos" ? [...new Set(vinculos.map((v) => v.cnes).filter(Boolean))] : [cnes]),
    [vinculos, cnes],
  );
  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await carregarResumoFpo(cnesEscopo, competencia);
      if (!vivo) return;
      setResumoFpo(r);
      // Unidades com teto mas sem produção no mês não estão em `rows` (nome desconhecido):
      // busca o nome do cadastro para não exibir só o código.
      const nomes = await Promise.all(r.map(async (u) => [u.cnes, (await buscarEstabelecimento(u.cnes)) || ""] as const));
      if (vivo) setNomesEstabFpo((prev) => ({ ...prev, ...Object.fromEntries(nomes.filter(([, n]) => n)) }));
    })();
    return () => { vivo = false; };
  }, [cnesEscopo, competencia]);
  const nomeCnes = useMemo(() => {
    const m = new Map(unidades.map((u) => [u.key, u.name]));
    return (c: string) => m.get(c) || nomesEstabFpo[c] || c;
  }, [unidades, nomesEstabFpo]);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-[52px] z-30 border-b border-border bg-background/95 backdrop-blur md:top-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">SIA / SUS</p>
            <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">Dashboard SPA Digital</h1>
          </div>
          <button onClick={carregar} disabled={loading} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_oklch(0.6_0.18_260/0.55)] transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, oklch(0.62 0.17 250), oklch(0.55 0.19 278))" }}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Filtros */}
        <section className="mb-5 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5 md:grid-cols-4">
          <label className="text-xs font-medium text-foreground">
            Mês de produção
            <input type="month" value={`${competencia.slice(0, 4)}-${competencia.slice(4, 6)}`} onChange={(e) => setCompetencia(e.target.value.replace("-", ""))} className={selectCls} />
          </label>
          <label className="text-xs font-medium text-foreground">
            Unidade
            <select value={cnes} onChange={(e) => setCnes(e.target.value)} className={selectCls}>
              <option value="todos">Todas</option>
              {unidades.map((u) => <option key={u.key} value={u.key}>{u.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-foreground">
            Profissional
            <select value={profissional} onChange={(e) => setProfissional(e.target.value)} className={selectCls}>
              <option value="todos">Todos</option>
              {profissionais.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-foreground">
            Procedimento
            <select value={procedimento} onChange={(e) => setProcedimento(e.target.value)} className={selectCls}>
              <option value="todos">Todos</option>
              {procedimentos.map((p) => <option key={p.code} value={p.code}>{p.name !== p.code ? `${p.name} (${p.code})` : p.code}</option>)}
            </select>
          </label>
        </section>

        {/* Resumo FPO × Produção (total) — logo abaixo dos filtros. Detalhe fica no "Ver mais". */}
        {resumoFpo.length > 0 && (
          <ResumoFpoTotal resumo={resumoFpo} competencia={competencia} onVerDetalhes={verDetalhesFpo} />
        )}

        {/* KPIs */}
        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi icon={<TrendingUp className="size-4" />} label={`Produção · ${mesLabel(competencia)}`} value={kpis.total} destaque />
          <Kpi icon={<FileText className="size-4" />} label="BPA-C" value={kpis.bpaC} />
          <Kpi icon={<Stethoscope className="size-4" />} label="BPA-I" value={kpis.bpaI} />
          <Kpi icon={<Building2 className="size-4" />} label="Unidades ativas" value={kpis.unidadesAtivas} />
          <Kpi icon={<Users className="size-4" />} label="Profissionais ativos" value={kpis.profissionaisAtivos} />
        </section>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-14 text-center shadow-sm">
            <RefreshCw className="mx-auto size-6 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Carregando produção...</p>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-14 text-center shadow-sm">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Activity className="size-6" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground">Ainda não há produção registrada em {mesLabel(competencia)}.</h2>
            <p className="mt-1 text-sm text-muted-foreground">A dashboard preenche com as fichas BPA-C/BPA-I salvas neste mês de produção.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartBox title="Produção por unidade" className="lg:col-span-2">
              <ChartContainer config={{ quantidade: { label: "Quantidade", color: "var(--color-chart-1)" } }} className="h-72 w-full">
                <BarChart data={topUnidades} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" interval={0} height={44} tickLine={false} axisLine={false} tick={<TickUnidade />} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="quantidade" radius={[6, 6, 0, 0]}>
                    {topUnidades.map((u, i) => <Cell key={u.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </ChartBox>

            <ChartBox title="BPA-C x BPA-I">
              <ChartContainer config={{ "BPA-C": { label: "BPA-C", color: "var(--color-chart-2)" }, "BPA-I": { label: "BPA-I", color: "var(--color-chart-1)" } }} className="h-72 w-full">
                <PieChart>
                  <Pie data={porTipo} dataKey="value" nameKey="name" innerRadius={54} outerRadius={84} paddingAngle={3} strokeWidth={2}>
                    {porTipo.map((_, i) => <Cell key={i} fill={i === 0 ? "var(--color-chart-2)" : "var(--color-chart-1)"} />)}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                </PieChart>
              </ChartContainer>
              <div className="mt-3 flex items-center justify-center gap-4 text-xs">
                {porTipo.map((t, i) => (
                  <span key={t.name} className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: i === 0 ? "var(--color-chart-2)" : "var(--color-chart-1)" }} />
                    {t.name} · {t.value.toLocaleString("pt-BR")}
                  </span>
                ))}
              </div>
            </ChartBox>

            {verMais && (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3">
                  <Ranking title="Top procedimentos" rows={topProcedimentos} detailFor={(k) => k}
                    hint={`top 10 de ${procedimentosFull.length} procedimento${procedimentosFull.length === 1 ? "" : "s"}`}
                    onVerCompleto={procedimentosFull.length > 0 ? () => setProcModalOpen(true) : undefined} />
                  <Ranking title="Ranking por profissional" rows={topProfissionais} onRowClick={setProfDetalhe} detailFor={(k) => k} hint="Toque num profissional para ver os detalhes" />
                </div>
                <div ref={fpoDetalheRef} className="scroll-mt-24 lg:col-span-3">
                  <ResumoFpo resumo={resumoFpo} nomeCnes={nomeCnes} competencia={competencia} />
                </div>
              </>
            )}
          </div>
        )}

        {!loading && filtradas.length > 0 && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => setVerMais((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              {verMais ? "Ver menos" : "Ver mais detalhes"}
              <ChevronDown className={`size-4 transition-transform ${verMais ? "rotate-180" : ""}`} />
            </button>
          </div>
        )}

        {profDetalhe && (
          <ProfissionalDetalhe
            chave={profDetalhe}
            rows={filtradas.filter((r) => (chaveProfissional(r)) === profDetalhe)}
            nomeProc={nomeProc}
            rotuloCid={rotuloCid}
            competenciaLabel={mesLabel(competencia)}
            logo={logoOrg}
            onClose={() => setProfDetalhe(null)}
          />
        )}

        {procModalOpen && (
          <ProcedimentosModal rows={procedimentosFull} onClose={() => setProcModalOpen(false)} />
        )}

        {atualizadoEm && (
          <p className="mt-5 text-center text-[11px] text-muted-foreground">
            Atualizado às {atualizadoEm.toLocaleTimeString("pt-BR")} · dados carregados na abertura da página
          </p>
        )}
      </main>
    </div>
  );
}

function Kpi({ icon, label, value, destaque = false }: { icon: React.ReactNode; label: string; value: number; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${destaque ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2">
        <div className={`flex size-7 items-center justify-center rounded-md ${destaque ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
          {icon}
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}

function ChartBox({ title, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

const brlFmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Barra de progresso produzido/teto: verde até 100%, vermelha quando estoura.
function Barra({ pct, thick }: { pct: number; thick?: boolean }) {
  const over = pct > 1;
  return (
    <div className={`${thick ? "h-3" : "h-2"} w-full overflow-hidden rounded-full bg-muted`}>
      <div className={`h-full rounded-full ${over ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%` }} />
    </div>
  );
}

// Card "FPO × Produção": teto orçado vs produzido no mês, por unidade vinculada.
// Resumo do TOTAL (sempre visível, abaixo dos filtros). "Ver detalhes" rola até o detalhe por unidade.
function ResumoFpoTotal({ resumo, competencia, onVerDetalhes }: {
  resumo: FpoResumoUnidade[];
  competencia: string;
  onVerDetalhes: () => void;
}) {
  const tot = resumo.reduce(
    (a, u) => ({ tetoRS: a.tetoRS + u.tetoRS, prodRS: a.prodRS + u.produzidoRS }),
    { tetoRS: 0, prodRS: 0 },
  );
  const saldoRS = tot.tetoRS - tot.prodRS;
  const pct = tot.tetoRS > 0 ? tot.prodRS / tot.tetoRS : 0;
  const over = pct > 1;
  const pctTxt = pct > 0 && pct < 0.1 ? (pct * 100).toFixed(1).replace(".", ",") : (pct * 100).toFixed(0);
  return (
    <section className="relative mb-5 overflow-hidden rounded-[20px] px-5 py-6 text-white shadow-[0_16px_36px_-16px_oklch(0.3_0.1_260/0.55)] sm:px-7"
      style={{ background: "linear-gradient(120deg, oklch(0.28 0.06 258), oklch(0.36 0.10 268), oklch(0.44 0.13 240))" }}>
      <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full" style={{ background: "radial-gradient(circle, oklch(0.85 0.1 235 / 0.25), transparent 70%)" }} />
      <div className="relative mb-5 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold opacity-90">
          <TrendingUp className="size-4" /> FPO × Produção · {mesLabel(competencia)}
        </h2>
        <button onClick={onVerDetalhes} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold opacity-90 transition-opacity hover:opacity-100">
          Ver detalhes <ChevronDown className="size-3.5" />
        </button>
      </div>
      <div className="relative mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/60">Produzido</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums sm:text-[26px]">{brlFmt(tot.prodRS)}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/60">Orçado (teto)</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-white/80 sm:text-[26px]">{brlFmt(tot.tetoRS)}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/60">Saldo</p>
          <p className={`mt-0.5 text-2xl font-bold tabular-nums sm:text-[26px] ${saldoRS < 0 ? "text-rose-300" : "text-emerald-300"}`}>{brlFmt(saldoRS)}</p>
        </div>
      </div>
      <div className="relative flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15">
          <div className={`h-full rounded-full transition-[width] ${over ? "bg-gradient-to-r from-rose-300 to-rose-500" : "bg-gradient-to-r from-emerald-300 to-emerald-400"}`} style={{ width: `${Math.min(100, Math.max(2, pct * 100))}%` }} />
        </div>
        <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold tabular-nums text-white">{pctTxt}% do teto</span>
      </div>
    </section>
  );
}

// Detalhe por unidade (no "Ver mais detalhes"). Cada unidade abre o FPO da unidade.
function ResumoFpo({ resumo, nomeCnes, competencia }: {
  resumo: FpoResumoUnidade[];
  nomeCnes: (c: string) => string;
  competencia: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">FPO × Produção · por unidade</h2>
        <Link to="/fpo" search={{ comp: competencia }} className="shrink-0 text-[11px] font-semibold text-primary hover:underline">Abrir FPO</Link>
      </div>
      {resumo.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem FPO cadastrada para as unidades vinculadas neste mês. Importe o teto na página FPO.</p>
      ) : (
        <ul className="space-y-3">
            {resumo.map((u) => {
              const p = u.tetoRS > 0 ? u.produzidoRS / u.tetoRS : 0;
              const nome = nomeCnes(u.cnes);
              return (
                <li key={u.cnes}>
                  <Link to="/fpo" search={{ cnes: u.cnes, comp: competencia }}
                    className="-mx-2 block rounded-lg px-2 py-1 text-sm transition-colors hover:bg-muted"
                    title="Ver o FPO desta unidade">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="min-w-0 truncate font-medium">{nome}</span>
                        {nome !== u.cnes && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{u.cnes}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{brlFmt(u.produzidoRS)} / {brlFmt(u.tetoRS)} · {(p * 100).toFixed(0)}%</span>
                    </div>
                    <Barra pct={p} />
                    {(u.estourados > 0 || u.produzidoForaQtd > 0) && (
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                        {u.estourados > 0 && <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700">{u.estourados} procedimento(s) acima do teto</span>}
                        {u.produzidoForaQtd > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">{u.produzidoForaQtd} produzido(s) sem teto</span>}
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
      )}
    </div>
  );
}

function Ranking({ title, rows, empty = "Sem dados", detailFor, onRowClick, hint, onVerCompleto }: {
  title: string;
  rows: { key: string; name: string; quantidade: number }[];
  empty?: string;
  detailFor?: (key: string) => string | null; // legenda secundária (ex.: código) mostrada só se diferir do nome
  onRowClick?: (key: string) => void;
  hint?: string;
  // Quando fornecido, mostra um botão "Ver completo" no cabeçalho (abre o modal com a lista inteira).
  onVerCompleto?: () => void;
}) {
  const max = rows[0]?.quantidade || 1;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="flex items-baseline gap-2">
          {hint && rows.length > 0 && <span className="text-[10px] text-muted-foreground">{hint}</span>}
          {onVerCompleto && rows.length > 0 && (
            <button type="button" onClick={onVerCompleto} className="shrink-0 text-[11px] font-semibold text-primary hover:underline">
              Ver completo
            </button>
          )}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((r, i) => {
            const detalhe = detailFor?.(r.key);
            const mostrarDetalhe = detalhe && detalhe !== r.name;
            const Wrapper = onRowClick ? "button" : "div";
            return (
              <li key={r.key} className="text-sm">
                <Wrapper
                  type={onRowClick ? "button" : undefined}
                  onClick={onRowClick ? () => onRowClick(r.key) : undefined}
                  className={`block w-full text-left ${onRowClick ? "-mx-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted" : ""}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 truncate text-foreground">{r.name}</span>
                      {mostrarDetalhe && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{detalhe}</span>}
                    </span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">{r.quantidade.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(6, (r.quantidade / max) * 100)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  </div>
                </Wrapper>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// Modal com a lista COMPLETA e detalhada de procedimentos (todos, não só o top 10).
// Mostra posição, nome, código, nº de atendimentos (linhas) e quantidade, ordenado desc.
function ProcedimentosModal({ rows, onClose }: {
  rows: { key: string; name: string; quantidade: number; atendimentos: number }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  const max = rows[0]?.quantidade || 1;
  const totalQtd = rows.reduce((s, r) => s + r.quantidade, 0);
  const totalAtend = rows.reduce((s, r) => s + r.atendimentos, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <FileText className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Todos os procedimentos</h2>
              <p className="text-xs text-muted-foreground">
                {rows.length} procedimento{rows.length === 1 ? "" : "s"} · {totalQtd.toLocaleString("pt-BR")} quantidade · {totalAtend.toLocaleString("pt-BR")} atendimento{totalAtend === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>

        <ol className="divide-y divide-border p-5">
          {rows.map((r, i) => (
            <li key={r.key} className="py-2.5">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-6 shrink-0 text-right text-xs font-semibold text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 truncate text-sm text-foreground">{r.name}</span>
                  {r.name !== r.key && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{r.key}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{r.atendimentos} atend.</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">{r.quantidade.toLocaleString("pt-BR")}</span>
                </span>
              </div>
              <div className="ml-8 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${Math.max(4, (r.quantidade / max) * 100)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// Item agrupado (mesma forma de `agrupar`): usado nas listas do relatório de impressão.
interface ItemAgrupado { key: string; name: string; quantidade: number; atendimentos: number }

// Abre uma janela nova com um relatório A4 autocontido da produção do profissional (o
// conteúdo do modal) e dispara a impressão nativa do navegador. Não mexe no CSS da
// dashboard — o relatório é um documento próprio, com seu próprio estilo de impressão.
function imprimirProducaoProfissional(d: {
  nome: string; cns: string | null; cbo: string | null; competenciaLabel: string;
  logo: string | null;
  totalQtd: number; atendimentos: number; bpaC: number; bpaI: number;
  procedimentos: ItemAgrupado[]; unidades: ItemAgrupado[]; carateres: ItemAgrupado[]; cids: ItemAgrupado[];
}) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const num = (n: number) => n.toLocaleString("pt-BR");

  const linhaProc = (p: ItemAgrupado) => `
    <tr>
      <td>${esc(p.name)}${p.name !== p.key ? ` <span class="cod">${esc(p.key)}</span>` : ""}</td>
      <td class="num">${num(p.quantidade)}</td>
    </tr>`;
  const chip = (c: ItemAgrupado, mostrarKey: boolean) =>
    `<li>${esc(c.name)}${mostrarKey && c.name !== c.key ? ` <span class="cod">${esc(c.key)}</span>` : ""} <b>${num(c.quantidade)}</b></li>`;

  const bloco = (titulo: string, itens: ItemAgrupado[], mostrarKey: boolean) =>
    itens.length === 0 ? "" : `
      <section>
        <h2>${esc(titulo)}</h2>
        <ul class="chips">${itens.map((c) => chip(c, mostrarKey)).join("")}</ul>
      </section>`;

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Produção — ${esc(d.nome)}</title>
<style>
  /* margin: 0 no @page faz o Chrome NÃO imprimir o cabeçalho/rodapé automático (data,
     "about:blank", nº de página). As margens do conteúdo vêm do padding do body. */
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111827; margin: 0; padding: 14mm; font-size: 12px; }
  header { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 14px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  header .logo { max-height: 56px; max-width: 160px; width: auto; height: auto; object-fit: contain; }
  header .tit { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; }
  header h1 { font-size: 20px; margin: 2px 0 6px; }
  header .meta { font-size: 11px; color: #374151; display: flex; flex-wrap: wrap; gap: 14px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
  .stats div { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; }
  .stats span { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
  .stats b { font-size: 18px; }
  section { margin-bottom: 16px; page-break-inside: avoid; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 4px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; width: 70px; }
  .cod { color: #9ca3af; font-family: ui-monospace, monospace; font-size: 10px; }
  ul.chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  ul.chips li { border: 1px solid #e5e7eb; border-radius: 999px; padding: 3px 9px; }
  ul.chips b { margin-left: 4px; }
  footer { margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 10px; color: #9ca3af; }
  @media screen { body { max-width: 800px; margin: 24px auto; padding: 0 16px; } }
</style></head>
<body>
  <header>
    <div>
      <div class="tit">Relatório de produção · SPA Digital</div>
      <h1>${esc(d.nome)}</h1>
      <div class="meta">
        <span>Competência: <b>${esc(d.competenciaLabel)}</b></span>
        ${d.cns ? `<span>CNS: ${esc(d.cns)}</span>` : ""}
        ${d.cbo ? `<span>CBO: ${esc(d.cbo)}</span>` : ""}
      </div>
    </div>
    ${d.logo ? `<img class="logo" src="${esc(d.logo)}" alt="Logo" />` : ""}
  </header>
  <div class="stats">
    <div><span>Procedimentos</span><b>${num(d.totalQtd)}</b></div>
    <div><span>Atendimentos</span><b>${num(d.atendimentos)}</b></div>
    <div><span>BPA-C</span><b>${num(d.bpaC)}</b></div>
    <div><span>BPA-I</span><b>${num(d.bpaI)}</b></div>
  </div>
  <section>
    <h2>Procedimentos realizados</h2>
    <table><tbody>${d.procedimentos.map(linhaProc).join("")}</tbody></table>
  </section>
  ${bloco("Unidades", d.unidades, false)}
  ${bloco("Caráter de atendimento", d.carateres, true)}
  ${bloco("CID mais frequentes", d.cids, false)}
  <footer>Gerado pelo SPA Digital em ${new Date().toLocaleString("pt-BR")}.</footer>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Aguarda o layout antes de imprimir (evita janela em branco em alguns navegadores).
  win.onload = () => { win.focus(); win.print(); };
}

function ProfissionalDetalhe({ chave, rows, nomeProc, rotuloCid, competenciaLabel, logo, onClose }: {
  chave: string;
  rows: ProducaoBpaRow[];
  nomeProc: (codigo: string) => string | null;
  rotuloCid: (cid: string | null) => string;
  competenciaLabel: string;
  logo: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const nome = rows.find((r) => r.profissional_nome)?.profissional_nome || chave;
  const cns = rows.find((r) => r.profissional_cns)?.profissional_cns || null;
  const cbo = rows.find((r) => r.cbo)?.cbo || null;
  const totalQtd = rows.reduce((s, r) => s + r.quantidade, 0);
  const atendimentos = rows.length;
  const bpaC = rows.filter((r) => r.tipo === "BPA-C").reduce((s, r) => s + r.quantidade, 0);
  const bpaI = rows.filter((r) => r.tipo === "BPA-I").reduce((s, r) => s + r.quantidade, 0);
  const unidades = agrupar(rows, (r) => r.cnes || "sem-cnes", (r) => nomeOuCodigo(r.estabelecimento_nome, r.cnes));
  const procedimentos = agrupar(rows, (r) => r.procedimento, (r) => nomeProc(r.procedimento) || r.procedimento);
  const cids = agrupar(rows.filter((r) => r.cid), (r) => r.cid || "?", (r) => rotuloCid(r.cid));
  const carateres = agrupar(rows.filter((r) => r.carater), (r) => r.carater || "?", (r) => nomeCarater(r.carater) || `Caráter ${r.carater}`);

  const [fichasOpen, setFichasOpen] = useState(false);

  const imprimir = () => imprimirProducaoProfissional({
    nome, cns, cbo, competenciaLabel, logo,
    totalQtd, atendimentos, bpaC, bpaI,
    procedimentos, unidades, carateres, cids,
  });

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {(nome || "?").trim().slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">{nome}</h2>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {cns && <span className="inline-flex items-center gap-1"><IdCard className="size-3" /> CNS {cns}</span>}
                {cbo && <span className="inline-flex items-center gap-1"><Stethoscope className="size-3" /> CBO {cbo}</span>}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              onClick={imprimir}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <FileText className="size-3.5" /> Imprimir resumo
            </button>
            <button
              onClick={() => setFichasOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Printer className="size-3.5" /> Imprimir fichas
            </button>
            <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Procedimentos" value={totalQtd} destaque />
            <MiniStat label="Atendimentos" value={atendimentos} />
            <MiniStat label="BPA-C" value={bpaC} />
            <MiniStat label="BPA-I" value={bpaI} />
          </div>

          <DetalheBloco titulo="Procedimentos realizados" icon={<FileText className="size-3.5" />}>
            <ul className="divide-y divide-border">
              {procedimentos.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 truncate text-foreground">{p.name}</span>
                    {p.name !== p.key && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{p.key}</span>}
                  </span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">{p.quantidade.toLocaleString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          </DetalheBloco>

          <DetalheBloco titulo="Unidades" icon={<MapPin className="size-3.5" />}>
            <ul className="flex flex-wrap gap-2">
              {unidades.map((u) => (
                <li key={u.key} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground">
                  {u.name} <span className="rounded-full bg-primary/10 px-1.5 font-semibold tabular-nums text-primary">{u.quantidade}</span>
                </li>
              ))}
            </ul>
          </DetalheBloco>

          {carateres.length > 0 && (
            <DetalheBloco titulo="Caráter de atendimento" icon={<Activity className="size-3.5" />}>
              <ul className="flex flex-wrap gap-2">
                {carateres.map((c) => (
                  <li key={c.key} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground">
                    {c.name} <span className="font-mono text-[10px] text-muted-foreground">{c.key}</span>
                    <span className="rounded-full bg-primary/10 px-1.5 font-semibold tabular-nums text-primary">{c.quantidade}</span>
                  </li>
                ))}
              </ul>
            </DetalheBloco>
          )}

          {cids.length > 0 && (
            <DetalheBloco titulo="CID mais frequentes" icon={<IdCard className="size-3.5" />}>
              <ul className="flex flex-wrap gap-2">
                {cids.map((c) => (
                  <li key={c.key} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground">
                    {c.name} <span className="rounded-full bg-primary/10 px-1.5 font-semibold tabular-nums text-primary">{c.quantidade}</span>
                  </li>
                ))}
              </ul>
            </DetalheBloco>
          )}
        </div>
      </div>
    </div>
    {fichasOpen && (
      <ImprimirFichasProfissional nome={nome} rows={rows} nomeProc={nomeProc} onClose={() => setFichasOpen(false)} />
    )}
    </>
  );
}

// Modal p/ imprimir as FICHAS (folhas do BPA, não o resumo) de um profissional, podendo
// filtrar por competência (atendimento) e por procedimento. Monta a lista de ids e abre a
// página /imprimir (mesma usada em "Minhas fichas"), que captura cada ficha e imprime.
function ImprimirFichasProfissional({ nome, rows, nomeProc, onClose }: {
  nome: string;
  rows: ProducaoBpaRow[];
  nomeProc: (codigo: string) => string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const [comp, setComp] = useState("todas");
  const [proc, setProc] = useState("todos");

  // Agrupa as linhas de produção por ficha (uma ficha tem várias linhas/procedimentos).
  const fichas = useMemo(() => {
    const map = new Map<string, { id: string; tipo: TipoBpa; competencia: string; procs: Set<string> }>();
    for (const r of rows) {
      if (!r.ficha_id) continue;
      const f = map.get(r.ficha_id) ?? { id: r.ficha_id, tipo: r.tipo, competencia: r.competencia, procs: new Set<string>() };
      f.procs.add(r.procedimento);
      map.set(r.ficha_id, f);
    }
    return [...map.values()];
  }, [rows]);

  const competencias = useMemo(
    () => [...new Set(rows.map((r) => r.competencia).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [rows],
  );
  const procedimentos = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (!map.has(r.procedimento)) map.set(r.procedimento, nomeProc(r.procedimento) || r.procedimento);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, nomeProc]);

  const selecionadas = fichas.filter(
    (f) => (comp === "todas" || f.competencia === comp) && (proc === "todos" || f.procs.has(proc)),
  );

  const imprimir = () => {
    if (selecionadas.length === 0) return;
    const itens = selecionadas.map((f) => `${f.tipo === "BPA-C" ? "C" : "I"}~${f.id}`).join(",");
    window.open(`/imprimir?itens=${encodeURIComponent(itens)}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground"><Printer className="size-4" /> Imprimir fichas</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{nome}</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competência</span>
            <select value={comp} onChange={(e) => setComp(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
              <option value="todas">Todas as competências</option>
              {competencias.map((c) => <option key={c} value={c}>{mesLabel(c)}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Procedimento</span>
            <select value={proc} onChange={(e) => setProc(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
              <option value="todos">Todos os procedimentos</option>
              {procedimentos.map(([cod, label]) => <option key={cod} value={cod}>{label !== cod ? `${label} (${cod})` : cod}</option>)}
            </select>
          </label>

          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            <b className="tabular-nums">{selecionadas.length}</b> ficha{selecionadas.length === 1 ? "" : "s"} selecionada{selecionadas.length === 1 ? "" : "s"} para impressão.
          </div>

          <button
            onClick={imprimir}
            disabled={selecionadas.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Printer className="size-4" /> Imprimir {selecionadas.length > 0 ? `${selecionadas.length} ` : ""}ficha{selecionadas.length === 1 ? "" : "s"}
          </button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Abre uma nova aba que prepara as folhas de cada ficha e chama a impressão do navegador.
          </p>
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

function DetalheBloco({ titulo, icon, children }: { titulo: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{icon} {titulo}</h3>
      {children}
    </section>
  );
}
