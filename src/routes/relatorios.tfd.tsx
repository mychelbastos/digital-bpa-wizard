import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Ambulance, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { usePermissoes } from "@/lib/permissoes";
import { CNES_TFD, carregarRelatorioTfd, type TfdStatus, type TfdRelatorioRow } from "@/lib/tfd/tfd";
import { construirPdfTfd, construirPdfTfdPorUnidade } from "@/lib/tfd/relatorio-tfd";
import { baixarCsv } from "@/lib/relatorios/producao";
import { montarRelatorioTfd, csvTabela, AGRUPAMENTOS, STATUS_ROTULO, compLabelTfd, brlTfd, type AgrupamentoRel } from "@/lib/relatorios/tfd-rel";
import { usePreviewPdf } from "@/components/relatorios/PreviewPdfModal";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";
import { CabecalhoRelatorio, SemAcesso, cardCls, selCls2, lblCls2, mesLabel, competenciaAtual, ultimosMesesMod } from "@/components/relatorios/comum";

export const Route = createFileRoute("/relatorios/tfd")({
  component: TfdPage,
});

function TfdPage() {
  const { pode } = usePermissoes();
  const { cnesOpcoes, logo, cor } = useRelatoriosCtx();
  const unidades = useMemo(() => cnesOpcoes.filter((u) => CNES_TFD.includes(u.cnes)), [cnesOpcoes]);
  const { abrirPreview, previewNode } = usePreviewPdf();
  const [cnes, setCnes] = useState("");
  const [compDe, setCompDe] = useState(competenciaAtual());
  const [compAte, setCompAte] = useState(competenciaAtual());
  const [status, setStatus] = useState<"" | TfdStatus>("");
  const [agrup, setAgrup] = useState<AgrupamentoRel>("detalhado");
  const [formato, setFormato] = useState<"porUnidade" | "consolidado">("porUnidade");
  const [porUnidade, setPorUnidade] = useState<{ cnes: string; nome: string; rows: TfdRelatorioRow[] }[]>([]);
  const [carregando, setCarregando] = useState(false);
  const unidadesKey = unidades.map((u) => u.cnes).join(",");

  // Escolhe a unidade padrão quando a lista chega.
  useEffect(() => { setCnes(unidades.length > 1 ? "todas" : (unidades[0]?.cnes ?? "")); }, [unidadesKey]);

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

  if (!pode("emitir_rel_tfd")) return (<div><CabecalhoRelatorio titulo="Relatório de TFD" icon={<Ambulance className="size-5 text-primary" />} /><SemAcesso /></div>);

  return (
    <div>
      {previewNode}
      <CabecalhoRelatorio icon={<Ambulance className="size-5 text-primary" />} titulo="Relatório de TFD"
        desc="Por unidade e faixa de competência, com agrupamentos. Gera CSV e PDF (timbre)." />
      <section className={cardCls}>
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
      </section>
    </div>
  );
}
