import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Users, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissoes } from "@/lib/permissoes";
import { carregarProducaoDashboardPeriodo, carregarNomesProcedimentos, carregarDescricoesCid } from "@/lib/dashboard-producao";
import { carregarPerfilCadastro, carregarPerfilAtendidos, agregarCid, agregarProcedimentos, agregarPorUnidade } from "@/lib/relatorios/perfil";
import { construirPdfPerfil } from "@/lib/relatorios/perfil-pdf";
import { usePreviewPdf } from "@/components/relatorios/PreviewPdfModal";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";
import { CabecalhoRelatorio, SemAcesso, cardCls, selCls2, lblCls2, mesLabel, competenciaAtual, ultimosMesesMod } from "@/components/relatorios/comum";

export const Route = createFileRoute("/relatorios/perfil")({
  component: PerfilPage,
});

const SECOES_PERFIL = [
  { key: "faixaSexo", grupo: "Cadastro", label: "Faixa etária × Sexo" },
  { key: "raca", grupo: "Cadastro", label: "Raça/Cor" },
  { key: "situacaoRua", grupo: "Cadastro", label: "Situação de rua" },
  { key: "cid", grupo: "Clínico (período)", label: "CID mais frequentes" },
  { key: "proc", grupo: "Clínico (período)", label: "Procedimentos mais realizados" },
  { key: "porUnidade", grupo: "Clínico (período)", label: "Produção por unidade" },
] as const;
type SecaoPerfil = (typeof SECOES_PERFIL)[number]["key"];

function PerfilPage() {
  const { pode } = usePermissoes();
  const { cnesOpcoes: unidades, logo, cor, nomeUnidade } = useRelatoriosCtx();
  const { abrirPreview, previewNode } = usePreviewPdf();
  const [compDe, setCompDe] = useState(competenciaAtual());
  const [compAte, setCompAte] = useState(competenciaAtual());
  const [cnes, setCnes] = useState("todas");
  const [tipo, setTipo] = useState<"todos" | "BPA-I" | "BPA-C" | "RAAS">("todos");
  const [baseCad, setBaseCad] = useState<"org" | "atendidos">("org");
  const [secoes, setSecoes] = useState<Set<SecaoPerfil>>(new Set(SECOES_PERFIL.map((s) => s.key)));
  const [gerando, setGerando] = useState(false);
  const K = 5;
  const clinicoSelecionado = secoes.has("cid") || secoes.has("proc") || secoes.has("porUnidade");
  const cadastroSelecionado = secoes.has("faixaSexo") || secoes.has("raca") || secoes.has("situacaoRua");
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
      const prod = prodBruta.filter((r) => (cnes === "todas" || r.cnes === cnes) && (tipo === "todos" || r.tipo === tipo));
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

  if (!pode("emitir_rel_perfil")) return (<div><CabecalhoRelatorio titulo="Perfil de pacientes" icon={<Users className="size-5 text-primary" />} /><SemAcesso /></div>);

  return (
    <div>
      {previewNode}
      <CabecalhoRelatorio icon={<Users className="size-5 text-primary" />} titulo="Perfil de pacientes (agregado · anonimizado)"
        desc="Escolha as informações e os filtros. Relatório de uso interno / gestão em saúde, com valores reais." />
      <section className={cardCls}>
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

        {mostrarFiltros && (
          <p className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
            {baseCad === "atendidos"
              ? <>Os filtros valem para as tabelas clínicas <strong>e</strong> para o cadastro (base “atendidos”). Atendidos consideram só <strong>BPA-I e RAAS</strong> — o BPA-C não registra paciente.</>
              : <>Os filtros valem só para as tabelas <strong>clínicas</strong>. O cadastro está na base “toda a organização”.</>}
          </p>
        )}
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
      </section>
    </div>
  );
}
