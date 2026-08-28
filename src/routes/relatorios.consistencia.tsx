import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Loader2, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { usePermissoes } from "@/lib/permissoes";
import { coletarErros, resolverRevisaoPaciente, ROTULO_CATEGORIA, type CategoriaErro, type ErroItem } from "@/lib/relatorios/erros";
import { csvErros, construirPdfErros } from "@/lib/relatorios/erros-pdf";
import { baixarCsv } from "@/lib/relatorios/producao";
import { usePreviewPdf } from "@/components/relatorios/PreviewPdfModal";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";
import { CabecalhoRelatorio, BarraFiltrosBase, SemAcesso, cardCls, selCls2 } from "@/components/relatorios/comum";

export const Route = createFileRoute("/relatorios/consistencia")({
  component: ConsistenciaPage,
});

const TODAS_CATS: CategoriaErro[] = ["producao-sigtap", "ficha-incompleta", "paciente-revisao", "duplicidade", "tfd-sem-profissional"];

function ConsistenciaPage() {
  const { pode } = usePermissoes();
  const { compDe, compAte, cnesSel, logo, cor, periodoLabel, periodoArq } = useRelatoriosCtx();
  const { abrirPreview, previewNode } = usePreviewPdf();

  const [categoriasErro, setCategoriasErro] = useState<Set<CategoriaErro>>(new Set(TODAS_CATS));
  const [erros, setErros] = useState<ErroItem[] | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [filtroGrav, setFiltroGrav] = useState<"todas" | "erro" | "aviso">("todas");
  const [resolvendo, setResolvendo] = useState<string | null>(null);

  const toggleCat = (c: CategoriaErro) => setCategoriasErro((prev) => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const verificarErros = async () => {
    if (categoriasErro.size === 0) { toast.error("Selecione ao menos uma categoria."); return; }
    setVerificando(true);
    try { setErros(await coletarErros({ de: compDe, ate: compAte, categorias: categoriasErro, cnes: [...cnesSel] })); }
    finally { setVerificando(false); }
  };
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

  if (!pode("emitir_rel_consistencia")) return (<div><CabecalhoRelatorio titulo="Consistência da produção" icon={<AlertTriangle className="size-5 text-amber-500" />} /><SemAcesso /></div>);

  return (
    <div>
      {previewNode}
      <CabecalhoRelatorio icon={<AlertTriangle className="size-5 text-amber-500" />} titulo="Consistência da produção"
        desc={`Varre a produção do período selecionado (${periodoLabel}) e o cadastro, e lista o que precisa de correção antes de transmitir.`} />
      <BarraFiltrosBase />

      <section className={cardCls}>
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
              <select value={filtroGrav} onChange={(e) => setFiltroGrav(e.target.value as typeof filtroGrav)} className={selCls2 + " ml-auto max-w-[10rem]"}>
                <option value="todas">Todos</option><option value="erro">Só erros</option><option value="aviso">Só avisos</option>
              </select>
              <button onClick={baixarCsvErros} disabled={errosFiltrados.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"><Download className="size-4" /> CSV</button>
              <button onClick={baixarPdfErros} disabled={errosFiltrados.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"><FileText className="size-4" /> PDF</button>
            </>
          )}
        </div>
        {erros && (
          <div className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-border">
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
    </div>
  );
}
