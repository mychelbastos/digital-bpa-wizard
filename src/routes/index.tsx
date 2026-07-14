import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  Activity, Building2, FileText, IdCard, LogOut, MapPin, RefreshCw, Settings,
  ShieldCheck, Stethoscope, TrendingUp, Users, X,
} from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  carregarVinculosUsuario, carregarNomesProcedimentos, carregarProducaoDashboard,
  type VinculoResumo, type ProducaoBpaRow,
} from "@/lib/dashboard-producao";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";
import { useAuthUser, signOut } from "@/lib/bpa-i-v2/auth";

const CARATER_NOME = new Map(CARATERES.map((c) => [c.code, c.label]));
const nomeCarater = (code: string | null) => (code ? CARATER_NOME.get(code) ?? null : null);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard BPA Digital" },
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
const CHART_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

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
  const user = useAuthUser();
  const [rows, setRows] = useState<ProducaoBpaRow[]>([]);
  const [vinculos, setVinculos] = useState<VinculoResumo[]>([]);
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [cnes, setCnes] = useState("todos");
  const [profissional, setProfissional] = useState("todos");
  const [procedimento, setProcedimento] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [nomesProc, setNomesProc] = useState<Record<string, string>>({});
  const [profDetalhe, setProfDetalhe] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const [vincs, producao] = await Promise.all([
      carregarVinculosUsuario(),
      carregarProducaoDashboard(competencia),
    ]);
    setVinculos(vincs);
    setRows(producao);
    setNomesProc(await carregarNomesProcedimentos(producao.map((r) => r.procedimento)));
    setAtualizadoEm(new Date());
    setLoading(false);
  };

  const nomeProc = (codigo: string) => nomesProc[codigo] || null;

  useEffect(() => { carregar(); }, [competencia]);
  useEffect(() => { setCnes("todos"); setProfissional("todos"); setProcedimento("todos"); }, [competencia]);

  const unidades = useMemo(() => agrupar(rows, (r) => r.cnes || "sem-cnes", (r) => nomeOuCodigo(r.estabelecimento_nome, r.cnes)), [rows]);
  const profissionais = useMemo(() => agrupar(rows, (r) => r.profissional_cns || r.cbo || "sem-profissional", (r) => nomeOuCodigo(r.profissional_nome, r.profissional_cns || r.cbo)), [rows]);
  const procedimentos = useMemo(() => agrupar(rows, (r) => r.procedimento, (r) => r.procedimento), [rows]);

  const filtradas = useMemo(() => rows.filter((r) =>
    (cnes === "todos" || (r.cnes || "sem-cnes") === cnes) &&
    (profissional === "todos" || (r.profissional_cns || r.cbo || "sem-profissional") === profissional) &&
    (procedimento === "todos" || r.procedimento === procedimento)
  ), [rows, cnes, profissional, procedimento]);

  const kpis = useMemo(() => {
    const total = filtradas.reduce((s, r) => s + r.quantidade, 0);
    const bpaC = filtradas.filter((r) => r.tipo === "BPA-C").reduce((s, r) => s + r.quantidade, 0);
    const bpaI = filtradas.filter((r) => r.tipo === "BPA-I").reduce((s, r) => s + r.quantidade, 0);
    const unidadesAtivas = new Set(filtradas.map((r) => r.cnes).filter(Boolean)).size;
    const profissionaisAtivos = new Set(filtradas.map((r) => r.profissional_cns || r.cbo).filter(Boolean)).size;
    return { total, bpaC, bpaI, unidadesAtivas, profissionaisAtivos };
  }, [filtradas]);

  const porTipo = useMemo(() => [
    { name: "BPA-C", value: kpis.bpaC },
    { name: "BPA-I", value: kpis.bpaI },
  ].filter((r) => r.value > 0), [kpis]);
  const topUnidades = useMemo(() => agrupar(filtradas, (r) => r.cnes || "sem-cnes", (r) => nomeOuCodigo(r.estabelecimento_nome, r.cnes)).slice(0, 8), [filtradas]);
  const topProfissionais = useMemo(() => agrupar(filtradas, (r) => r.profissional_cns || r.cbo || "sem-profissional", (r) => nomeOuCodigo(r.profissional_nome, r.profissional_cns || r.cbo)).slice(0, 8), [filtradas]);
  const topProcedimentos = useMemo(() => agrupar(filtradas, (r) => r.procedimento, (r) => nomeProc(r.procedimento) || r.procedimento).slice(0, 10), [filtradas, nomesProc]);
  const topCid = useMemo(() => agrupar(filtradas.filter((r) => r.cid), (r) => r.cid || "sem-cid", (r) => r.cid || "Sem CID").slice(0, 8), [filtradas]);
  const porCarater = useMemo(() => agrupar(filtradas.filter((r) => r.carater), (r) => r.carater || "sem-carater", (r) => nomeCarater(r.carater) || `Caráter ${r.carater}`).slice(0, 6), [filtradas]);

  // Escopo exibido, derivado dos VÍNCULOS (não de um "papel" na conta). É só rótulo — o
  // acesso real é decidido pela RLS/permissão no banco.
  const escopo = useMemo(() => {
    const cnesSet = new Set(vinculos.map((v) => v.cnes));
    const coordena = vinculos.some((v) => v.papel !== "digitador") || cnesSet.size > 1;
    if (coordena) return { label: "Coordenação", desc: `Você vê a produção de ${cnesSet.size} unidade${cnesSet.size > 1 ? "s" : ""} vinculada${cnesSet.size > 1 ? "s" : ""}.`, icon: <ShieldCheck className="size-4" /> };
    const cnes = [...cnesSet][0];
    if (cnes) return { label: `Unidade ${cnes}`, desc: "Produção das suas fichas nesta unidade.", icon: <Building2 className="size-4" /> };
    return { label: "Sem vínculo ativo", desc: "Você não tem vínculo ativo com nenhuma unidade.", icon: <Activity className="size-4" /> };
  }, [vinculos]);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">SIA / SUS</p>
            <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">Dashboard BPA Digital</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {user && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary ring-1 ring-primary/20">
                <Users className="size-3.5" /> {user.nome || user.email}
              </span>
            )}
            <Link to="/perfil" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Settings className="size-3.5" /> Perfil
            </Link>
            <button onClick={() => signOut()} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <LogOut className="size-3.5" /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Faixa de escopo + ações */}
        <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              {escopo.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{escopo.label}</p>
              <p className="text-xs text-muted-foreground">{escopo.desc} PDFs não são enviados para a nuvem, só os dados estruturados.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/bpa-c-v2" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
              <FileText className="size-4" /> BPA-C
            </Link>
            <Link to="/bpa-i-v3" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
              <FileText className="size-4" /> BPA-I
            </Link>
            <button onClick={carregar} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60">
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>
        </section>

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
              {procedimentos.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </label>
        </section>

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
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={58} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="quantidade" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
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

            <Ranking title="Top procedimentos" rows={topProcedimentos} detailFor={(k) => k} />
            <Ranking title="Ranking por profissional" rows={topProfissionais} onRowClick={setProfDetalhe} hint="Toque num profissional para ver os detalhes" />
            <Ranking title="CID mais frequentes" rows={topCid} empty="Sem CID informado" />
            <Ranking title="Caráter de atendimento" rows={porCarater} detailFor={(k) => k} empty="Sem caráter informado" />
          </div>
        )}

        {profDetalhe && (
          <ProfissionalDetalhe
            chave={profDetalhe}
            rows={filtradas.filter((r) => (r.profissional_cns || r.cbo || "sem-profissional") === profDetalhe)}
            nomeProc={nomeProc}
            onClose={() => setProfDetalhe(null)}
          />
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

function Ranking({ title, rows, empty = "Sem dados", detailFor, onRowClick, hint }: {
  title: string;
  rows: { key: string; name: string; quantidade: number }[];
  empty?: string;
  detailFor?: (key: string) => string | null; // legenda secundária (ex.: código) mostrada só se diferir do nome
  onRowClick?: (key: string) => void;
  hint?: string;
}) {
  const max = rows[0]?.quantidade || 1;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {hint && rows.length > 0 && <span className="text-[10px] text-muted-foreground">{hint}</span>}
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

function ProfissionalDetalhe({ chave, rows, nomeProc, onClose }: {
  chave: string;
  rows: ProducaoBpaRow[];
  nomeProc: (codigo: string) => string | null;
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
  const cids = agrupar(rows.filter((r) => r.cid), (r) => r.cid || "?", (r) => r.cid || "?");
  const carateres = agrupar(rows.filter((r) => r.carater), (r) => r.carater || "?", (r) => nomeCarater(r.carater) || `Caráter ${r.carater}`);

  return (
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
          <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
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
