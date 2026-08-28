import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Download, Printer, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissoes } from "@/lib/permissoes";
import {
  carregarProducaoDashboardPeriodo, carregarNomesProcedimentos, carregarDescricoesCid, carregarDescricoesCbo,
  type ProducaoBpaRow,
} from "@/lib/dashboard-producao";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { csvProducao, baixarCsv, construirPdfProducao, type MapasNome } from "@/lib/relatorios/producao";
import { usePreviewPdf } from "@/components/relatorios/PreviewPdfModal";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";
import { MultiSelect, MiniStat, CabecalhoRelatorio, BarraFiltrosBase, SemAcesso, cardCls } from "@/components/relatorios/comum";

export const Route = createFileRoute("/relatorios/producao")({
  component: ProducaoPage,
});

const CARATER_NOME = new Map(CARATERES.map((c) => [c.code, c.label]));
const nomeCarater = (code: string | null) => (code ? CARATER_NOME.get(code) ?? null : null);
const nomeOuCodigo = (nome: string | null, codigo: string | null) => nome?.trim() || codigo || "Não informado";
const chaveProfissional = (r: ProducaoBpaRow) => r.profissional_cns || r.profissional_nome || r.cbo || "sem-profissional";

function ProducaoPage() {
  const { pode } = usePermissoes();
  const { compDe, compAte, cnesSel, cnesOpcoes, logo, cor, nomeUsuario, periodoLabel, periodoArq } = useRelatoriosCtx();
  const { abrirPreview, previewNode } = usePreviewPdf();

  const [rows, setRows] = useState<ProducaoBpaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nomesProc, setNomesProc] = useState<Record<string, string>>({});
  const [nomesCid, setNomesCid] = useState<Record<string, string>>({});
  const [nomesCbo, setNomesCbo] = useState<Record<string, string>>({});
  const [nomesEstabCad, setNomesEstabCad] = useState<Record<string, string>>({});
  // Filtros (multi-seleção) da produção. A UNIDADE e o PERÍODO vêm da barra de filtros-base.
  const [profSel, setProfSel] = useState<Set<string>>(new Set());
  const [procSel, setProcSel] = useState<Set<string>>(new Set());
  const [tipoSel, setTipoSel] = useState<Set<string>>(new Set());
  const [cidSel, setCidSel] = useState<Set<string>>(new Set());
  const [caraterSel, setCaraterSel] = useState<Set<string>>(new Set());

  // Token da carga (o período pode mudar rápido; só aplica a carga mais recente).
  const cargaRef = useRef(0);
  const carregar = async () => {
    const token = ++cargaRef.current;
    setLoading(true);
    const producao = await carregarProducaoDashboardPeriodo(compDe, compAte);
    if (cargaRef.current !== token) return;
    const [np, ncid, ncbo] = await Promise.all([
      carregarNomesProcedimentos(producao.map((r) => r.procedimento)),
      carregarDescricoesCid(producao.map((r) => r.cid).filter((c): c is string => !!c)),
      carregarDescricoesCbo(producao.map((r) => r.cbo).filter((c): c is string => !!c)),
    ]);
    if (cargaRef.current !== token) return;
    setRows(producao); setNomesProc(np); setNomesCid(ncid); setNomesCbo(ncbo); setLoading(false);
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [compDe, compAte]);
  useEffect(() => { setProfSel(new Set()); setProcSel(new Set()); setTipoSel(new Set()); setCidSel(new Set()); setCaraterSel(new Set()); }, [compDe, compAte]);

  // Nome do estabelecimento pelo cadastro para CNES sem nome nas linhas (ex.: RAAS importado).
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

  const melhorNomeRows = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rows) { const c = r.cnes; if (c && r.estabelecimento_nome?.trim() && !m[c]) m[c] = r.estabelecimento_nome.trim(); }
    return m;
  }, [rows]);
  const nomeUnidade = (c: string) => melhorNomeRows[c] || nomesEstabCad[c] || cnesOpcoes.find((u) => u.cnes === c)?.nome || c;
  const nomeProc = (c: string) => nomesProc[c] || null;
  const nomeCbo = (c: string | null) => (c ? (nomesCbo[c] ? nomesCbo[c].toUpperCase() : null) : null);
  const rotuloCid = (c: string | null) => { if (!c) return "Sem CID"; const d = nomesCid[c]; return d ? `${c} — ${d}` : c; };
  const mapas: MapasNome = { nomeProc, rotuloCid, nomeCbo, nomeCarater };

  const rotuloProf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) { const k = chaveProfissional(r); if (!m.has(k)) m.set(k, nomeOuCodigo(r.profissional_nome, nomeCbo(r.cbo) || r.profissional_cns || r.cbo)); }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, nomesCbo]);

  // A UNIDADE (base) é um escopo forte: pré-filtra as linhas antes da cascata dos demais filtros.
  const rowsBase = useMemo(() => (cnesSel.size ? rows.filter((r) => cnesSel.has(r.cnes ?? "")) : rows), [rows, cnesSel]);

  const depsFiltros = [profSel, procSel, tipoSel, cidSel, caraterSel];
  const anotadas = useMemo(() => rowsBase.map((r) => {
    let n = 0; let solo = "";
    const chk = (reprova: boolean, campo: string) => { if (reprova) { n++; solo = n === 1 ? campo : ""; } };
    chk(profSel.size > 0 && !profSel.has(chaveProfissional(r)), "prof");
    chk(procSel.size > 0 && !procSel.has(r.procedimento), "proc");
    chk(tipoSel.size > 0 && !tipoSel.has(r.tipo), "tipo");
    chk(cidSel.size > 0 && !cidSel.has(r.cid ?? ""), "cid");
    chk(caraterSel.size > 0 && !caraterSel.has(r.carater ?? ""), "carater");
    return { r, ok: n === 0, solo: n === 1 ? solo : "-" };
  }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowsBase, ...depsFiltros]);
  const filtradas = useMemo(() => anotadas.filter((a) => a.ok).map((a) => a.r), [anotadas]);

  const opcoesDe = (campo: string, valor: (r: ProducaoBpaRow) => string, rotulo: (code: string) => string, sel: Set<string>) => {
    const codes = new Set<string>();
    for (const a of anotadas) if (a.ok || a.solo === campo) { const v = valor(a.r); if (v) codes.add(v); }
    for (const c of sel) codes.add(c);
    return [...codes].map((code) => ({ code, label: rotulo(code) })).sort((a, b) => a.label.localeCompare(b.label));
  };
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

  const rotuloSel = (titulo: string, sel: Set<string>, opts: { code: string; label: string }[]) => {
    if (sel.size === 0) return null;
    const nomes = [...sel].map((c) => opts.find((o) => o.code === c)?.label ?? c);
    return `${titulo}: ${nomes.join(", ")}`;
  };
  const filtrosLabel = () => {
    const unidadeLbl = cnesSel.size ? `Unidade: ${[...cnesSel].map((c) => nomeUnidade(c)).join(", ")}` : null;
    const p = [
      rotuloSel("Tipo", tipoSel, tipos), unidadeLbl,
      rotuloSel("Profissional", profSel, profissionais),
      rotuloSel("Procedimento", procSel, procedimentos),
      rotuloSel("CID", cidSel, cids),
      rotuloSel("Caráter", caraterSel, carateres),
    ].filter(Boolean);
    return p.length ? p.join("  ·  ") : "Sem filtros (toda a produção do período)";
  };

  const nomeArq = () => `producao-${periodoArq}${cnesSel.size === 1 ? `-${[...cnesSel][0]}` : ""}`;
  const filtradasNomeadas = () => filtradas.map((r) => (r.cnes && !r.estabelecimento_nome?.trim() ? { ...r, estabelecimento_nome: nomeUnidade(r.cnes) } : r));
  const baixarCsvProd = () => {
    if (filtradas.length === 0) return;
    baixarCsv(`${nomeArq()}.csv`, csvProducao(filtradasNomeadas(), mapas));
    toast.success("CSV gerado.");
  };
  const baixarPdfProd = () => {
    if (filtradas.length === 0) return;
    const pdf = construirPdfProducao({ rows: filtradasNomeadas(), mapas, competenciaMes: compDe, periodo: periodoLabel, filtros: filtrosLabel(), logo, cor, responsavel: nomeUsuario });
    abrirPreview(pdf, `${nomeArq()}.pdf`, "Relatório de Produção");
  };
  const imprimirFichas = () => {
    const ids = [...new Set(filtradas.map((r) => `${r.tipo === "BPA-C" ? "C" : r.tipo === "RAAS" ? "R" : "I"}~${r.ficha_id}`))];
    if (ids.length === 0) return;
    window.open(`/imprimir?itens=${encodeURIComponent(ids.join(","))}`, "_blank");
  };

  if (!pode("emitir_rel_producao")) return (<div><CabecalhoRelatorio titulo="Produção (BPA-I / BPA-C / RAAS)" icon={<FileText className="size-5 text-primary" />} /><SemAcesso /></div>);

  return (
    <div>
      {previewNode}
      <CabecalhoRelatorio icon={<FileText className="size-5 text-primary" />} titulo="Produção (BPA-I / BPA-C / RAAS)"
        desc="Filtre e gere o relatório de produção do período/unidade selecionados." />
      <BarraFiltrosBase />

      <section className={cardCls}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-foreground">Filtros da produção</h2>
          <button onClick={carregar} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MultiSelect titulo="Tipo" allLabel="Todos" opcoes={tipos} sel={tipoSel} onChange={setTipoSel} />
          <MultiSelect titulo="Profissional" allLabel="Todos" opcoes={profissionais} sel={profSel} onChange={setProfSel} />
          <div className="lg:col-span-2"><MultiSelect titulo="Procedimento" allLabel="Todos" opcoes={procedimentos} comCodigo sel={procSel} onChange={setProcSel} /></div>
          <MultiSelect titulo="CID" allLabel="Todos" opcoes={cids} sel={cidSel} onChange={setCidSel} />
          <MultiSelect titulo="Caráter" allLabel="Todos" opcoes={carateres} sel={caraterSel} onChange={setCaraterSel} />
        </div>

        <div className={`mt-4 grid grid-cols-2 gap-3 ${!loading && raas > 0 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
          <MiniStat label="Procedimentos" value={totalQtd} destaque loading={loading} />
          <MiniStat label="Atendimentos" value={filtradas.length} loading={loading} />
          <MiniStat label="BPA-C" value={bpaC} loading={loading} />
          <MiniStat label="BPA-I" value={bpaI} loading={loading} />
          {!loading && raas > 0 && <MiniStat label="RAAS" value={raas} />}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={baixarCsvProd} disabled={loading || filtradas.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
            <Download className="size-4" /> Baixar CSV
          </button>
          <button onClick={baixarPdfProd} disabled={loading || filtradas.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <FileText className="size-4" /> Gerar PDF (timbre)
          </button>
          <button onClick={imprimirFichas} disabled={loading || filtradas.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
            <Printer className="size-4" /> Imprimir fichas
          </button>
          <span className="inline-flex items-center gap-1.5 self-center text-xs text-muted-foreground">
            {loading ? <><Loader2 className="size-3.5 animate-spin" /> Buscando produção…</> : `${filtradas.length} linha(s) · ${filtrosLabel()}`}
          </span>
        </div>
      </section>
    </div>
  );
}
