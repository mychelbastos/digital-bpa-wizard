import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { UserX, Loader2, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { usePermissoes } from "@/lib/permissoes";
import { mesesNoIntervalo } from "@/lib/relatorios/erros";
import { carregarInativos, type InativosResultado } from "@/lib/relatorios/inativos";
import { csvInativos, construirPdfInativos } from "@/lib/relatorios/inativos-pdf";
import { baixarCsv } from "@/lib/relatorios/producao";
import { usePreviewPdf } from "@/components/relatorios/PreviewPdfModal";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";
import { CabecalhoRelatorio, BarraFiltrosBase, SemAcesso, cardCls, selCls2, mesLabel } from "@/components/relatorios/comum";

export const Route = createFileRoute("/relatorios/inativos")({
  component: InativosPage,
});

function InativosPage() {
  const { pode } = usePermissoes();
  const { compDe, compAte, cnesSel, cnesOpcoes, logo, cor, periodoLabel, periodoArq } = useRelatoriosCtx();
  const { abrirPreview, previewNode } = usePreviewPdf();

  const [inaJanela, setInaJanela] = useState(3);
  const [inaIncluirRoster, setInaIncluirRoster] = useState(false);
  const [inativos, setInativos] = useState<InativosResultado | null>(null);
  const [inaLoading, setInaLoading] = useState(false);

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

  if (!pode("emitir_rel_inativos")) return (<div><CabecalhoRelatorio titulo="Profissionais sem produção" icon={<UserX className="size-5 text-primary" />} /><SemAcesso /></div>);

  return (
    <div>
      {previewNode}
      <CabecalhoRelatorio icon={<UserX className="size-5 text-primary" />} titulo="Profissionais sem produção"
        desc="Profissionais assistenciais que não lançaram produção no período. O CBO vem do vínculo no CNES; funções de apoio são excluídas." />
      <BarraFiltrosBase />

      <section className={cardCls}>
        <p className="mb-3 text-xs text-muted-foreground">
          Profissionais que atendem pacientes e que <strong>não lançaram produção</strong> no período <strong>{periodoLabel}</strong> (seletor do topo).
          O CBO (ocupação) vem do <strong>vínculo no CNES</strong> — um profissional pode ter mais de um. Porteiro, vigia, cozinheiro, limpeza e demais funções de apoio são <strong>excluídos pelo CBO</strong>.
          Produção sem CNS (ex.: BPA-C) é <strong>atribuída pelo CBO</strong> quando há um único profissional com aquele CBO na unidade.
        </p>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Janela anterior</span>
            <select value={inaJanela} onChange={(e) => setInaJanela(Number(e.target.value))} className={selCls2}>
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
              <button onClick={baixarCsvInativos} disabled={!inativos.rows.length} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"><Download className="size-4" /> CSV</button>
              <button onClick={baixarPdfInativos} disabled={!inativos.rows.length} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"><FileText className="size-4" /> PDF</button>
            </>
          )}
        </div>
        {inativos && (
          <div className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-border">
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
    </div>
  );
}
