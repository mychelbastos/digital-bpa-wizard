import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissoes } from "@/lib/permissoes";
import { carregarComparacaoFpo, type FpoComparacaoRow } from "@/lib/fpo/fpo";
import { construirPdfFpo, construirPdfFpoPorUnidade } from "@/lib/fpo/relatorio-fpo";
import { usePreviewPdf } from "@/components/relatorios/PreviewPdfModal";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";
import { CabecalhoRelatorio, SemAcesso, cardCls, selCls2, lblCls2, mesLabel, competenciaAtual, ultimosMesesMod } from "@/components/relatorios/comum";

export const Route = createFileRoute("/relatorios/fpo")({
  component: FpoPage,
});

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

function FpoPage() {
  const { pode } = usePermissoes();
  const { cnesOpcoes: unidades, logo, cor, nomeUsuario: responsavel } = useRelatoriosCtx();
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

  if (!pode("emitir_rel_fpo")) return (<div><CabecalhoRelatorio titulo="FPO × Produção" icon={<FileSpreadsheet className="size-5 text-primary" />} /><SemAcesso /></div>);

  return (
    <div>
      {previewNode}
      <CabecalhoRelatorio icon={<FileSpreadsheet className="size-5 text-primary" />} titulo="FPO × Produção"
        desc="Orçamento (FPO) vs. produção por unidade e competência. Gera PDF (timbre)." />
      <section className={cardCls}>
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
      </section>
    </div>
  );
}
