import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Users, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissoes } from "@/lib/permissoes";
import { carregarNomesProcedimentos } from "@/lib/dashboard-producao";
import { relacaoGeral, relacaoTfd, relacaoProducao } from "@/lib/relatorios/relacao";
import { construirPdfRelacao } from "@/lib/relatorios/relacao-pdf";
import { ProcedimentoPicker } from "@/components/relatorios/ProcedimentoPicker";
import { usePreviewPdf } from "@/components/relatorios/PreviewPdfModal";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";
import { CabecalhoRelatorio, SemAcesso, cardCls, selCls2, lblCls2, mesLabel, competenciaAtual, ultimosMesesMod } from "@/components/relatorios/comum";

export const Route = createFileRoute("/relatorios/relacao")({
  component: RelacaoPage,
});

function RelacaoPage() {
  const { pode } = usePermissoes();
  const { cnesOpcoes: unidades, logo, cor } = useRelatoriosCtx();
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

  if (!pode("emitir_rel_perfil")) return (<div><CabecalhoRelatorio titulo="Relação de pacientes" icon={<Users className="size-5 text-primary" />} /><SemAcesso /></div>);

  return (
    <div>
      {previewNode}
      <CabecalhoRelatorio icon={<Users className="size-5 text-primary" />} titulo="Relação de pacientes (com nome · uso interno)"
        desc="Lista nominal para conferência — contém dados pessoais (LGPD). Não divulgar." />
      <section className={cardCls}>
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
      </section>
    </div>
  );
}
