import { createFileRoute } from "@tanstack/react-router";
import { FileText, AlertTriangle, UserX, FileSpreadsheet, Ambulance, Users, FileBarChart } from "lucide-react";
import { usePermissoes } from "@/lib/permissoes";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";
import { RelatorioCard } from "@/components/relatorios/comum";

export const Route = createFileRoute("/relatorios/")({
  component: CatalogoRelatorios,
});

// Catálogo: todos os relatórios agrupados por finalidade. Cada card navega para a página
// dedicada. Sem permissão de emissão → cadeado (não navega). TFD só aparece com vínculo de TFD.
function CatalogoRelatorios() {
  const { pode } = usePermissoes();
  const { podeTfd } = useRelatoriosCtx();

  const tituloGrupo = "mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground first:mt-0";
  const grid = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div>
      <h2 className={tituloGrupo}>Produção &amp; envio</h2>
      <div className={grid}>
        <RelatorioCard icon={<FileText className="size-5" />} titulo="Produção (BPA-I / BPA-C / RAAS)"
          desc="Filtre por tipo, unidade, profissional, procedimento, CID e caráter. Gera CSV e PDF (timbre) e imprime fichas."
          to="/relatorios/producao" bloqueado={!pode("emitir_rel_producao")} />
        <RelatorioCard icon={<AlertTriangle className="size-5" />} titulo="Consistência da produção"
          desc="Varre a produção do período e o cadastro, listando o que precisa de correção antes de transmitir."
          to="/relatorios/consistencia" bloqueado={!pode("emitir_rel_consistencia")} />
        <RelatorioCard icon={<UserX className="size-5" />} titulo="Profissionais sem produção"
          desc="Profissionais assistenciais que não lançaram produção no período. Gera CSV e PDF (timbre)."
          to="/relatorios/inativos" bloqueado={!pode("emitir_rel_inativos")} />
        <RelatorioCard icon={<FileSpreadsheet className="size-5" />} titulo="FPO × Produção"
          desc="Orçamento vs. produção por unidade e competência. Gera PDF (timbre)."
          to="/relatorios/fpo" bloqueado={!pode("emitir_rel_fpo")} />
      </div>

      {podeTfd && (
        <>
          <h2 className={tituloGrupo}>TFD</h2>
          <div className={grid}>
            <RelatorioCard icon={<Ambulance className="size-5" />} titulo="TFD"
              desc="Por unidade e faixa de competência, com agrupamentos. Gera CSV e PDF (timbre)."
              to="/relatorios/tfd" bloqueado={!pode("emitir_rel_tfd")} />
          </div>
        </>
      )}

      <h2 className={tituloGrupo}>Perfil &amp; epidemiologia</h2>
      <div className={grid}>
        <RelatorioCard icon={<Users className="size-5" />} titulo="Perfil de pacientes"
          desc="Faixa etária, sexo, raça/cor, situação de rua + CID e procedimentos. Agregado e anonimizado (LGPD)."
          to="/relatorios/perfil" bloqueado={!pode("emitir_rel_perfil")} />
        <RelatorioCard icon={<Users className="size-5" />} titulo="Relação de pacientes"
          desc="Lista nominal (com nome) — Geral, TFD, RAAS ou por procedimento. Uso interno / conferência."
          to="/relatorios/relacao" bloqueado={!pode("emitir_rel_perfil")} />
        <RelatorioCard icon={<FileBarChart className="size-5" />} titulo="Tabulação por procedimento"
          desc="Procedimento × faixa etária × sexo × raça/cor × bairro. Só números (anonimizado)."
          to="/relatorios/tabulacao" bloqueado={!pode("emitir_rel_perfil")} />
      </div>
    </div>
  );
}
