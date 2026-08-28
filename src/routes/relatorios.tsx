import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  FileBarChart, Download, FileText, Printer, RefreshCw, FileSpreadsheet, Ambulance, X, Loader2, UserX, ChevronDown, Check, Users, Lock,
} from "lucide-react";
import { usePermissoes } from "@/lib/permissoes";
import {
  carregarProducaoDashboardPeriodo, carregarNomesProcedimentos, carregarDescricoesCid, carregarDescricoesCbo,
  carregarVinculosUsuario, type ProducaoBpaRow,
} from "@/lib/dashboard-producao";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";
import { carregarLogoOrg, carregarCorOrg } from "@/lib/org-logo";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { CNES_TFD, carregarRelatorioTfd, type TfdStatus, type TfdRelatorioRow } from "@/lib/tfd/tfd";
import { carregarComparacaoFpo, type FpoComparacaoRow } from "@/lib/fpo/fpo";
import { construirPdfFpo, construirPdfFpoPorUnidade } from "@/lib/fpo/relatorio-fpo";
import { construirPdfTfd, construirPdfTfdPorUnidade } from "@/lib/tfd/relatorio-tfd";
import { csvProducao, baixarCsv, construirPdfProducao, type MapasNome } from "@/lib/relatorios/producao";
import { coletarErros, mesesNoIntervalo, resolverRevisaoPaciente, ROTULO_CATEGORIA, type CategoriaErro, type ErroItem } from "@/lib/relatorios/erros";
import { csvErros, construirPdfErros } from "@/lib/relatorios/erros-pdf";
import { carregarInativos, type InativosResultado } from "@/lib/relatorios/inativos";
import { csvInativos, construirPdfInativos } from "@/lib/relatorios/inativos-pdf";
import { carregarPerfilCadastro, carregarPerfilAtendidos, agregarCid, agregarProcedimentos, agregarPorUnidade } from "@/lib/relatorios/perfil";
import { construirPdfPerfil } from "@/lib/relatorios/perfil-pdf";
import { relacaoGeral, relacaoTfd, relacaoProducao, carregarTabulacao } from "@/lib/relatorios/relacao";
import { construirPdfRelacao } from "@/lib/relatorios/relacao-pdf";
import { construirPdfTabulacao, type DimTab } from "@/lib/relatorios/tabulacao-pdf";
import { ProcedimentoPicker } from "@/components/relatorios/ProcedimentoPicker";
import { usePreviewPdf } from "@/components/relatorios/PreviewPdfModal";
import { AlertTriangle } from "lucide-react";
import {
  montarRelatorioTfd, csvTabela, AGRUPAMENTOS, STATUS_ROTULO, compLabelTfd, brlTfd, type AgrupamentoRel,
} from "@/lib/relatorios/tfd-rel";
import { toast } from "sonner";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — SPA Digital" }] }),
  component: RelatoriosPage,
});

const CARATER_NOME = new Map(CARATERES.map((c) => [c.code, c.label]));
const nomeCarater = (code: string | null) => (code ? CARATER_NOME.get(code) ?? null : null);
const nomeOuCodigo = (nome: string | null, codigo: string | null) => nome?.trim() || codigo || "Não informado";
const chaveProfissional = (r: ProducaoBpaRow) => r.profissional_cns || r.profissional_nome || r.cbo || "sem-profissional";

const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const mesLabel = (comp: string) => (comp.length === 6 ? `${meses[Number(comp.slice(4, 6)) - 1] ?? comp.slice(4, 6)}/${comp.slice(0, 4)}` : comp);
const competenciaAtual = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`; };
// Desloca um AAAAMM em n meses (n<0 = passado). Ex.: mesOffset("202608", -2) = "202606".
const mesOffset = (base: string, n: number): string => {
  let a = Number(base.slice(0, 4)); let m = Number(base.slice(4, 6)) + n;
  a += Math.floor((m - 1) / 12); m = ((((m - 1) % 12) + 12) % 12) + 1;
  return `${a}${String(m).padStart(2, "0")}`;
};
// Presets do seletor de período (rege a página). range() devolve [de, ate].
const PRESETS_PERIODO: { key: string; label: string; range: () => [string, string] }[] = [
  { key: "atual", label: "Mês atual", range: () => { const a = competenciaAtual(); return [a, a]; } },
  { key: "ultimo", label: "Último mês", range: () => { const a = mesOffset(competenciaAtual(), -1); return [a, a]; } },
  { key: "3m", label: "Últimos 3 meses", range: () => { const a = competenciaAtual(); return [mesOffset(a, -2), a]; } },
  { key: "6m", label: "Últimos 6 meses", range: () => { const a = competenciaAtual(); return [mesOffset(a, -5), a]; } },
  { key: "12m", label: "Último ano", range: () => { const a = competenciaAtual(); return [mesOffset(a, -11), a]; } },
];
// Últimos 12 meses de produção (AAAAMM), do atual para trás.
const ultimosMeses = (n: number): string[] => {
  const d = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) { out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() - 1); }
  return out;
};

// Filtro de múltipla escolha: botão com resumo ("Todas" / nome único / "N selecionados") que
// abre um dropdown com checkboxes (busca quando há muitas opções). Set vazio = todos.
function MultiSelect({ titulo, opcoes, sel, onChange, allLabel = "Todos", comCodigo = false }: {
  titulo: string;
  opcoes: { code: string; label: string }[];
  sel: Set<string>;
  onChange: (s: Set<string>) => void;
  allLabel?: string;
  comCodigo?: boolean; // mostra o código ao lado do nome (procedimentos)
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
  const MAX = 200; // listas longas (procedimentos): renderiza um teto e pede refino pela busca
  const mostradas = filtradas.slice(0, MAX);
  const toggle = (code: string) => { const n = new Set(sel); if (n.has(code)) n.delete(code); else n.add(code); onChange(n); };
  const resumo = sel.size === 0 ? allLabel
    : sel.size === 1 ? (rotulo(opcoes.find((o) => o.code === [...sel][0]) ?? { code: [...sel][0], label: [...sel][0] }))
      : `${sel.size} selecionados`;
  const selCls = "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm";
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</span>
      <div className="relative" ref={ref}>
        <button type="button" onClick={() => setAberto((a) => !a)} className={`${selCls} flex items-center justify-between gap-2 text-left`}>
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

function RelatoriosPage() {
  const user = useAuthUser();
  const { pode } = usePermissoes();
  const { abrirPreview, previewNode } = usePreviewPdf();
  // Período de produção (AAAAMM). compDe==compAte = um mês só (comportamento antigo).
  const [compDe, setCompDe] = useState(competenciaAtual());
  const [compAte, setCompAte] = useState(competenciaAtual());
  const [rows, setRows] = useState<ProducaoBpaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nomesProc, setNomesProc] = useState<Record<string, string>>({});
  const [nomesCid, setNomesCid] = useState<Record<string, string>>({});
  const [nomesCbo, setNomesCbo] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<string | null>(null);
  const [cor, setCor] = useState<string | null>(null);
  const [podeTfd, setPodeTfd] = useState(false);
  const [cnesOpcoes, setCnesOpcoes] = useState<{ cnes: string; nome: string }[]>([]);
  // Nome do estabelecimento pelo CADASTRO, para CNES cujas linhas vêm sem nome (ex.: RAAS
  // importado) — evita exibir só o código do CNES nos filtros/relatórios.
  const [nomesEstabCad, setNomesEstabCad] = useState<Record<string, string>>({});
  const [fpoOpen, setFpoOpen] = useState(false);
  const [tfdOpen, setTfdOpen] = useState(false);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [relacaoOpen, setRelacaoOpen] = useState(false);
  const [tabulacaoOpen, setTabulacaoOpen] = useState(false);
  // Erros / crivo
  const TODAS_CATS: CategoriaErro[] = ["producao-sigtap", "ficha-incompleta", "paciente-revisao", "duplicidade", "tfd-sem-profissional"];
  const [categoriasErro, setCategoriasErro] = useState<Set<CategoriaErro>>(new Set(TODAS_CATS));
  const [erros, setErros] = useState<ErroItem[] | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [filtroGrav, setFiltroGrav] = useState<"todas" | "erro" | "aviso">("todas");
  // Profissionais inativos / sem produção
  const [inaJanela, setInaJanela] = useState(3);
  const [inaIncluirRoster, setInaIncluirRoster] = useState(false);
  const [inativos, setInativos] = useState<InativosResultado | null>(null);
  const [inaLoading, setInaLoading] = useState(false);

  // Filtros
  // Filtros MULTI-seleção: cada um é um conjunto de códigos escolhidos. Vazio = "todos".
  const [cnesSel, setCnesSel] = useState<Set<string>>(new Set());
  const [profSel, setProfSel] = useState<Set<string>>(new Set());
  const [procSel, setProcSel] = useState<Set<string>>(new Set());
  const [tipoSel, setTipoSel] = useState<Set<string>>(new Set());
  const [cidSel, setCidSel] = useState<Set<string>>(new Set());
  const [caraterSel, setCaraterSel] = useState<Set<string>>(new Set());

  // Mês de referência dos relatórios per-mês (crivo/inativos): o início do período.
  const competencia = compDe;
  // Rótulo do período (para PDFs/arquivos/labels): "Jul/2026" ou "Jun/2026 a Ago/2026".
  const periodoLabel = compDe === compAte ? mesLabel(compDe) : `${mesLabel(compDe)} a ${mesLabel(compAte)}`;
  const periodoArq = compDe === compAte ? compDe : `${compDe}-${compAte}`;
  // Preset ativo do período (ou "custom" quando não bate nenhum).
  const presetAtivo = PRESETS_PERIODO.find((p) => { const [d, a] = p.range(); return compDe === d && compAte === a; })?.key ?? "custom";

  // Token da carga atual: a produção é paginada e o período pode mudar rápido; sem isto uma
  // carga antiga (mais lenta) responde depois e sobrescreve a nova (dava 155 vs 227 no mesmo
  // filtro). Só aplicamos o resultado se ainda for a carga mais recente.
  const cargaRef = useRef(0);
  const carregar = async () => {
    const token = ++cargaRef.current;
    setLoading(true);
    const producao = await carregarProducaoDashboardPeriodo(compDe, compAte);
    if (cargaRef.current !== token) return; // carga obsoleta — ignora
    // Nomes (procedimento/CID/CBO) em PARALELO — antes eram 3 buscas em série.
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
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [compDe, compAte]);
  useEffect(() => { setCnesSel(new Set()); setProfSel(new Set()); setProcSel(new Set()); setTipoSel(new Set()); setCidSel(new Set()); setCaraterSel(new Set()); setInativos(null); }, [compDe, compAte]);
  useEffect(() => {
    carregarLogoOrg().then(setLogo);
    carregarCorOrg().then(setCor);
    carregarVinculosUsuario().then(async (v) => {
      const unicos = [...new Set(v.map((x) => x.cnes).filter(Boolean))];
      setPodeTfd(unicos.some((c) => CNES_TFD.includes(c)));
      const nomes = await Promise.all(unicos.map(async (c) => ({ cnes: c, nome: (await buscarEstabelecimento(c)) || c })));
      setCnesOpcoes(nomes);
    });
  }, []);

  // Busca no cadastro o nome das unidades sem nome nas linhas (ex.: RAAS importado). Só as que faltam.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const faltando = [...new Set(rows.filter((r) => r.cnes && !r.estabelecimento_nome?.trim()).map((r) => r.cnes as string))]
        .filter((c) => !nomesEstabCad[c]);
      if (faltando.length === 0) return;
      const achados = await Promise.all(faltando.map(async (c) => [c, (await buscarEstabelecimento(c)) || ""] as const));
      if (vivo) setNomesEstabCad((prev) => ({ ...prev, ...Object.fromEntries(achados.filter(([, n]) => n)) }));
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Melhor nome de cada CNES: nome embutido em alguma linha → cadastro → vínculo → código.
  const melhorNomeRows = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rows) { const c = r.cnes; if (c && r.estabelecimento_nome?.trim() && !m[c]) m[c] = r.estabelecimento_nome.trim(); }
    return m;
  }, [rows]);
  const nomeUnidade = (c: string) =>
    melhorNomeRows[c] || nomesEstabCad[c] || cnesOpcoes.find((u) => u.cnes === c)?.nome || c;

  const nomeProc = (c: string) => nomesProc[c] || null;
  const nomeCbo = (c: string | null) => (c ? (nomesCbo[c] ? nomesCbo[c].toUpperCase() : null) : null);
  const rotuloCid = (c: string | null) => { if (!c) return "Sem CID"; const d = nomesCid[c]; return d ? `${c} — ${d}` : c; };
  const mapas: MapasNome = { nomeProc, rotuloCid, nomeCbo, nomeCarater };

  // Rótulos globais (a partir de TODAS as linhas) — assim uma opção SELECIONADA sempre tem
  // rótulo, mesmo que a cascata a deixe sem linhas no momento.
  const rotuloProf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) { const k = chaveProfissional(r); if (!m.has(k)) m.set(k, nomeOuCodigo(r.profissional_nome, nomeCbo(r.cbo) || r.profissional_cns || r.cbo)); }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, nomesCbo]);

  // CASCATA em UMA passada: para cada linha, conta quantos filtros ela REPROVA (e qual, se só
  // um). filtradas = as que passam em todos; as opções de um filtro X = linhas que passam em
  // todos MENOS (no máximo) o próprio X. Muito mais barato que refiltrar tudo por filtro, e
  // sem o efeito de "poda" que causava as opções sumirem/piscarem.
  const depsFiltros = [cnesSel, profSel, procSel, tipoSel, cidSel, caraterSel];
  const anotadas = useMemo(() => rows.map((r) => {
    let n = 0; let solo = "";
    const chk = (reprova: boolean, campo: string) => { if (reprova) { n++; solo = n === 1 ? campo : ""; } };
    chk(cnesSel.size > 0 && !cnesSel.has(r.cnes ?? ""), "cnes");
    chk(profSel.size > 0 && !profSel.has(chaveProfissional(r)), "prof");
    chk(procSel.size > 0 && !procSel.has(r.procedimento), "proc");
    chk(tipoSel.size > 0 && !tipoSel.has(r.tipo), "tipo");
    chk(cidSel.size > 0 && !cidSel.has(r.cid ?? ""), "cid");
    chk(caraterSel.size > 0 && !caraterSel.has(r.carater ?? ""), "carater");
    return { r, ok: n === 0, solo: n === 1 ? solo : "-" };
  }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, ...depsFiltros]);

  const filtradas = useMemo(() => anotadas.filter((a) => a.ok).map((a) => a.r), [anotadas]);

  // Monta as opções de um filtro: valores das linhas que passam nos OUTROS filtros +
  // os já selecionados (para nunca "sumirem"), rotulados e ordenados.
  const opcoesDe = (campo: string, valor: (r: ProducaoBpaRow) => string, rotulo: (code: string) => string, sel: Set<string>) => {
    const codes = new Set<string>();
    for (const a of anotadas) if (a.ok || a.solo === campo) { const v = valor(a.r); if (v) codes.add(v); }
    for (const c of sel) codes.add(c);
    return [...codes].map((code) => ({ code, label: rotulo(code) })).sort((a, b) => a.label.localeCompare(b.label));
  };
  const unidades = useMemo(() => opcoesDe("cnes", (r) => r.cnes ?? "", nomeUnidade, cnesSel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anotadas, cnesSel, nomesEstabCad, cnesOpcoes]);
  const profissionais = useMemo(() => opcoesDe("prof", chaveProfissional, (c) => rotuloProf.get(c) ?? c, profSel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anotadas, profSel, rotuloProf]);
  const procedimentos = useMemo(() => opcoesDe("proc", (r) => r.procedimento, (c) => nomeProc(c) || c, procSel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anotadas, procSel, nomesProc]);
  const tipos = useMemo(() => opcoesDe("tipo", (r) => r.tipo, (c) => c, tipoSel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anotadas, tipoSel]);
  const cids = useMemo(() => opcoesDe("cid", (r) => r.cid ?? "", rotuloCid, cidSel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anotadas, cidSel, nomesCid]);
  const carateres = useMemo(() => opcoesDe("carater", (r) => r.carater ?? "", (c) => nomeCarater(c) || `Caráter ${c}`, caraterSel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anotadas, caraterSel]);

  const totalQtd = filtradas.reduce((s, r) => s + r.quantidade, 0);
  const bpaC = filtradas.filter((r) => r.tipo === "BPA-C").reduce((s, r) => s + r.quantidade, 0);
  const bpaI = filtradas.filter((r) => r.tipo === "BPA-I").reduce((s, r) => s + r.quantidade, 0);
  const raas = filtradas.filter((r) => r.tipo === "RAAS").reduce((s, r) => s + r.quantidade, 0);

  // Rótulo de um filtro multi: "1 valor" mostra o nome; ">1" lista os nomes separados por vírgula.
  const rotuloSel = (titulo: string, sel: Set<string>, opts: { code: string; label: string }[]) => {
    if (sel.size === 0) return null;
    const nomes = [...sel].map((c) => opts.find((o) => o.code === c)?.label ?? c);
    return `${titulo}: ${nomes.join(", ")}`;
  };
  const filtrosLabel = () => {
    const p = [
      rotuloSel("Tipo", tipoSel, tipos),
      rotuloSel("Unidade", cnesSel, unidades),
      rotuloSel("Profissional", profSel, profissionais),
      rotuloSel("Procedimento", procSel, procedimentos),
      rotuloSel("CID", cidSel, cids),
      rotuloSel("Caráter", caraterSel, carateres),
    ].filter(Boolean);
    return p.length ? p.join("  ·  ") : "Sem filtros (toda a produção do período)";
  };

  // ---- Erros / crivo ----
  const toggleCat = (c: CategoriaErro) => setCategoriasErro((prev) => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const verificarErros = async () => {
    if (categoriasErro.size === 0) { toast.error("Selecione ao menos uma categoria."); return; }
    setVerificando(true);
    try { setErros(await coletarErros({ de: compDe, ate: compAte, categorias: categoriasErro, cnes: [...cnesSel] })); }
    finally { setVerificando(false); }
  };
  const [resolvendo, setResolvendo] = useState<string | null>(null);
  const resolverRevisao = async (pacienteId: string) => {
    setResolvendo(pacienteId);
    const ok = await resolverRevisaoPaciente(pacienteId);
    setResolvendo(null);
    if (!ok) { toast.error("Não foi possível resolver a revisão."); return; }
    setErros((prev) => (prev ?? []).filter((e) => !(e.categoria === "paciente-revisao" && e.pacienteId === pacienteId)));
    toast.success("Revisão resolvida.");
  };
  const errosFiltrados = (erros ?? []).filter((e) => filtroGrav === "todas" || e.gravidade === filtroGrav);
  const nErros = (erros ?? []).filter((e) => e.gravidade === "erro").length;
  const nAvisos = (erros ?? []).length - nErros;
  const baixarCsvErros = () => { if (!errosFiltrados.length) return; baixarCsv(`erros-${periodoArq}.csv`, csvErros(errosFiltrados)); toast.success("CSV gerado."); };
  const baixarPdfErros = () => { if (!errosFiltrados.length) return; abrirPreview(construirPdfErros({ itens: errosFiltrados, subtitulo: `Período ${periodoLabel}`, logo, cor }), `consistencia-${periodoArq}.pdf`, "Consistência da produção"); };

  // ---- Profissionais inativos / sem produção ----
  const nomesUnidade = useMemo(() => Object.fromEntries(cnesOpcoes.map((u) => [u.cnes, u.nome])), [cnesOpcoes]);
  const verificarInativos = async () => {
    const cnesList = cnesSel.size > 0 ? [...cnesSel] : cnesOpcoes.map((u) => u.cnes);
    if (cnesList.length === 0) { toast.error("Sem unidade vinculada."); return; }
    setInaLoading(true);
    try {
      setInativos(await carregarInativos({ cnesList, nomesUnidade, competencia: compDe, mesesReferencia: mesesNoIntervalo(compDe, compAte), janelaMeses: inaJanela, incluirRosterSemProducao: inaIncluirRoster }));
    } finally { setInaLoading(false); }
  };
  const inaSubtitulo = () => {
    const uni = cnesSel.size === 0 ? `Todas as unidades (${cnesOpcoes.length})` : cnesSel.size === 1 ? (nomesUnidade[[...cnesSel][0]] ?? [...cnesSel][0]) : `${cnesSel.size} unidades`;
    return `${uni} · sem produção em ${periodoLabel} · janela ${inaJanela} ${inaJanela === 1 ? "mês" : "meses"} anteriores`;
  };
  const inaNomeArq = () => `sem-producao-${periodoArq}${cnesSel.size === 1 ? `-${[...cnesSel][0]}` : ""}`;
  const baixarCsvInativos = () => { if (!inativos?.rows.length) return; baixarCsv(`${inaNomeArq()}.csv`, csvInativos(inativos.rows)); toast.success("CSV gerado."); };
  const baixarPdfInativos = () => { if (!inativos?.rows.length) return; abrirPreview(construirPdfInativos({ rows: inativos.rows, subtitulo: inaSubtitulo(), logo, cor }), `${inaNomeArq()}.pdf`, "Profissionais sem produção"); };

  const nomeArq = () => `producao-${periodoArq}${cnesSel.size === 1 ? `-${[...cnesSel][0]}` : ""}`;
  // Linhas com o nome da unidade resolvido (cadastro) — para o nome sair nos relatórios, não o CNES.
  const filtradasNomeadas = () => filtradas.map((r) => (r.cnes && !r.estabelecimento_nome?.trim() ? { ...r, estabelecimento_nome: nomeUnidade(r.cnes) } : r));
  const baixarCsvProd = () => {
    if (filtradas.length === 0) return;
    baixarCsv(`${nomeArq()}.csv`, csvProducao(filtradasNomeadas(), mapas));
    toast.success("CSV gerado.");
  };
  const baixarPdfProd = () => {
    if (filtradas.length === 0) return;
    const pdf = construirPdfProducao({ rows: filtradasNomeadas(), mapas, competenciaMes: compDe, periodo: periodoLabel, filtros: filtrosLabel(), logo, cor, responsavel: user?.nome ?? null });
    abrirPreview(pdf, `${nomeArq()}.pdf`, "Relatório de Produção");
  };
  const imprimirFichas = () => {
    const ids = [...new Set(filtradas.map((r) => `${r.tipo === "BPA-C" ? "C" : r.tipo === "RAAS" ? "R" : "I"}~${r.ficha_id}`))];
    if (ids.length === 0) return;
    window.open(`/imprimir?itens=${encodeURIComponent(ids.join(","))}`, "_blank");
  };

  const selCls = "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm";
  const lblTopo = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
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

        {/* ============ FILTROS-BASE — período + unidade que regem TODA a página ============ */}
        <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}
          className="mb-5 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            <label className="block">
              <span className={lblTopo}>Atalho de período</span>
              <select value={presetAtivo} onChange={(e) => { const p = PRESETS_PERIODO.find((x) => x.key === e.target.value); if (p) { const [d, a] = p.range(); setCompDe(d); setCompAte(a); } }} className={selCls}>
                {PRESETS_PERIODO.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                <option value="custom">Personalizado</option>
              </select>
            </label>
            <label className="block">
              <span className={lblTopo}>De</span>
              <select value={compDe} onChange={(e) => { const v = e.target.value; setCompDe(v); if (v > compAte) setCompAte(v); }} className={selCls}>
                {ultimosMeses(12).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={lblTopo}>Até</span>
              <select value={compAte} onChange={(e) => { const v = e.target.value; setCompAte(v); if (v < compDe) setCompDe(v); }} className={selCls}>
                {ultimosMeses(12).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
              </select>
            </label>
            <div className="col-span-2 sm:col-span-1 lg:col-span-2">
              <MultiSelect titulo="Unidade" allLabel="Todas as unidades" opcoes={unidades} sel={cnesSel} onChange={setCnesSel} />
            </div>
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground">
            Estes filtros <strong className="text-foreground">regem todos os relatórios desta página</strong> — produção, consistência e profissionais sem produção.
            {" "}Selecionado: <strong className="text-foreground">{periodoLabel}</strong> · <strong className="text-foreground">{cnesSel.size > 0 ? `${cnesSel.size} unidade(s)` : "todas as unidades"}</strong>.
          </p>
        </motion.section>

        {/* ============ Relatório de Produção (BPA-I/BPA-C) ============ */}
        <section className={`${cardCls} mb-5`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground"><FileText className="size-4 text-primary" /> Produção (BPA-I / BPA-C / RAAS)</h2>
            <button onClick={carregar} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>

          {/* Filtros (o PERÍODO fica na barra do topo, regendo a página toda) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <MultiSelect titulo="Tipo" allLabel="Todos" opcoes={tipos} sel={tipoSel} onChange={setTipoSel} />
            <MultiSelect titulo="Profissional" allLabel="Todos" opcoes={profissionais} sel={profSel} onChange={setProfSel} />
            <div className="lg:col-span-2"><MultiSelect titulo="Procedimento" allLabel="Todos" opcoes={procedimentos} comCodigo sel={procSel} onChange={setProcSel} /></div>
            <MultiSelect titulo="CID" allLabel="Todos" opcoes={cids} sel={cidSel} onChange={setCidSel} />
            <MultiSelect titulo="Caráter" allLabel="Todos" opcoes={carateres} sel={caraterSel} onChange={setCaraterSel} />
          </div>

          {/* Prévia */}
          <div className={`mt-4 grid grid-cols-2 gap-3 ${!loading && raas > 0 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
            <MiniStat label="Procedimentos" value={totalQtd} destaque loading={loading} />
            <MiniStat label="Atendimentos" value={filtradas.length} loading={loading} />
            <MiniStat label="BPA-C" value={bpaC} loading={loading} />
            <MiniStat label="BPA-I" value={bpaI} loading={loading} />
            {!loading && raas > 0 && <MiniStat label="RAAS" value={raas} />}
          </div>

          {/* Ações */}
          <div className="mt-4 flex flex-wrap gap-2">
            {!pode("emitir_rel_producao") && (
              <span className="inline-flex items-center gap-1.5 self-center rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground" title="Sem permissão — fale com o gestor"><Lock className="size-3.5" /> Sem permissão para emitir</span>
            )}
            <button onClick={baixarCsvProd} disabled={loading || filtradas.length === 0 || !pode("emitir_rel_producao")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
              <Download className="size-4" /> Baixar CSV
            </button>
            <button onClick={baixarPdfProd} disabled={loading || filtradas.length === 0 || !pode("emitir_rel_producao")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <FileText className="size-4" /> Gerar PDF (timbre)
            </button>
            <button onClick={imprimirFichas} disabled={loading || filtradas.length === 0 || !pode("emitir_rel_producao")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
              <Printer className="size-4" /> Imprimir fichas
            </button>
            <span className="inline-flex items-center gap-1.5 self-center text-xs text-muted-foreground">
              {loading ? <><Loader2 className="size-3.5 animate-spin" /> Buscando produção…</> : `${filtradas.length} linha(s) · ${filtrosLabel()}`}
            </span>
          </div>
        </section>

        {/* ============ Consistência da produção (antigo "Erros / Crivo") ============ */}
        <section className={`${cardCls} mb-5`}>
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-foreground"><AlertTriangle className="size-4 text-amber-500" /> Consistência da produção</h2>
          <p className="mb-3 text-xs text-muted-foreground">Varre a produção do período selecionado acima ({periodoLabel}) e o cadastro, e lista o que precisa de correção antes de transmitir.</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {TODAS_CATS.map((c) => {
              const on = categoriasErro.has(c);
              return (
                <button key={c} type="button" onClick={() => toggleCat(c)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                  {on ? "✓ " : ""}{ROTULO_CATEGORIA[c]}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={verificarErros} disabled={verificando || categoriasErro.size === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {verificando ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />} Verificar erros
            </button>
            {erros && (
              <>
                <span className="text-sm"><b className="text-rose-600">{nErros}</b> erro(s) · <b className="text-amber-600">{nAvisos}</b> aviso(s)</span>
                <select value={filtroGrav} onChange={(e) => setFiltroGrav(e.target.value as typeof filtroGrav)} className={selCls + " ml-auto max-w-[10rem]"}>
                  <option value="todas">Todos</option><option value="erro">Só erros</option><option value="aviso">Só avisos</option>
                </select>
                {!pode("emitir_rel_consistencia") && <span className="inline-flex items-center gap-1 self-center text-xs text-muted-foreground" title="Sem permissão — fale com o gestor"><Lock className="size-3.5" /> sem permissão</span>}
                <button onClick={baixarCsvErros} disabled={errosFiltrados.length === 0 || !pode("emitir_rel_consistencia")} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"><Download className="size-4" /> CSV</button>
                <button onClick={baixarPdfErros} disabled={errosFiltrados.length === 0 || !pode("emitir_rel_consistencia")} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"><FileText className="size-4" /> PDF</button>
              </>
            )}
          </div>
          {erros && (
            <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Categoria</th>
                    <th className="px-2 py-1.5 text-left">Grav.</th>
                    <th className="px-2 py-1.5 text-left">Tipo</th>
                    <th className="px-2 py-1.5 text-left">CNES</th>
                    <th className="px-2 py-1.5 text-left">Profissional</th>
                    <th className="px-2 py-1.5 text-left">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {errosFiltrados.length === 0 && <tr><td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">{verificando ? "Verificando…" : "Nenhum erro encontrado 🎉"}</td></tr>}
                  {errosFiltrados.map((e, i) => (
                    <tr key={i} className="border-t border-border align-top">
                      <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{ROTULO_CATEGORIA[e.categoria]}</td>
                      <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${e.gravidade === "erro" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{e.gravidade === "erro" ? "ERRO" : "AVISO"}</span></td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{e.tipo}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap font-mono text-[11px]">{e.cnes}</td>
                      <td className="px-2 py-1.5">{e.profissional}</td>
                      <td className="px-2 py-1.5 text-foreground">{e.descricao}{e.fichaId ? (e.tipo === "TFD"
                        ? <a href={`/tfd?cnes=${e.cnes}&comp=${e.competencia}`} target="_blank" rel="noreferrer" className="ml-1 text-primary hover:underline">abrir no TFD</a>
                        : <a href={`${e.tipo === "BPA-C" ? "/bpa-c-v3" : e.tipo === "RAAS" ? "/raas" : "/bpa-i-v3"}?ficha=${e.fichaId}`} target="_blank" rel="noreferrer" className="ml-1 text-primary hover:underline">abrir ficha</a>) : null}{e.categoria === "paciente-revisao" && e.pacienteId ? <button onClick={() => resolverRevisao(e.pacienteId!)} disabled={resolvendo === e.pacienteId} className="ml-2 rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">{resolvendo === e.pacienteId ? "Resolvendo…" : "Resolver revisão"}</button> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ============ Profissionais inativos / sem produção ============ */}
        <section className={`${cardCls} mb-5`}>
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-foreground"><UserX className="size-4 text-primary" /> Profissionais sem produção</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Profissionais que atendem pacientes e que <strong>não lançaram produção</strong> no período <strong>{periodoLabel}</strong> (seletor do topo da página).
            O CBO (ocupação) vem do <strong>vínculo no CNES</strong> — um profissional pode ter mais de um. Porteiro, vigia, cozinheiro, limpeza e demais funções de apoio são <strong>excluídos pelo CBO</strong>.
            Produção sem CNS (ex.: BPA-C) é <strong>atribuída pelo CBO</strong> quando há um único profissional com aquele CBO na unidade.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Janela anterior</span>
              <select value={inaJanela} onChange={(e) => setInaJanela(Number(e.target.value))} className={selCls}>
                <option value={3}>Últimos 3 meses</option>
                <option value={6}>Últimos 6 meses</option>
                <option value={12}>Últimos 12 meses</option>
              </select>
            </label>
            <p className="col-span-2 self-end pb-1 text-[11px] text-muted-foreground sm:col-span-3">Unidade e período vêm do <strong className="text-foreground">seletor do topo</strong> da página.</p>
          </div>
          <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={inaIncluirRoster} onChange={(e) => setInaIncluirRoster(e.target.checked)} className="mt-0.5 size-4 shrink-0 rounded border-border" />
            <span>
              <span className="font-medium text-foreground">Incluir também quem nunca lançou produção.</span>{" "}
              Além dos que sumiram no mês, lista os profissionais cadastrados no CNES que <strong>nunca</strong> lançaram nada (já filtrados pelo CBO assistencial do vínculo).
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={verificarInativos} disabled={inaLoading || cnesOpcoes.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {inaLoading ? <Loader2 className="size-4 animate-spin" /> : <UserX className="size-4" />} Verificar
            </button>
            {inativos && (
              <>
                <span className="text-sm">
                  <b className="text-amber-600">{inativos.rows.filter((r) => r.situacao === "sumiu").length}</b> sem produção no mês
                  {inaIncluirRoster && <> · <b className="text-muted-foreground">{inativos.rows.filter((r) => r.situacao === "nunca").length}</b> nunca lançaram</>}
                </span>
                <button onClick={baixarCsvInativos} disabled={!inativos.rows.length || !pode("emitir_rel_inativos")} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"><Download className="size-4" /> CSV</button>
                <button onClick={baixarPdfInativos} disabled={!inativos.rows.length || !pode("emitir_rel_inativos")} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"><FileText className="size-4" /> PDF</button>
              </>
            )}
          </div>
          {inativos && (
            <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Situação</th>
                    <th className="px-2 py-1.5 text-left">Profissional</th>
                    <th className="px-2 py-1.5 text-left">Unidade</th>
                    <th className="px-2 py-1.5 text-left">Ocupação (CBO)</th>
                    <th className="px-2 py-1.5 text-left">Últ. produção</th>
                    <th className="px-2 py-1.5 text-right">Qtd período</th>
                  </tr>
                </thead>
                <tbody>
                  {inativos.rows.length === 0 && <tr><td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">{inaLoading ? "Verificando…" : "Todos os profissionais assistenciais lançaram produção no período 🎉"}</td></tr>}
                  {inativos.rows.map((r) => (
                    <tr key={`${r.cns}~${r.cnes}`} className="border-t border-border align-top">
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.situacao === "sumiu" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>{r.situacao === "sumiu" ? "SEM PRODUÇÃO" : "NUNCA"}</span>
                      </td>
                      <td className="px-2 py-1.5">{r.nome}<span className="block font-mono text-[10px] text-muted-foreground">{r.cns}</span></td>
                      <td className="px-2 py-1.5">{r.nomeUnidade}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{r.cboLabel || <span className="italic">Não identificado</span>}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.ultimoMes ? mesLabel(r.ultimoMes) : "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.qtdPeriodo.toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {inativos && (inativos.excluidosNaoClinico > 0 || inativos.semCboCount > 0) && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {inativos.excluidosNaoClinico > 0 && <>{inativos.excluidosNaoClinico} com CBO só de apoio foram excluídos. </>}
              {inativos.semCboCount > 0 && <>{inativos.semCboCount} sem CBO identificado no vínculo (mantidos na lista para conferência).</>}
            </p>
          )}
        </section>

        {/* ============ Outros relatórios — gerados AQUI (validam filtros e baixam) ============ */}
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Outros relatórios</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RelatorioCard icon={<FileSpreadsheet className="size-5" />} titulo="FPO × Produção"
            desc="Orçamento vs. produção por unidade e competência. Gera PDF (timbre)."
            bloqueado={!pode("emitir_rel_fpo")} onClick={() => setFpoOpen(true)} />
          {podeTfd && (
            <RelatorioCard icon={<Ambulance className="size-5" />} titulo="TFD"
              desc="Por unidade e faixa de competência, com agrupamentos. Gera CSV e PDF (timbre)."
              bloqueado={!pode("emitir_rel_tfd")} onClick={() => setTfdOpen(true)} />
          )}
          <RelatorioCard icon={<Users className="size-5" />} titulo="Perfil de pacientes"
            desc="Faixa etária, sexo, raça/cor, situação de rua + CID e procedimentos. Agregado e anonimizado (LGPD)."
            bloqueado={!pode("emitir_rel_perfil")} onClick={() => setPerfilOpen(true)} />
          <RelatorioCard icon={<Users className="size-5" />} titulo="Relação de pacientes"
            desc="Lista nominal (com nome) — Geral, TFD, RAAS ou por procedimento. Uso interno / conferência."
            bloqueado={!pode("emitir_rel_perfil")} onClick={() => setRelacaoOpen(true)} />
          <RelatorioCard icon={<FileBarChart className="size-5" />} titulo="Tabulação por procedimento"
            desc="Procedimento × faixa etária × sexo × raça/cor × bairro. Só números (anonimizado)."
            bloqueado={!pode("emitir_rel_perfil")} onClick={() => setTabulacaoOpen(true)} />
        </div>
      </div>

      {fpoOpen && <FpoModal unidades={cnesOpcoes} logo={logo} cor={cor} responsavel={user?.nome ?? null} onClose={() => setFpoOpen(false)} />}
      {tfdOpen && <TfdModal unidades={cnesOpcoes.filter((u) => CNES_TFD.includes(u.cnes))} logo={logo} cor={cor} onClose={() => setTfdOpen(false)} />}
      {perfilOpen && <PerfilModal logo={logo} cor={cor} unidades={cnesOpcoes} nomeUnidade={nomeUnidade} onClose={() => setPerfilOpen(false)} />}
      {relacaoOpen && <RelacaoModal logo={logo} cor={cor} unidades={cnesOpcoes} onClose={() => setRelacaoOpen(false)} />}
      {tabulacaoOpen && <TabulacaoModal logo={logo} cor={cor} unidades={cnesOpcoes} onClose={() => setTabulacaoOpen(false)} />}
      {previewNode}
    </div>
  );
}

function MiniStat({ label, value, destaque = false, loading = false }: { label: string; value: number; destaque?: boolean; loading?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destaque ? "border-primary/30 bg-primary/5" : "border-border bg-muted/40"}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {loading
        ? <span className="mt-2 block h-5 w-16 animate-pulse rounded bg-muted-foreground/20" />
        : <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value.toLocaleString("pt-BR")}</p>}
    </div>
  );
}

function RelatorioCard({ icon, titulo, desc, onClick, bloqueado = false }: { icon: React.ReactNode; titulo: string; desc: string; onClick: () => void; bloqueado?: boolean }) {
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
function FpoModal({ unidades, logo, cor, responsavel, onClose }: { unidades: { cnes: string; nome: string }[]; logo: string | null; cor: string | null; responsavel: string | null; onClose: () => void }) {
  const { abrirPreview, previewNode } = usePreviewPdf();
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
          abrirPreview(construirPdfFpoPorUnidade({ unidades: comRows, competencia, logo, cor, responsavel }), `relatorio-fpo-todas-${competencia}.pdf`, "FPO × Produção — todas as unidades");
          return;
        }
        const rows = agregarFpo(todas.flat());
        if (rows.length === 0) { toast.error("Sem dados de FPO/produção nesta competência."); return; }
        abrirPreview(construirPdfFpo({ nomeUnidade: `Todas as unidades (${unidades.length})`, cnes: "TODAS", competencia, rows, responsavel, logo, cor }), `relatorio-fpo-todas-${competencia}.pdf`, "FPO × Produção — consolidado");
      } else {
        const rows = await carregarComparacaoFpo(cnes, competencia);
        if (rows.length === 0) { toast.error("Sem dados de FPO/produção nesta unidade/competência."); return; }
        const nomeUnidade = unidades.find((u) => u.cnes === cnes)?.nome ?? cnes;
        abrirPreview(construirPdfFpo({ nomeUnidade, cnes, competencia, rows, responsavel, logo, cor }), `relatorio-fpo-${cnes}-${competencia}.pdf`, "FPO × Produção");
      }
    } finally { setGerando(false); }
  };
  return (
    <ModalRel titulo="Relatório FPO × Produção" onClose={onClose}>
      {previewNode}
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

// ---- Perfil de pacientes (agregado/anonimizado, LGPD): seções + filtros ----
const SECOES_PERFIL = [
  { key: "faixaSexo", grupo: "Cadastro", label: "Faixa etária × Sexo" },
  { key: "raca", grupo: "Cadastro", label: "Raça/Cor" },
  { key: "situacaoRua", grupo: "Cadastro", label: "Situação de rua" },
  { key: "cid", grupo: "Clínico (período)", label: "CID mais frequentes" },
  { key: "proc", grupo: "Clínico (período)", label: "Procedimentos mais realizados" },
  { key: "porUnidade", grupo: "Clínico (período)", label: "Produção por unidade" },
] as const;
type SecaoPerfil = (typeof SECOES_PERFIL)[number]["key"];

function PerfilModal({ logo, cor, unidades, nomeUnidade, onClose }: { logo: string | null; cor: string | null; unidades: { cnes: string; nome: string }[]; nomeUnidade: (c: string) => string; onClose: () => void }) {
  const { abrirPreview, previewNode } = usePreviewPdf();
  const [compDe, setCompDe] = useState(competenciaAtual());
  const [compAte, setCompAte] = useState(competenciaAtual());
  const [cnes, setCnes] = useState("todas");
  const [tipo, setTipo] = useState<"todos" | "BPA-I" | "BPA-C" | "RAAS">("todos");
  const [baseCad, setBaseCad] = useState<"org" | "atendidos">("org");
  const [secoes, setSecoes] = useState<Set<SecaoPerfil>>(new Set(SECOES_PERFIL.map((s) => s.key)));
  const [gerando, setGerando] = useState(false);
  const K = 5; // limiar de supressão (< 5)
  const clinicoSelecionado = secoes.has("cid") || secoes.has("proc") || secoes.has("porUnidade");
  const cadastroSelecionado = secoes.has("faixaSexo") || secoes.has("raca") || secoes.has("situacaoRua");
  // Os filtros (período/unidade/tipo) aparecem quando há seção clínica OU quando o cadastro
  // usa a base "atendidos no filtro".
  const mostrarFiltros = clinicoSelecionado || (cadastroSelecionado && baseCad === "atendidos");
  const toggle = (k: SecaoPerfil) => setSecoes((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const gerar = async () => {
    if (secoes.size === 0) { toast.error("Selecione ao menos uma informação."); return; }
    setGerando(true);
    try {
      const cnesList = cnes === "todas" ? [] : [cnes];
      const precisaCadastro = cadastroSelecionado;
      const cadastroPromise = !precisaCadastro
        ? Promise.resolve({ total: 0, faixaSexo: [], raca: [], situacaoRua: [] })
        : baseCad === "atendidos"
          ? carregarPerfilAtendidos(cnesList, compDe, compAte, tipo)
          : carregarPerfilCadastro();
      const [cadastro, prodBruta] = await Promise.all([
        cadastroPromise,
        clinicoSelecionado ? carregarProducaoDashboardPeriodo(compDe, compAte) : Promise.resolve([]),
      ]);
      if (precisaCadastro && !cadastro) { toast.error("Não foi possível carregar o perfil do cadastro."); return; }
      // Filtros do perfil clínico: unidade e tipo.
      const prod = prodBruta.filter((r) =>
        (cnes === "todas" || r.cnes === cnes) && (tipo === "todos" || r.tipo === tipo));
      const [nomesProc, nomesCid] = await Promise.all([
        carregarNomesProcedimentos(prod.map((r) => r.procedimento)),
        carregarDescricoesCid(prod.map((r) => r.cid).filter((c): c is string => !!c)),
      ]);
      const nomeProc = (c: string) => nomesProc[c] || null;
      const rotuloCid = (c: string | null) => { if (!c) return "Sem CID"; const dd = nomesCid[c]; return dd ? `${c} — ${dd}` : c; };
      const periodoLabel = compDe === compAte ? mesLabel(compDe) : `${mesLabel(compDe)} a ${mesLabel(compAte)}`;
      const filtros = [
        cnes !== "todas" ? `Unidade: ${unidades.find((u) => u.cnes === cnes)?.nome ?? cnes}` : null,
        tipo !== "todos" ? `Tipo: ${tipo}` : null,
      ].filter(Boolean).join("  ·  ");
      const pdf = construirPdfPerfil({
        cadastro: cadastro!,
        cidTop: agregarCid(prod, rotuloCid),
        procTop: agregarProcedimentos(prod, nomeProc),
        porUnidade: agregarPorUnidade(prod, nomeUnidade),
        periodoLabel, filtros: filtros || undefined,
        cadastroEscopo: baseCad === "atendidos" ? `atendidos no filtro${filtros ? ` (${filtros})` : ""}` : "toda a organização",
        incluir: { faixaSexo: secoes.has("faixaSexo"), raca: secoes.has("raca"), situacaoRua: secoes.has("situacaoRua"), cid: secoes.has("cid"), proc: secoes.has("proc"), porUnidade: secoes.has("porUnidade") },
        k: K, logo, cor,
      });
      abrirPreview(pdf, `perfil-pacientes-${compDe === compAte ? compDe : `${compDe}-${compAte}`}.pdf`, "Perfil de pacientes e atendimentos");
    } catch { toast.error("Falha ao gerar o relatório de perfil."); }
    finally { setGerando(false); }
  };

  return (
    <ModalRel titulo="Perfil de pacientes (agregado · anonimizado)" onClose={onClose}>
      {previewNode}
      <p className="mb-3 text-xs text-muted-foreground">
        Escolha as informações e os filtros. Relatório de uso interno / gestão em saúde, com valores reais.
      </p>

      {/* Seleção de seções */}
      <div className="mb-3">
        <span className={lblCls2}>Informações no relatório</span>
        <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SECOES_PERFIL.map((s) => (
            <label key={s.key} className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm">
              <input type="checkbox" checked={secoes.has(s.key)} onChange={() => toggle(s.key)} className="size-4 rounded border-border" />
              <span className="flex-1">{s.label}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.grupo}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Base das tabelas de cadastro (faixa etária/raça/situação de rua). */}
      {cadastroSelecionado && (
        <div className="mb-3">
          <span className={lblCls2}>Base do cadastro (faixa etária, raça/cor, situação de rua)</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <label className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${baseCad === "org" ? "border-primary bg-primary/5" : "border-border"}`}>
              <input type="radio" name="baseCad" checked={baseCad === "org"} onChange={() => setBaseCad("org")} className="mt-0.5" />
              <span><strong className="text-foreground">Toda a organização</strong><br />todos os pacientes cadastrados</span>
            </label>
            <label className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${baseCad === "atendidos" ? "border-primary bg-primary/5" : "border-border"}`}>
              <input type="radio" name="baseCad" checked={baseCad === "atendidos"} onChange={() => setBaseCad("atendidos")} className="mt-0.5" />
              <span><strong className="text-foreground">Atendidos no filtro</strong><br />quem teve produção (BPA-I/RAAS) na unidade/período</span>
            </label>
          </div>
        </div>
      )}

      {/* Aviso conforme a base do cadastro. */}
      {mostrarFiltros && (
        <p className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          {baseCad === "atendidos"
            ? <>Os filtros valem para as tabelas clínicas <strong>e</strong> para o cadastro (base “atendidos”). Atendidos consideram só <strong>BPA-I e RAAS</strong> — o BPA-C não registra paciente.</>
            : <>Os filtros valem só para as tabelas <strong>clínicas</strong>. O cadastro está na base “toda a organização”.</>}
        </p>
      )}
      {/* Filtros (período/unidade/tipo) */}
      {mostrarFiltros && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={lblCls2}>Mês de produção · de</span>
            <select value={compDe} onChange={(e) => { const v = e.target.value; setCompDe(v); if (v > compAte) setCompAte(v); }} className={selCls2}>
              {ultimosMesesMod(12).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={lblCls2}>até</span>
            <select value={compAte} onChange={(e) => { const v = e.target.value; setCompAte(v); if (v < compDe) setCompDe(v); }} className={selCls2}>
              {ultimosMesesMod(12).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={lblCls2}>Unidade</span>
            <select value={cnes} onChange={(e) => setCnes(e.target.value)} className={selCls2}>
              <option value="todas">Todas as unidades</option>
              {unidades.map((u) => <option key={u.cnes} value={u.cnes}>{u.nome}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={lblCls2}>Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={selCls2}>
              <option value="todos">Todos</option><option value="BPA-I">BPA-I</option><option value="BPA-C">BPA-C</option><option value="RAAS">RAAS</option>
            </select>
          </label>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button onClick={gerar} disabled={gerando || secoes.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {gerando ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Gerar PDF (timbre)
        </button>
      </div>
    </ModalRel>
  );
}

// ---- Relação NOMINAL de pacientes (com nome, uso interno) ----
function RelacaoModal({ logo, cor, unidades, onClose }: { logo: string | null; cor: string | null; unidades: { cnes: string; nome: string }[]; onClose: () => void }) {
  const { abrirPreview, previewNode } = usePreviewPdf();
  const [categoria, setCategoria] = useState<"geral" | "tfd" | "raas" | "procedimento">("geral");
  const [compDe, setCompDe] = useState(competenciaAtual());
  const [compAte, setCompAte] = useState(competenciaAtual());
  const [cnes, setCnes] = useState("todas");
  const [tipo, setTipo] = useState<"todos" | "BPA-I" | "RAAS">("todos");
  const [procs, setProcs] = useState<string[]>([]);
  const [gerando, setGerando] = useState(false);
  const usaPeriodo = categoria !== "geral";
  const usaUnidade = categoria === "raas" || categoria === "procedimento";
  const periodoLabel = compDe === compAte ? mesLabel(compDe) : `${mesLabel(compDe)} a ${mesLabel(compAte)}`;

  const gerar = async () => {
    setGerando(true);
    try {
      const cnesList = cnes === "todas" ? [] : [cnes];
      let pacientes; let titulo; let sub;
      if (categoria === "geral") { pacientes = await relacaoGeral(); titulo = "Relação de pacientes — Geral"; sub = "Todos os pacientes cadastrados"; }
      else if (categoria === "tfd") { pacientes = await relacaoTfd(compDe, compAte); titulo = "Relação de pacientes — TFD"; sub = `Pacientes com TFD · ${periodoLabel}`; }
      else if (categoria === "raas") { pacientes = await relacaoProducao(cnesList, compDe, compAte, "RAAS", []); titulo = "Relação de pacientes — RAAS"; sub = `Atendidos no RAAS · ${periodoLabel}`; }
      else {
        if (procs.length === 0) { toast.error("Selecione ao menos um procedimento."); return; }
        pacientes = await relacaoProducao(cnesList, compDe, compAte, tipo, procs);
        const nm = await carregarNomesProcedimentos(procs);
        const rot = procs.length === 1 ? (nm[procs[0]] ? `${nm[procs[0]]} (${procs[0]})` : procs[0]) : `${procs.length} procedimentos`;
        titulo = "Relação de pacientes — por procedimento"; sub = `${rot} · ${periodoLabel}`;
      }
      if (pacientes.length === 0) { toast.warning("Nenhum paciente encontrado para este recorte."); }
      const uni = usaUnidade && cnes !== "todas" ? `  ·  Unidade: ${unidades.find((u) => u.cnes === cnes)?.nome ?? cnes}` : "";
      const pdf = construirPdfRelacao({ titulo, subtitulo: sub + uni, pacientes, mostrarMunicipio: categoria === "geral" || categoria === "tfd", logo, cor });
      abrirPreview(pdf, `relacao-${categoria}.pdf`, titulo);
    } catch { toast.error("Falha ao gerar a relação."); }
    finally { setGerando(false); }
  };

  return (
    <ModalRel titulo="Relação de pacientes (com nome · uso interno)" onClose={onClose}>
      {previewNode}
      <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
        Contém <strong>nome e dados pessoais</strong> — uso interno / conferência (LGPD). Não divulgar.
      </p>
      <label className="block">
        <span className={lblCls2}>Categoria</span>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)} className={selCls2}>
          <option value="geral">Geral (todos os cadastrados)</option>
          <option value="tfd">TFD</option>
          <option value="raas">RAAS</option>
          <option value="procedimento">Por procedimento</option>
        </select>
      </label>
      {usaPeriodo && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block"><span className={lblCls2}>Mês · de</span>
            <select value={compDe} onChange={(e) => { const v = e.target.value; setCompDe(v); if (v > compAte) setCompAte(v); }} className={selCls2}>{ultimosMesesMod(12).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}</select></label>
          <label className="block"><span className={lblCls2}>até</span>
            <select value={compAte} onChange={(e) => { const v = e.target.value; setCompAte(v); if (v < compDe) setCompDe(v); }} className={selCls2}>{ultimosMesesMod(12).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}</select></label>
          {usaUnidade && (
            <label className="block"><span className={lblCls2}>Unidade</span>
              <select value={cnes} onChange={(e) => setCnes(e.target.value)} className={selCls2}><option value="todas">Todas</option>{unidades.map((u) => <option key={u.cnes} value={u.cnes}>{u.nome}</option>)}</select></label>
          )}
          {categoria === "procedimento" && (
            <>
              <label className="block"><span className={lblCls2}>Tipo</span>
                <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={selCls2}><option value="todos">Todos</option><option value="BPA-I">BPA-I</option><option value="RAAS">RAAS</option></select></label>
              <label className="block sm:col-span-2"><span className={lblCls2}>Procedimento(s)</span>
                <ProcedimentoPicker value={procs} onChange={setProcs} /></label>
            </>
          )}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button onClick={gerar} disabled={gerando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {gerando ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Gerar PDF (timbre)
        </button>
      </div>
    </ModalRel>
  );
}

// ---- Tabulação por procedimento (agregada, só números) ----
const DIMS_TAB: { key: DimTab; label: string }[] = [
  { key: "faixa", label: "Por faixa etária" },
  { key: "faixa_sexo", label: "Faixa etária × Sexo" },
  { key: "sexo", label: "Por sexo" },
  { key: "raca", label: "Por raça/cor" },
  { key: "bairro", label: "Por bairro" },
];
function TabulacaoModal({ logo, cor, unidades, onClose }: { logo: string | null; cor: string | null; unidades: { cnes: string; nome: string }[]; onClose: () => void }) {
  const { abrirPreview, previewNode } = usePreviewPdf();
  const [compDe, setCompDe] = useState(competenciaAtual());
  const [compAte, setCompAte] = useState(competenciaAtual());
  const [cnes, setCnes] = useState("todas");
  const [tipo, setTipo] = useState<"todos" | "BPA-I" | "RAAS">("todos");
  const [procs, setProcs] = useState<string[]>([]);
  const [dims, setDims] = useState<Set<DimTab>>(new Set(["faixa_sexo", "raca", "bairro"] as DimTab[]));
  const [gerando, setGerando] = useState(false);
  const K = 5;
  const toggleDim = (k: DimTab) => setDims((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const periodoLabel = compDe === compAte ? mesLabel(compDe) : `${mesLabel(compDe)} a ${mesLabel(compAte)}`;

  const gerar = async () => {
    if (dims.size === 0) { toast.error("Selecione ao menos um recorte."); return; }
    setGerando(true);
    try {
      const cnesList = cnes === "todas" ? [] : [cnes];
      const tab = await carregarTabulacao(cnesList, compDe, compAte, tipo, procs);
      if (!tab) { toast.error("Falha ao carregar a tabulação."); return; }
      if (tab.total === 0) { toast.warning("Nenhum atendimento para este recorte."); }
      const nm = procs.length ? await carregarNomesProcedimentos(procs) : {};
      const procLabel = procs.length === 0 ? "Todos os procedimentos"
        : procs.length === 1 ? (nm[procs[0]] ? `${nm[procs[0]]} (${procs[0]})` : `Procedimento ${procs[0]}`)
        : `${procs.length} procedimentos (${procs.join(", ")})`;
      const filtros = [
        cnes !== "todas" ? `Unidade: ${unidades.find((u) => u.cnes === cnes)?.nome ?? cnes}` : null,
        tipo !== "todos" ? `Tipo: ${tipo}` : null,
      ].filter(Boolean).join("  ·  ");
      const ordem: DimTab[] = ["faixa", "faixa_sexo", "sexo", "raca", "bairro"];
      const pdf = construirPdfTabulacao({ tab, procLabel, periodoLabel, filtros: filtros || undefined, dims: ordem.filter((d) => dims.has(d)), k: K, logo, cor });
      abrirPreview(pdf, `tabulacao-${procs.length === 1 ? procs[0] : procs.length ? "multi" : "todos"}-${compDe}-${compAte}.pdf`, "Tabulação por procedimento");
    } catch { toast.error("Falha ao gerar a tabulação."); }
    finally { setGerando(false); }
  };

  return (
    <ModalRel titulo="Tabulação por procedimento (só números)" onClose={onClose}>
      {previewNode}
      <p className="mb-3 text-xs text-muted-foreground">Conta os <strong>atendimentos</strong> (quantidade) por recorte, com <strong>valores reais</strong>. Uso interno / gestão. Cobre BPA-I, RAAS e TFD.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className={lblCls2}>Mês · de</span>
          <select value={compDe} onChange={(e) => { const v = e.target.value; setCompDe(v); if (v > compAte) setCompAte(v); }} className={selCls2}>{ultimosMesesMod(12).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}</select></label>
        <label className="block"><span className={lblCls2}>até</span>
          <select value={compAte} onChange={(e) => { const v = e.target.value; setCompAte(v); if (v < compDe) setCompDe(v); }} className={selCls2}>{ultimosMesesMod(12).map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}</select></label>
        <label className="block"><span className={lblCls2}>Unidade</span>
          <select value={cnes} onChange={(e) => setCnes(e.target.value)} className={selCls2}><option value="todas">Todas</option>{unidades.map((u) => <option key={u.cnes} value={u.cnes}>{u.nome}</option>)}</select></label>
        <label className="block"><span className={lblCls2}>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={selCls2}><option value="todos">Todos</option><option value="BPA-I">BPA-I</option><option value="RAAS">RAAS</option></select></label>
        <label className="block sm:col-span-2"><span className={lblCls2}>Procedimento(s) (vazio = todos)</span>
          <ProcedimentoPicker value={procs} onChange={setProcs} /></label>
      </div>
      <div className="mt-3">
        <span className={lblCls2}>Recortes (tabelas)</span>
        <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {DIMS_TAB.map((d) => (
            <label key={d.key} className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm">
              <input type="checkbox" checked={dims.has(d.key)} onChange={() => toggleDim(d.key)} className="size-4 rounded border-border" />
              {d.label}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button onClick={gerar} disabled={gerando || dims.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {gerando ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Gerar PDF (timbre)
        </button>
      </div>
    </ModalRel>
  );
}

// ---- TFD: unidade + faixa de competência + status + agrupamento → CSV/PDF aqui ----
function TfdModal({ unidades, logo, cor, onClose }: { unidades: { cnes: string; nome: string }[]; logo: string | null; cor: string | null; onClose: () => void }) {
  const { abrirPreview, previewNode } = usePreviewPdf();
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
        unidades: secoes.map(({ u, m }) => ({ nome: u.nome, cnes: u.cnes, colunas: m.colunas, dados: m.dados, totalTfd: m.totalTfd, totalViagens: m.totalViagens, totalProducao: m.totalProducao, totalRS: brlTfd(m.totalRS) })),
        totalGeralTfd: montado.totalTfd, totalGeralViagens: montado.totalViagens, totalGeralProducao: montado.totalProducao, totalGeralRS: brlTfd(montado.totalRS),
        resumoPorUnidade: secoes.map(({ u, m }) => [u.nome, u.cnes, String(m.totalTfd), String(m.totalViagens), String(m.totalProducao), brlTfd(m.totalRS)]),
        cor,
      });
      abrirPreview(pdf, `tfd_todas_por-unidade_${compDe}-${compAte}.pdf`, "Relatório de TFD — todas as unidades"); return;
    }
    const pdf = construirPdfTfd({
      logo, nomeUnidade, periodo, status: status ? STATUS_ROTULO[status] : "Todos",
      agrupamento: AGRUPAMENTOS.find((a) => a.valor === agrup)?.rotulo ?? agrup,
      colunas: montado.colunas, dados: montado.dados, totalTfd: montado.totalTfd,
      totalViagens: montado.totalViagens, totalProducao: montado.totalProducao, totalRS: brlTfd(montado.totalRS), cor,
    });
    abrirPreview(pdf, `tfd_${agrup}_${compDe}-${compAte}.pdf`, "Relatório de TFD");
  };

  return (
    <ModalRel titulo="Relatório de TFD" onClose={onClose}>
      {previewNode}
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
