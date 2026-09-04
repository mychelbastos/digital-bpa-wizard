import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileBarChart, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissoes } from "@/lib/permissoes";
import { carregarNomesProcedimentos } from "@/lib/dashboard-producao";
import { carregarTabulacao } from "@/lib/relatorios/relacao";
import { construirPdfTabulacao, type DimTab } from "@/lib/relatorios/tabulacao-pdf";
import { ProcedimentoPicker } from "@/components/relatorios/ProcedimentoPicker";
import { usePreviewPdf } from "@/components/relatorios/PreviewPdfModal";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";
import { CabecalhoRelatorio, SemAcesso, cardCls, selCls2, lblCls2, mesLabel, competenciaPadrao, ultimosMesesMod } from "@/components/relatorios/comum";

export const Route = createFileRoute("/relatorios/tabulacao")({
  component: TabulacaoPage,
});

const DIMS_TAB: { key: DimTab; label: string }[] = [
  { key: "faixa", label: "Por faixa etária" },
  { key: "faixa_sexo", label: "Faixa etária × Sexo" },
  { key: "sexo", label: "Por sexo" },
  { key: "raca", label: "Por raça/cor" },
  { key: "bairro", label: "Por bairro" },
];

function TabulacaoPage() {
  const { pode } = usePermissoes();
  const { cnesOpcoes: unidades, logo, cor } = useRelatoriosCtx();
  const { abrirPreview, previewNode } = usePreviewPdf();
  const [compDe, setCompDe] = useState(competenciaPadrao());
  const [compAte, setCompAte] = useState(competenciaPadrao());
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

  if (!pode("emitir_rel_perfil")) return (<div><CabecalhoRelatorio titulo="Tabulação por procedimento" icon={<FileBarChart className="size-5 text-primary" />} /><SemAcesso /></div>);

  return (
    <div>
      {previewNode}
      <CabecalhoRelatorio icon={<FileBarChart className="size-5 text-primary" />} titulo="Tabulação por procedimento (só números)"
        desc="Conta os atendimentos (quantidade) por recorte, com valores reais. Uso interno / gestão. Cobre BPA-I, RAAS e TFD." />
      <section className={cardCls}>
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
      </section>
    </div>
  );
}
