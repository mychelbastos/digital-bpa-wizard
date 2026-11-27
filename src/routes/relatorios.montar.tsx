// Montar relatório: linhas × colunas × contagem × filtros × informações extras, com prévia em
// tabela/gráfico. A mesma estrutura (montarPivo + linhas formatadas) alimenta a prévia, o CSV e
// o PDF ajustável — o que se vê é o que sai.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  Download,
  FileText,
  Info,
  Loader2,
  Plus,
  Printer,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase, buscarTodasPaginado } from "@/lib/supabase";
import { usePermissoes } from "@/lib/permissoes";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import {
  carregarProducaoPeriodoRapido,
  carregarNomesProcedimentos,
  carregarDescricoesCid,
  carregarDescricoesCbo,
  type ProducaoBpaRow,
} from "@/lib/dashboard-producao";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { baixarCsv } from "@/lib/relatorios/producao";
import {
  montarPivo,
  chaveDim,
  chaveProfissional,
  faixaEtaria,
  periodoAnterior,
  ROTULO_DIM,
  FAIXAS,
  type DimColuna,
  type DimLinha,
  type Medida,
} from "@/lib/relatorios/pivo";
import {
  indexarTetos,
  resumirValor,
  brl,
  type IndiceTetos,
  type TetoValor,
} from "@/lib/relatorios/valores";
import { gerarPdfTabela, type ColunaPdf } from "@/lib/relatorios/pdf-tabela";
import {
  salvarModelo,
  obterModelo,
  COMPARTILHAR_DISPONIVEL,
  type ConfigRelatorio,
  type DimFiltro,
  type ExtrasModelo,
} from "@/lib/relatorios/modelos";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";
import {
  MultiSelect,
  SemAcesso,
  BarraFiltrosBase,
  mesLabel,
  mesOffset,
  competenciaPadrao,
} from "@/components/relatorios/comum";
import { PdfAjustavelModal } from "@/components/relatorios/PdfAjustavelModal";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface BuscaMontar {
  modelo?: string;
  inicio?: "valores" | "tendencia";
}
export const Route = createFileRoute("/relatorios/montar")({
  validateSearch: (s: Record<string, unknown>): BuscaMontar => ({
    modelo: typeof s.modelo === "string" ? s.modelo : undefined,
    inicio: s.inicio === "valores" || s.inicio === "tendencia" ? s.inicio : undefined,
  }),
  head: () => ({ meta: [{ title: "Montar relatório — SPA Digital" }] }),
  component: MontarRelatorio,
});

const CARATER_NOME = new Map(CARATERES.map((c) => [c.code, c.label]));
const nomeOuCodigo = (nome: string | null, codigo: string | null) =>
  nome?.trim() || codigo || "Não informado";
const TIPOS = ["BPA-C", "BPA-I", "RAAS"] as const;
const CORES = ["#257DE0", "#F47230", "#00B894", "#F2A600"];
const intFmt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const decFmt = (n: number, d = 1) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pctFmt = (p: number) => `${decFmt(p * 100, 1)}%`;

const DIMS_LINHA: DimLinha[] = [
  "unidade",
  "profissional",
  "procedimento",
  "cid",
  "faixa",
  "tipo",
  "mes",
];
const DIMS_COLUNA: DimColuna[] = ["nada", "mes", "tipo", "unidade"];
const DIMS_FILTRO: { id: DimFiltro; rotulo: string }[] = [
  { id: "unidade", rotulo: "Unidade" },
  { id: "profissional", rotulo: "Profissional" },
  { id: "procedimento", rotulo: "Procedimento" },
  { id: "cid", rotulo: "CID" },
  { id: "carater", rotulo: "Caráter" },
  { id: "faixa", rotulo: "Faixa etária" },
];
const EXTRAS_INFO: { id: keyof ExtrasModelo; rotulo: string; desc: string }[] = [
  {
    id: "unitario",
    rotulo: "Valor unitário",
    desc: "Pelo teto da FPO vigente. Aparece ao agrupar por procedimento.",
  },
  {
    id: "valorTotal",
    rotulo: "Valor total (R$)",
    desc: "Quantidade × valor unitário de cada procedimento.",
  },
  { id: "pct", rotulo: "% do total", desc: "Participação de cada linha no período." },
  { id: "comparar", rotulo: "Comparar com o período anterior", desc: "" },
  { id: "media", rotulo: "Média por atendimento", desc: "Procedimentos ÷ atendimentos." },
];
const PRESETS: {
  id: string;
  rotulo: string;
  linhas: DimLinha;
  colunas: DimColuna;
  medida?: Medida;
}[] = [
  {
    id: "procUnid",
    rotulo: "Procedimentos por unidade",
    linhas: "procedimento",
    colunas: "unidade",
  },
  { id: "profMes", rotulo: "Profissionais mês a mês", linhas: "profissional", colunas: "mes" },
  { id: "tipo", rotulo: "Produção por tipo", linhas: "tipo", colunas: "mes" },
  { id: "cid", rotulo: "CIDs mais atendidos", linhas: "cid", colunas: "nada", medida: "atend" },
  { id: "evolUnid", rotulo: "Evolução por unidade", linhas: "unidade", colunas: "mes" },
];
const EXTRAS_VAZIO: ExtrasModelo = {
  unitario: false,
  valorTotal: false,
  pct: false,
  comparar: false,
  media: false,
};

const valorFiltro = (dim: DimFiltro, r: ProducaoBpaRow): string => {
  switch (dim) {
    case "unidade":
      return r.cnes || "sem-cnes";
    case "profissional":
      return chaveProfissional(r);
    case "procedimento":
      return r.procedimento;
    case "cid":
      return r.cid ?? "";
    case "carater":
      return r.carater ?? "";
    case "faixa":
      return faixaEtaria(r.idade);
  }
};

function Pilula({
  ativo,
  onClick,
  children,
  desabilitado,
  title,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
  desabilitado?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      disabled={desabilitado}
      title={title}
      className={`btn min-h-10 rounded-full px-3.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${ativo ? "bg-[#15213A] text-white" : "bg-[#F1F4F8] text-[#33415A] hover:bg-[#E6EBF2]"}`}
    >
      {children}
    </button>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-[#EEF2F7] px-5 py-4 first:border-t-0">
      <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#5B6B82]">{titulo}</h3>
      {children}
    </section>
  );
}

function MontarRelatorio() {
  const { pode } = usePermissoes();
  const user = useAuthUser();
  const busca = Route.useSearch();
  const {
    compDe,
    compAte,
    setCompDe,
    setCompAte,
    cnesSel,
    cnesOpcoes,
    logo,
    cor,
    nomeUsuario,
    periodoLabel,
    periodoArq,
  } = useRelatoriosCtx();

  // ---------------- Configuração ----------------
  const [linhas, setLinhas] = useState<DimLinha>("procedimento");
  const [colunas, setColunas] = useState<DimColuna>("nada");
  const [medida, setMedida] = useState<Medida>("proc");
  const [tipos, setTipos] = useState<Set<string>>(new Set(TIPOS));
  const [filtros, setFiltros] = useState<Partial<Record<DimFiltro, Set<string>>>>({});
  const [extras, setExtras] = useState<ExtrasModelo>(EXTRAS_VAZIO);
  const [visao, setVisao] = useState<"tabela" | "grafico">("tabela");
  const [menuFiltro, setMenuFiltro] = useState(false);
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [pdfAberto, setPdfAberto] = useState(false);

  // Configuração inicial: modelo salvo ou atalho vindo da Central.
  useEffect(() => {
    if (busca.modelo) {
      obterModelo(user?.id, busca.modelo).then((m) => {
        if (!m) return;
        const c = m.config;
        setLinhas(c.linhas);
        setColunas(c.colunas);
        setMedida(c.medida);
        setTipos(new Set(c.tipos.length ? c.tipos : TIPOS));
        setFiltros(Object.fromEntries(Object.entries(c.filtros).map(([k, v]) => [k, new Set(v)])));
        setExtras({ ...EXTRAS_VAZIO, ...c.extras });
        if (c.periodo.modo === "fixo") {
          setCompDe(c.periodo.de);
          setCompAte(c.periodo.ate);
        }
      });
    } else if (busca.inicio === "valores") {
      setLinhas("procedimento");
      setColunas("nada");
      setExtras({ ...EXTRAS_VAZIO, unitario: true, valorTotal: true });
    } else if (busca.inicio === "tendencia") {
      setLinhas("procedimento");
      setColunas("nada");
      setExtras({ ...EXTRAS_VAZIO, comparar: true, pct: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca.modelo, busca.inicio, user?.id]);
  useEffect(() => {
    if (colunas === linhas) setColunas("nada");
  }, [linhas, colunas]);

  // ---------------- Dados ----------------
  const [rows, setRows] = useState<ProducaoBpaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nomesProc, setNomesProc] = useState<Record<string, string>>({});
  const [nomesCid, setNomesCid] = useState<Record<string, string>>({});
  const [nomesCbo, setNomesCbo] = useState<Record<string, string>>({});
  const [nomesEstabCad, setNomesEstabCad] = useState<Record<string, string>>({});
  const cargaRef = useRef(0);
  const carregar = useCallback(async () => {
    const token = ++cargaRef.current;
    setLoading(true);
    const producao = await carregarProducaoPeriodoRapido(compDe, compAte, competenciaPadrao());
    if (cargaRef.current !== token) return;
    const [np, ncid, ncbo] = await Promise.all([
      carregarNomesProcedimentos(producao.map((r) => r.procedimento)),
      carregarDescricoesCid(producao.map((r) => r.cid).filter((c): c is string => !!c)),
      carregarDescricoesCbo(producao.map((r) => r.cbo).filter((c): c is string => !!c)),
    ]);
    if (cargaRef.current !== token) return;
    setRows(producao);
    setNomesProc(np);
    setNomesCid(ncid);
    setNomesCbo(ncbo);
    setLoading(false);
  }, [compDe, compAte]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    let vivo = true;
    const faltando = [
      ...new Set(
        rows.filter((r) => r.cnes && !r.estabelecimento_nome?.trim()).map((r) => r.cnes as string),
      ),
    ].filter((c) => !nomesEstabCad[c]);
    if (faltando.length === 0) return;
    Promise.all(
      faltando.map(async (c) => [c, (await buscarEstabelecimento(c)) || ""] as const),
    ).then((achados) => {
      if (vivo)
        setNomesEstabCad((prev) => ({
          ...prev,
          ...Object.fromEntries(achados.filter(([, n]) => n)),
        }));
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const melhorNome = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rows)
      if (r.cnes && r.estabelecimento_nome?.trim() && !m[r.cnes])
        m[r.cnes] = r.estabelecimento_nome.trim();
    return m;
  }, [rows]);
  const nomeUnidade = useCallback(
    (c: string) =>
      melhorNome[c] || nomesEstabCad[c] || cnesOpcoes.find((u) => u.cnes === c)?.nome || c,
    [melhorNome, nomesEstabCad, cnesOpcoes],
  );
  const nomeCbo = useCallback(
    (c: string | null) => (c ? (nomesCbo[c] ? nomesCbo[c].toUpperCase() : null) : null),
    [nomesCbo],
  );
  const rotuloProf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const k = chaveProfissional(r);
      if (!m.has(k))
        m.set(k, nomeOuCodigo(r.profissional_nome, nomeCbo(r.cbo) || r.profissional_cns || r.cbo));
    }
    return m;
  }, [rows, nomeCbo]);
  const rotulo = useCallback(
    (dim: DimLinha | DimColuna | DimFiltro, k: string): string => {
      switch (dim) {
        case "unidade":
          return k === "sem-cnes" ? "Sem unidade" : nomeUnidade(k);
        case "profissional":
          return rotuloProf.get(k) ?? k;
        case "procedimento":
          return nomesProc[k] || k;
        case "cid":
          return !k || k === "sem-cid" ? "Sem CID" : nomesCid[k] ? `${k} — ${nomesCid[k]}` : k;
        case "mes":
          return mesLabel(k);
        case "carater":
          return CARATER_NOME.get(k) ?? (k ? `Caráter ${k}` : "Sem caráter");
        default:
          return k;
      }
    },
    [nomeUnidade, rotuloProf, nomesProc, nomesCid],
  );

  // ---------------- Filtros (cascata: opções de um filtro respeitam os demais) ----------------
  const rowsBase = useMemo(
    () => rows.filter((r) => (!cnesSel.size || cnesSel.has(r.cnes ?? "")) && tipos.has(r.tipo)),
    [rows, cnesSel, tipos],
  );
  const passa = useCallback(
    (r: ProducaoBpaRow, exceto?: DimFiltro) => {
      for (const d of DIMS_FILTRO) {
        if (d.id === exceto) continue;
        const s = filtros[d.id];
        if (s && s.size && !s.has(valorFiltro(d.id, r))) return false;
      }
      return true;
    },
    [filtros],
  );
  const filtradas = useMemo(() => rowsBase.filter((r) => passa(r)), [rowsBase, passa]);
  const opcoes = useCallback(
    (dim: DimFiltro) => {
      const codes = new Set<string>();
      for (const r of rowsBase)
        if (passa(r, dim)) {
          const v = valorFiltro(dim, r);
          if (v) codes.add(v);
        }
      for (const c of filtros[dim] ?? []) codes.add(c);
      const arr = [...codes].map((code) => ({ code, label: rotulo(dim, code) }));
      return dim === "faixa"
        ? arr.sort((a, b) => FAIXAS.indexOf(a.code as never) - FAIXAS.indexOf(b.code as never))
        : arr.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    },
    [rowsBase, passa, filtros, rotulo],
  );

  // ---------------- Extras: tetos da FPO e período anterior (sob demanda) ----------------
  const [tetos, setTetos] = useState<IndiceTetos | null>(null);
  const precisaValor = extras.valorTotal || (extras.unitario && linhas === "procedimento");
  useEffect(() => {
    if (!precisaValor || !supabase) return;
    let vivo = true;
    const cnes = [...new Set(rows.map((r) => r.cnes).filter((c): c is string => !!c))];
    if (cnes.length === 0) {
      setTetos(indexarTetos([]));
      return;
    }
    setTetos(null);
    buscarTodasPaginado<TetoValor>(
      (lo, hi) =>
        supabase!
          .from("fpo_teto")
          .select("cnes, procedimento, competencia, valor_unitario")
          .in("cnes", cnes)
          .lte("competencia", compAte)
          .order("cnes")
          .order("procedimento")
          .order("competencia")
          .range(lo, hi) as never,
    ).then((t) => {
      if (vivo) setTetos(indexarTetos(t));
    });
    return () => {
      vivo = false;
    };
  }, [precisaValor, rows, compAte]);

  const [antDe, antAte] = periodoAnterior(compDe, compAte, mesOffset);
  const [rowsAnt, setRowsAnt] = useState<ProducaoBpaRow[] | null>(null);
  useEffect(() => {
    if (!extras.comparar) return;
    let vivo = true;
    setRowsAnt(null);
    carregarProducaoPeriodoRapido(antDe, antAte, competenciaPadrao()).then((r) => {
      if (vivo) setRowsAnt(r);
    });
    return () => {
      vivo = false;
    };
  }, [extras.comparar, antDe, antAte]);

  // ---------------- Pivô e tabela formatada (uma fonte só p/ prévia, CSV e PDF) ----------------
  const pivo = useMemo(
    () => montarPivo(filtradas, linhas, colunas, medida),
    [filtradas, linhas, colunas, medida],
  );
  const anteriorPorChave = useMemo(() => {
    if (!rowsAnt) return null;
    const base = rowsAnt.filter(
      (r) => (!cnesSel.size || cnesSel.has(r.cnes ?? "")) && tipos.has(r.tipo) && passa(r),
    );
    const m = new Map<string, number>();
    for (const r of base) {
      const k = chaveDim(linhas, r);
      m.set(k, (m.get(k) ?? 0) + (medida === "proc" ? r.quantidade : 1));
    }
    return m;
  }, [rowsAnt, cnesSel, tipos, passa, linhas, medida]);

  const mostraUnit = extras.unitario && linhas === "procedimento";
  type Extra = { id: string; titulo: string };
  const extrasCols: Extra[] = [
    ...(mostraUnit ? [{ id: "unit", titulo: "Valor unitário" }] : []),
    ...(extras.valorTotal ? [{ id: "vt", titulo: "Valor total (R$)" }] : []),
    ...(extras.pct ? [{ id: "pct", titulo: "% do total" }] : []),
    ...(extras.comparar
      ? [
          {
            id: "cmp",
            titulo: `vs ${antDe === antAte ? mesLabel(antDe) : `${mesLabel(antDe).slice(0, 3)}–${mesLabel(antAte)}`}`,
          },
        ]
      : []),
    ...(extras.media ? [{ id: "media", titulo: "Média por atendimento" }] : []),
  ];

  const valoresLinha = useMemo(() => {
    if (!tetos) return null;
    return new Map(
      pivo.linhas.map((l) => [
        l.key,
        resumirValor(
          l.fontes.map((r) => ({
            cnes: r.cnes,
            procedimento: r.procedimento,
            mes: r.mes_producao,
            quantidade: r.quantidade,
          })),
          tetos,
        ),
      ]),
    );
  }, [pivo, tetos]);
  const valorGeral = useMemo(() => {
    if (!valoresLinha) return null;
    let total = 0,
      sem = 0;
    for (const v of valoresLinha.values()) {
      total += v.valorTotal;
      sem += v.qtdSemValor;
    }
    return { total, sem };
  }, [valoresLinha]);

  type Celula = { txt: string; nota?: "varia" | "sem" | "carregando"; num?: number };
  const extraDaLinha = useCallback(
    (key: string, total: number, procs: number, atends: number): Record<string, Celula> => {
      const v = valoresLinha?.get(key);
      const out: Record<string, Celula> = {};
      if (mostraUnit)
        out.unit = !v
          ? { txt: "…", nota: "carregando" }
          : v.unitarioMedio === null
            ? { txt: "sem valor", nota: "sem" }
            : {
                txt: brl(v.unitarioMedio),
                nota: v.varia ? "varia" : undefined,
                num: v.unitarioMedio,
              };
      if (extras.valorTotal)
        out.vt = !v
          ? { txt: "…", nota: "carregando" }
          : v.qtdComValor === 0
            ? { txt: "sem valor", nota: "sem" }
            : { txt: brl(v.valorTotal), num: v.valorTotal };
      if (extras.pct)
        out.pct = {
          txt: pivo.total > 0 ? pctFmt(total / pivo.total) : "—",
          num: pivo.total > 0 ? total / pivo.total : 0,
        };
      if (extras.comparar) {
        if (!anteriorPorChave) out.cmp = { txt: "…", nota: "carregando" };
        else {
          const ant = anteriorPorChave.get(key) ?? 0;
          out.cmp =
            ant === 0
              ? { txt: total > 0 ? "novo" : "—" }
              : {
                  txt: `${total >= ant ? "▲" : "▼"} ${decFmt(Math.abs((total - ant) / ant) * 100, 1)}%`,
                  num: (total - ant) / ant,
                };
        }
      }
      if (extras.media)
        out.media = {
          txt: atends > 0 ? decFmt(procs / atends, 1) : "—",
          num: atends > 0 ? procs / atends : 0,
        };
      return out;
    },
    [valoresLinha, mostraUnit, extras, pivo.total, anteriorPorChave],
  );

  const extrasTotal = useMemo((): Record<string, Celula> => {
    const out: Record<string, Celula> = {};
    if (mostraUnit)
      out.unit =
        valorGeral && valorGeral.total > 0 && pivo.procs - valorGeral.sem > 0
          ? { txt: brl(valorGeral.total / (pivo.procs - valorGeral.sem)) }
          : { txt: "—" };
    if (extras.valorTotal) out.vt = valorGeral ? { txt: brl(valorGeral.total) } : { txt: "…" };
    if (extras.pct) out.pct = { txt: pivo.total > 0 ? "100,0%" : "—" };
    if (extras.comparar) {
      if (!anteriorPorChave) out.cmp = { txt: "…" };
      else {
        const ant = [...anteriorPorChave.values()].reduce((a, b) => a + b, 0);
        out.cmp =
          ant === 0
            ? { txt: "—" }
            : {
                txt: `${pivo.total >= ant ? "▲" : "▼"} ${decFmt(Math.abs((pivo.total - ant) / ant) * 100, 1)}%`,
              };
      }
    }
    if (extras.media)
      out.media = { txt: pivo.atends > 0 ? decFmt(pivo.procs / pivo.atends, 1) : "—" };
    return out;
  }, [mostraUnit, extras, valorGeral, pivo, anteriorPorChave]);

  const rowHead = ROTULO_DIM[linhas];
  const colLabels = pivo.colunas.map((c) => rotulo(colunas, c));
  const nomeLinha = (key: string) =>
    linhas === "procedimento" ? `${key} · ${rotulo("procedimento", key)}` : rotulo(linhas, key);

  // ---------------- Textos de resumo ----------------
  const filtrosAtivos = DIMS_FILTRO.filter((d) => (filtros[d.id]?.size ?? 0) > 0);
  const filtrosTexto = [
    tipos.size < TIPOS.length ? `Tipo: ${[...tipos].join(", ")}` : null,
    ...filtrosAtivos.map(
      (d) => `${d.rotulo}: ${[...(filtros[d.id] ?? [])].map((c) => rotulo(d.id, c)).join(", ")}`,
    ),
  ].filter(Boolean) as string[];
  const unidadesTexto = cnesSel.size
    ? [...cnesSel].map(nomeUnidade).join(", ")
    : "todas as unidades";
  const titulo = `${rowHead}${colunas !== "nada" ? ` × ${ROTULO_DIM[colunas]}` : ""}`;
  const medidaTxt = medida === "proc" ? "procedimentos" : "atendimentos";
  const maior = pivo.linhas[0];

  // ---------------- CSV ----------------
  const csv = () => {
    const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const num = (n: number, d = 0) =>
      d === 0 ? String(Math.round(n)) : n.toFixed(d).replace(".", ",");
    const cab = [rowHead, ...colLabels, "Total", ...extrasCols.map((e) => e.titulo)];
    const extraCsv = (c: Record<string, Celula>, id: string) => {
      const cel = c[id];
      if (!cel || cel.num === undefined) return cel?.txt === "…" ? "" : (cel?.txt ?? "");
      if (id === "pct") return num(cel.num * 100, 1);
      if (id === "cmp") return num(cel.num * 100, 1);
      if (id === "media") return num(cel.num, 1);
      return num(cel.num, 2);
    };
    const linhasCsv = pivo.linhas.map((l) => {
      const ex = extraDaLinha(l.key, l.total, l.procs, l.atends);
      return [
        nomeLinha(l.key),
        ...pivo.colunas.map((c) => num(l.celulas[c] ?? 0)),
        num(l.total),
        ...extrasCols.map((e) => extraCsv(ex, e.id)),
      ];
    });
    const tot = [
      "Total",
      ...pivo.colunas.map((c) => num(pivo.totalPorColuna[c] ?? 0)),
      num(pivo.total),
      ...extrasCols.map((e) => extraCsv(extrasTotal, e.id)),
    ];
    const conteudo =
      "﻿" +
      [cab, ...linhasCsv, tot].map((l) => l.map((v) => esc(String(v))).join(";")).join("\r\n");
    baixarCsv(
      `relatorio-${titulo.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}-${periodoArq}.csv`,
      conteudo,
    );
    toast.success("CSV gerado.");
  };

  // ---------------- PDF ----------------
  const gerarPdf = (o: { orientacao: "auto" | "retrato" | "paisagem"; ajustar: boolean }) => {
    const cols: ColunaPdf[] = [
      { titulo: rowHead, alinhar: "left" },
      ...colLabels.map((t) => ({ titulo: t, alinhar: "right" as const })),
      { titulo: "Total", alinhar: "right" },
      ...extrasCols.map((e) => ({ titulo: e.titulo, alinhar: "right" as const, extra: true })),
    ];
    const lin = pivo.linhas.map((l) => {
      const ex = extraDaLinha(l.key, l.total, l.procs, l.atends);
      return [
        nomeLinha(l.key),
        ...pivo.colunas.map((c) => intFmt(l.celulas[c] ?? 0)),
        intFmt(l.total),
        ...extrasCols.map((e) => (ex[e.id]?.txt === "…" ? "" : (ex[e.id]?.txt ?? ""))),
      ];
    });
    const total = [
      "Total",
      ...pivo.colunas.map((c) => intFmt(pivo.totalPorColuna[c] ?? 0)),
      intFmt(pivo.total),
      ...extrasCols.map((e) =>
        extrasTotal[e.id]?.txt === "…" ? "" : (extrasTotal[e.id]?.txt ?? ""),
      ),
    ];
    const extrasLig = extrasCols.map((e) => e.titulo);
    return gerarPdfTabela({
      titulo: `Relatório — ${titulo}`,
      infos: [
        `Período de produção ${periodoLabel} · ${intFmt(pivo.total)} ${medidaTxt}`,
        `Unidade(s): ${unidadesTexto}`,
        `Filtros: ${filtrosTexto.length ? filtrosTexto.join(" · ") : "nenhum (toda a produção do período)"}`,
        ...(extrasLig.length
          ? [
              `Informações extras: ${extrasLig.join(", ")}${valorGeral && valorGeral.sem > 0 && (extras.valorTotal || mostraUnit) ? ` · ${intFmt(valorGeral.sem)} procedimento(s) sem valor na FPO (fora do total em R$)` : ""}`,
            ]
          : []),
      ],
      colunas: cols,
      grupos: [{ linhas: lin, total }],
      logo,
      cor,
      geradoPor: nomeUsuario,
      orientacao: o.orientacao,
      ajustar: o.ajustar,
    });
  };

  const imprimirFichas = () => {
    const ids = [
      ...new Set(
        filtradas.map(
          (r) => `${r.tipo === "BPA-C" ? "C" : r.tipo === "RAAS" ? "R" : "I"}~${r.ficha_id}`,
        ),
      ),
    ];
    if (ids.length === 0) return;
    window.open(`/imprimir?itens=${encodeURIComponent(ids.join(","))}`, "_blank");
  };

  const configAtual = (fixar: boolean): ConfigRelatorio => ({
    linhas,
    colunas,
    medida,
    tipos: tipos.size === TIPOS.length ? [] : [...tipos],
    filtros: Object.fromEntries(
      Object.entries(filtros)
        .filter(([, v]) => v && v.size)
        .map(([k, v]) => [k, [...(v as Set<string>)]]),
    ),
    extras,
    periodo: fixar ? { modo: "fixo", de: compDe, ate: compAte } : { modo: "dinamico" },
  });

  if (!pode("emitir_rel_producao")) return <SemAcesso />;

  const maxCel = Math.max(
    1,
    ...pivo.linhas.flatMap((l) =>
      colunas === "nada" ? [l.total] : pivo.colunas.map((c) => l.celulas[c] ?? 0),
    ),
  );
  const fundo = (v: number) =>
    `rgba(37, 99, 217, ${(0.04 + 0.2 * Math.min(1, v / maxCel)).toFixed(3)})`;
  const semDados = !loading && pivo.linhas.length === 0;

  return (
    <div>
      {/* Topo */}
      <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Trilha" className="mb-1 flex items-center gap-1.5 text-[13px]">
            <Link
              to="/relatorios"
              className="inline-flex min-h-8 items-center gap-1 font-semibold text-[#2563D9] hover:underline"
            >
              <ChevronLeft className="size-4" />
              Relatórios
            </Link>
            <span className="text-[#5B6B82]">/ Montar relatório</span>
          </nav>
          <p className="text-[13.5px] text-[#5B6B82]">
            Produção de {periodoLabel} · {unidadesTexto}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSalvarAberto(true)}
            className="btn inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#D5DCE6] bg-white px-3.5 text-[13px] font-semibold text-[#172033]"
          >
            <Save className="size-4" /> Salvar como modelo
          </button>
          <button
            type="button"
            onClick={csv}
            disabled={loading || semDados}
            className="btn inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#D5DCE6] bg-white px-3.5 text-[13px] font-semibold text-[#172033] disabled:opacity-50"
          >
            <Download className="size-4" /> CSV
          </button>
          <button
            type="button"
            onClick={imprimirFichas}
            disabled={loading || semDados}
            className="btn inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#D5DCE6] bg-white px-3.5 text-[13px] font-semibold text-[#172033] disabled:opacity-50"
          >
            <Printer className="size-4" /> Imprimir fichas
          </button>
          <button
            type="button"
            onClick={() => setPdfAberto(true)}
            disabled={loading || semDados}
            className="btn inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#15213A] px-4 text-[13px] font-semibold text-white hover:bg-[#1F2E4D] disabled:opacity-50"
          >
            <FileText className="size-4" /> Gerar PDF com timbre
          </button>
        </div>
      </div>

      <div className="no-print mb-5">
        <BarraFiltrosBase />
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Configuração */}
        <aside
          aria-label="Configuração do relatório"
          className="no-print rv w-full shrink-0 overflow-hidden rounded-[18px] border border-[#E3E8EF] bg-white lg:sticky lg:top-4 lg:w-[380px]"
          style={{ animationDelay: "0ms" }}
        >
          <Bloco titulo="Começar de:">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Pilula
                  key={p.id}
                  ativo={linhas === p.linhas && colunas === p.colunas}
                  onClick={() => {
                    setLinhas(p.linhas);
                    setColunas(p.colunas);
                    if (p.medida) setMedida(p.medida);
                  }}
                >
                  {p.rotulo}
                </Pilula>
              ))}
            </div>
          </Bloco>
          <Bloco titulo="1 · Linhas — agrupar por">
            <div className="flex flex-wrap gap-1.5">
              {DIMS_LINHA.map((d) => (
                <Pilula key={d} ativo={linhas === d} onClick={() => setLinhas(d)}>
                  {ROTULO_DIM[d]}
                </Pilula>
              ))}
            </div>
          </Bloco>
          <Bloco titulo="2 · Colunas — dividir por">
            <div className="flex flex-wrap gap-1.5">
              {DIMS_COLUNA.map((d) => (
                <Pilula
                  key={d}
                  ativo={colunas === d}
                  desabilitado={d !== "nada" && d === linhas}
                  title={d !== "nada" && d === linhas ? "Já está nas linhas" : undefined}
                  onClick={() => setColunas(d)}
                >
                  {d === "nada" ? "Nada" : ROTULO_DIM[d]}
                </Pilula>
              ))}
            </div>
          </Bloco>
          <Bloco titulo="3 · Contar">
            <div className="flex flex-wrap gap-1.5">
              <Pilula ativo={medida === "proc"} onClick={() => setMedida("proc")}>
                Procedimentos
              </Pilula>
              <Pilula ativo={medida === "atend"} onClick={() => setMedida("atend")}>
                Atendimentos
              </Pilula>
            </div>
          </Bloco>
          <Bloco titulo="4 · Filtros">
            <span className="text-[13px] font-semibold text-[#172033]">Tipo de produção</span>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS.map((t) => (
                <Pilula
                  key={t}
                  ativo={tipos.has(t)}
                  onClick={() =>
                    setTipos((p) => {
                      const n = new Set(p);
                      if (n.has(t)) {
                        if (n.size > 1) n.delete(t);
                      } else n.add(t);
                      return n;
                    })
                  }
                >
                  {tipos.has(t) ? "✓ " : ""}
                  {t}
                </Pilula>
              ))}
            </div>
            {DIMS_FILTRO.filter((d) => filtros[d.id] !== undefined).map((d) => (
              <div key={d.id} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <MultiSelect
                    titulo={d.rotulo}
                    allLabel="Todos"
                    opcoes={opcoes(d.id)}
                    comCodigo={d.id === "procedimento"}
                    sel={filtros[d.id] ?? new Set()}
                    onChange={(s) => setFiltros((p) => ({ ...p, [d.id]: s }))}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Remover filtro ${d.rotulo}`}
                  onClick={() =>
                    setFiltros((p) => {
                      const n = { ...p };
                      delete n[d.id];
                      return n;
                    })
                  }
                  className="mb-0.5 inline-flex size-10 items-center justify-center rounded-lg text-[#5B6B82] hover:bg-[#F1F4F8]"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <div className="relative">
              <button
                type="button"
                aria-expanded={menuFiltro}
                onClick={() => setMenuFiltro((v) => !v)}
                className="btn inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-dashed border-[#B9C4D4] px-3.5 text-[13px] font-semibold text-[#2563D9]"
              >
                <Plus className="size-4" /> Adicionar filtro
              </button>
              {menuFiltro && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuFiltro(false)} />
                  <div className="absolute left-0 top-12 z-40 w-56 overflow-hidden rounded-xl border border-[#E3E8EF] bg-white py-1 text-[13.5px] shadow-lg">
                    {DIMS_FILTRO.filter((d) => filtros[d.id] === undefined).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className="block w-full px-3 py-2.5 text-left hover:bg-[#F6F8FB]"
                        onClick={() => {
                          setFiltros((p) => ({ ...p, [d.id]: new Set() }));
                          setMenuFiltro(false);
                        }}
                      >
                        {d.rotulo}
                      </button>
                    ))}
                    {DIMS_FILTRO.every((d) => filtros[d.id] !== undefined) && (
                      <p className="px-3 py-2.5 text-[12.5px] text-[#5B6B82]">
                        Todos os filtros já estão na lista.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
            <p className="text-[12px] text-[#5B6B82]">
              Filtros disponíveis: unidade, profissional, procedimento, CID, caráter e faixa etária.
            </p>
          </Bloco>
          <Bloco titulo="5 · Informações extras">
            <div className="flex flex-col gap-1">
              {EXTRAS_INFO.map((x) => {
                const bloqueado = x.id === "unitario" && linhas !== "procedimento";
                const desc =
                  x.id === "comparar"
                    ? `Variação em relação a ${antDe === antAte ? mesLabel(antDe) : `${mesLabel(antDe).slice(0, 3)}–${mesLabel(antAte)}`}.`
                    : x.desc;
                return (
                  <label
                    key={x.id}
                    className={`flex min-h-10 cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[#F6F8FB] ${bloqueado ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[#2563D9]"
                      checked={extras[x.id] && !bloqueado}
                      disabled={bloqueado}
                      onChange={(e) => setExtras((p) => ({ ...p, [x.id]: e.target.checked }))}
                    />
                    <span className="flex flex-col">
                      <span className="text-[13.5px] font-semibold text-[#172033]">{x.rotulo}</span>
                      <span className="text-[12px] text-[#5B6B82]">
                        {bloqueado ? "Disponível ao agrupar as linhas por procedimento." : desc}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Bloco>
        </aside>

        {/* Prévia */}
        <section
          aria-label="Prévia do relatório"
          className="rv min-w-0 flex-1 rounded-[18px] border border-[#E3E8EF] bg-white"
          style={{ animationDelay: "60ms" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EEF2F7] px-5 py-4">
            <div className="min-w-0">
              <h2 className="m-0 text-[18px] font-semibold text-[#172033]">{titulo}</h2>
              <p className="text-[12.5px] text-[#5B6B82]">
                {loading
                  ? "Buscando produção…"
                  : `Total de ${intFmt(pivo.total)} ${medidaTxt} · ${tipos.size === TIPOS.length ? "todos os tipos" : [...tipos].join(" e ")}${filtrosTexto.length ? ` · ${filtrosTexto.join(" · ")}` : ""}`}
              </p>
            </div>
            <div
              role="group"
              aria-label="Visão da prévia"
              className="no-print relative flex rounded-[11px] bg-[#F1F4F8] p-1"
            >
              <span
                aria-hidden="true"
                className="absolute top-1 h-[34px] w-[92px] rounded-lg bg-white shadow-[0_1px_2px_rgba(16,24,40,0.14)]"
                style={{
                  left: 4 + (visao === "tabela" ? 0 : 92),
                  transition: "left var(--duration-base) var(--ease-smooth-out)",
                }}
              />
              {(["tabela", "grafico"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={visao === v}
                  onClick={() => setVisao(v)}
                  className={`relative z-[1] h-[34px] w-[92px] text-[13px] font-semibold ${visao === v ? "text-[#172033]" : "text-[#5B6B82]"}`}
                >
                  {v === "tabela" ? "Tabela" : "Gráfico"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-b border-[#EEF2F7] px-5 py-4 md:grid-cols-4">
            {[
              { r: `Total de ${medidaTxt}`, v: loading ? null : intFmt(pivo.total) },
              { r: "Linhas com produção", v: loading ? null : intFmt(pivo.linhas.length) },
              {
                r: "Maior",
                v: loading
                  ? null
                  : maior
                    ? `${pivo.total > 0 ? pctFmt(maior.total / pivo.total) : "—"}`
                    : "—",
                s: maior ? nomeLinha(maior.key) : undefined,
              },
              {
                r: "Valor total (FPO)",
                v: loading
                  ? null
                  : !(extras.valorTotal || mostraUnit)
                    ? "—"
                    : valorGeral
                      ? brl(valorGeral.total)
                      : null,
                s: !(extras.valorTotal || mostraUnit)
                  ? "Ligue “Valor total” nas extras"
                  : undefined,
              },
            ].map((x) => (
              <div key={x.r} className="min-w-0">
                <div className="text-[12px] font-semibold text-[#5B6B82]">{x.r}</div>
                {x.v === null ? (
                  <span
                    className="sk mt-1.5"
                    style={{ display: "block", height: 22, width: "70%" }}
                  />
                ) : (
                  <div className="text-[20px] font-bold tabular-nums text-[#172033]">{x.v}</div>
                )}
                {x.s && (
                  <div className="truncate text-[11.5px] text-[#5B6B82]" title={x.s}>
                    {x.s}
                  </div>
                )}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex flex-col gap-2 p-5">
              {Array.from({ length: 8 }, (_, i) => (
                <span
                  key={i}
                  className="sk"
                  style={{ display: "block", height: 18, width: `${95 - i * 6}%` }}
                />
              ))}
            </div>
          ) : semDados ? (
            <p className="p-10 text-center text-[14px] text-[#5B6B82]">
              Nenhuma produção com essa configuração no período.
            </p>
          ) : visao === "tabela" ? (
            <div className="rel-scroll max-h-[640px] overflow-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 z-[2] bg-white">
                  <tr>
                    <th
                      scope="col"
                      className="rel-sticky sticky left-0 z-[3] min-w-[220px] bg-[#F6F8FB] px-3 py-2.5 text-left text-[12px] font-semibold text-[#5B6B82]"
                    >
                      {rowHead}
                    </th>
                    {colLabels.map((c) => (
                      <th
                        key={c}
                        scope="col"
                        className="whitespace-nowrap bg-[#F6F8FB] px-3 py-2.5 text-right text-[12px] font-semibold text-[#5B6B82]"
                      >
                        {c}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="bg-[#F6F8FB] px-3 py-2.5 text-right text-[12px] font-semibold text-[#172033]"
                    >
                      Total
                    </th>
                    {extrasCols.map((e) => (
                      <th
                        key={e.id}
                        scope="col"
                        className="whitespace-nowrap bg-[#EEF3FC] px-3 py-2.5 text-right text-[12px] font-semibold text-[#1D4FB0]"
                      >
                        {e.titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pivo.linhas.map((l) => {
                    const ex = extraDaLinha(l.key, l.total, l.procs, l.atends);
                    return (
                      <tr key={l.key} className="border-t border-[#EEF2F7]">
                        <th
                          scope="row"
                          className="rel-sticky sticky left-0 z-[1] max-w-[320px] bg-white px-3 py-2 text-left font-normal"
                        >
                          {linhas === "procedimento" ? (
                            <span className="flex flex-col">
                              <span className="line-clamp-2 text-[13px] text-[#172033]">
                                {rotulo("procedimento", l.key)}
                              </span>
                              <span className="mono text-[11.5px] text-[#5B6B82]">{l.key}</span>
                            </span>
                          ) : (
                            <span className="line-clamp-2 text-[#172033]">
                              {rotulo(linhas, l.key)}
                            </span>
                          )}
                        </th>
                        {pivo.colunas.map((c) => {
                          const v = l.celulas[c] ?? 0;
                          return (
                            <td
                              key={c}
                              className="px-3 py-2 text-right tabular-nums"
                              style={{ background: v ? fundo(v) : undefined }}
                            >
                              {v ? intFmt(v) : "—"}
                            </td>
                          );
                        })}
                        <td
                          className="px-3 py-2 text-right font-semibold tabular-nums"
                          style={{ background: colunas === "nada" ? fundo(l.total) : undefined }}
                        >
                          {intFmt(l.total)}
                        </td>
                        {extrasCols.map((e) => {
                          const cel = ex[e.id];
                          return (
                            <td
                              key={e.id}
                              className="whitespace-nowrap bg-[#F5F8FE] px-3 py-2 text-right tabular-nums"
                            >
                              {cel?.nota === "carregando" ? (
                                <span
                                  className="sk ml-auto"
                                  style={{ display: "block", height: 12, width: 56 }}
                                />
                              ) : cel?.nota === "sem" ? (
                                <span className="text-[#7A4A00]">{cel.txt}</span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  {cel?.txt}
                                  {cel?.nota === "varia" && (
                                    <span
                                      title="varia por unidade/mês"
                                      aria-label="varia por unidade/mês"
                                    >
                                      <Info className="size-3.5 text-[#5B6B82]" />
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#D5DCE6] bg-[#F6F8FB] font-bold">
                    <th
                      scope="row"
                      className="rel-sticky sticky left-0 bg-[#F6F8FB] px-3 py-2.5 text-left"
                    >
                      Total
                    </th>
                    {pivo.colunas.map((c) => (
                      <td key={c} className="px-3 py-2.5 text-right tabular-nums">
                        {intFmt(pivo.totalPorColuna[c] ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right tabular-nums">{intFmt(pivo.total)}</td>
                    {extrasCols.map((e) => (
                      <td
                        key={e.id}
                        className="whitespace-nowrap bg-[#EEF3FC] px-3 py-2.5 text-right tabular-nums"
                      >
                        {extrasTotal[e.id]?.txt === "…" ? (
                          <span
                            className="sk ml-auto"
                            style={{ display: "block", height: 12, width: 56 }}
                          />
                        ) : (
                          extrasTotal[e.id]?.txt
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <Grafico
              pivo={pivo}
              colunas={colunas}
              colLabels={colLabels}
              nome={(k) =>
                linhas === "procedimento" ? rotulo("procedimento", k) : rotulo(linhas, k)
              }
            />
          )}
          <div className="border-t border-[#EEF2F7] px-5 py-3 text-[12.5px] text-[#5B6B82]">
            {valorGeral && valorGeral.sem > 0 && (extras.valorTotal || mostraUnit) && (
              <p className="text-[#7A4A00]">
                {intFmt(valorGeral.sem)} procedimento(s) sem valor na FPO (fora do total em R$).
              </p>
            )}
            <p>A prévia é o que sai no PDF e no CSV.</p>
          </div>
        </section>
      </div>

      {pdfAberto && (
        <PdfAjustavelModal
          titulo={`Relatório — ${titulo}`}
          nomeArquivo={`relatorio-${periodoArq}.pdf`}
          gerar={gerarPdf}
          onClose={() => setPdfAberto(false)}
        />
      )}
      <SalvarModeloDialog
        aberto={salvarAberto}
        onAberto={setSalvarAberto}
        nomeSugerido={`${titulo}${cnesSel.size === 1 ? ` · ${nomeUnidade([...cnesSel][0])}` : ""}`}
        resumo={`${titulo} · ${tipos.size === TIPOS.length ? "todos os tipos" : [...tipos].join(" e ")}${filtrosTexto.length ? ` · ${filtrosTexto.join(" · ")}` : ""}`}
        periodoFixo={
          compDe === compAte ? mesLabel(compDe) : `${mesLabel(compDe)} a ${mesLabel(compAte)}`
        }
        onSalvar={async (nome, fixar) => {
          await salvarModelo(user?.id, nome, configAtual(fixar));
          toast.success("Modelo salvo. Ele aparece em “Meus modelos” na Central.");
        }}
      />
    </div>
  );
}

function Grafico({
  pivo,
  colunas,
  colLabels,
  nome,
}: {
  pivo: ReturnType<typeof montarPivo>;
  colunas: DimColuna;
  colLabels: string[];
  nome: (k: string) => string;
}) {
  const top = pivo.linhas.slice(0, 20);
  const max = Math.max(1, ...top.map((l) => l.total));
  const cor = (i: number) => CORES[i % CORES.length];
  const opac = (i: number) => (i < CORES.length ? 1 : i < CORES.length * 2 ? 0.6 : 0.35);
  return (
    <div className="p-5">
      {colunas !== "nada" && (
        <div className="mb-4 flex flex-wrap gap-3 text-[12.5px] text-[#33415A]">
          {colLabels.map((c, i) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-[3px]"
                style={{ background: cor(i), opacity: opac(i) }}
              />
              {c}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        {top.map((l) => (
          <div
            key={l.key}
            className="grid grid-cols-[minmax(0,200px)_1fr_auto] items-center gap-3 text-[13px]"
          >
            <span className="truncate text-[#172033]" title={nome(l.key)}>
              {nome(l.key)}
            </span>
            <span
              className="flex h-4 overflow-hidden rounded-r"
              style={{ width: `${Math.max(2, (l.total / max) * 100)}%` }}
            >
              {colunas === "nada" ? (
                <span className="h-full w-full bg-[#257DE0]" />
              ) : (
                pivo.colunas.map((c, i) => {
                  const v = l.celulas[c] ?? 0;
                  return v ? (
                    <span
                      key={c}
                      title={`${colLabels[i]}: ${intFmt(v)}`}
                      className="h-full"
                      style={{ flex: `${v} 1 0`, background: cor(i), opacity: opac(i) }}
                    />
                  ) : null;
                })
              )}
            </span>
            <span className="font-semibold tabular-nums">{intFmt(l.total)}</span>
          </div>
        ))}
      </div>
      {pivo.linhas.length > top.length && (
        <p className="mt-3 text-[12px] text-[#5B6B82]">
          Mostrando as {top.length} maiores de {pivo.linhas.length} linhas. A tabela mostra todas.
        </p>
      )}
    </div>
  );
}

function SalvarModeloDialog({
  aberto,
  onAberto,
  nomeSugerido,
  resumo,
  periodoFixo,
  onSalvar,
}: {
  aberto: boolean;
  onAberto: (v: boolean) => void;
  nomeSugerido: string;
  resumo: string;
  periodoFixo: string;
  onSalvar: (nome: string, fixar: boolean) => Promise<void>;
}) {
  const [nome, setNome] = useState(nomeSugerido);
  const [fixar, setFixar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (aberto) {
      setNome(nomeSugerido);
      setFixar(false);
    }
  }, [aberto, nomeSugerido]);
  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent className="max-w-[520px] gap-0 rounded-2xl p-0">
        <div className="border-b border-[#E3E8EF] px-6 py-5">
          <DialogTitle className="text-xl font-bold">Salvar como modelo</DialogTitle>
          <DialogDescription className="mt-1 text-[13px]">{resumo}</DialogDescription>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[#172033]">Nome do modelo</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="h-11 rounded-[10px] border border-[#D5DCE6] px-3 text-[15px]"
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-semibold text-[#172033]">Período</legend>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="radio"
                name="periodo"
                checked={!fixar}
                onChange={() => setFixar(false)}
                className="mt-1 accent-[#2563D9]"
              />
              <span>
                <span className="block text-[14px] text-[#172033]">
                  Usar o período escolhido na hora
                </span>
                <span className="text-[12.5px] text-[#5B6B82]">
                  Bom para relatórios mensais: gere todo mês com um clique.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="radio"
                name="periodo"
                checked={fixar}
                onChange={() => setFixar(true)}
                className="mt-1 accent-[#2563D9]"
              />
              <span className="text-[14px] text-[#172033]">Fixar {periodoFixo}</span>
            </label>
          </fieldset>
          <label
            className="flex cursor-not-allowed items-center gap-2.5 opacity-60"
            title="Disponível quando os modelos forem para o banco"
          >
            <input type="checkbox" disabled={!COMPARTILHAR_DISPONIVEL} className="size-4" />
            <span className="text-[14px] text-[#172033]">
              Compartilhar com a equipe da prefeitura
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#E3E8EF] px-6 py-4">
          <button
            type="button"
            onClick={() => onAberto(false)}
            className="btn min-h-10 rounded-xl border border-[#D5DCE6] px-4 text-[13px] font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={salvando || !nome.trim()}
            onClick={async () => {
              setSalvando(true);
              try {
                await onSalvar(nome, fixar);
                onAberto(false);
              } finally {
                setSalvando(false);
              }
            }}
            className="btn inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#2563D9] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {salvando && <Loader2 className="size-4 animate-spin" />} Salvar modelo
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
