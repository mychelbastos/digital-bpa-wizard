import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileBarChart, SlidersHorizontal } from "lucide-react";
import { usePermissoes } from "@/lib/permissoes";
import "@/components/dashboard/dashboard.css";
import "@/components/relatorios/relatorios.css";
import { carregarVinculosUsuario } from "@/lib/dashboard-producao";
import { carregarLogoOrg, carregarCorOrg } from "@/lib/org-logo";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { CNES_TFD } from "@/lib/tfd/tfd";
import { RelatoriosCtx, type RelatoriosCtxValue } from "@/components/relatorios/ctx";
import { competenciaPadrao, mesLabel } from "@/components/relatorios/comum";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — SPA Digital" }] }),
  component: RelatoriosLayout,
});

const CHAVE_FILTROS = "relatorios-filtros-base";

// Layout da Central de Relatórios: carrega o que é compartilhado (unidades, timbre, cor),
// mantém os FILTROS-BASE (período + unidade) persistidos e provê tudo às páginas via contexto.
function RelatoriosLayout() {
  const user = useAuthUser();
  const [compDe, setCompDe] = useState(competenciaPadrao());
  const [compAte, setCompAte] = useState(competenciaPadrao());
  const [cnesSel, setCnesSel] = useState<Set<string>>(new Set());
  const [cnesOpcoes, setCnesOpcoes] = useState<{ cnes: string; nome: string }[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [cor, setCor] = useState<string | null>(null);
  const [podeTfd, setPodeTfd] = useState(false);

  // Restaura os filtros-base salvos (survive reload/navegação). Tolerante a falha.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAVE_FILTROS);
      if (raw) {
        const d = JSON.parse(raw) as { compDe?: string; compAte?: string; cnes?: string[] };
        if (/^\d{6}$/.test(d.compDe ?? "")) setCompDe(d.compDe!);
        if (/^\d{6}$/.test(d.compAte ?? "")) setCompAte(d.compAte!);
        if (Array.isArray(d.cnes)) setCnesSel(new Set(d.cnes));
      }
    } catch {
      /* ignora */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_FILTROS, JSON.stringify({ compDe, compAte, cnes: [...cnesSel] }));
    } catch {
      /* ignora */
    }
  }, [compDe, compAte, cnesSel]);

  useEffect(() => {
    carregarLogoOrg().then(setLogo);
    carregarCorOrg().then(setCor);
    carregarVinculosUsuario().then(async (v) => {
      const unicos = [...new Set(v.map((x) => x.cnes).filter(Boolean))];
      setPodeTfd(unicos.some((c) => CNES_TFD.includes(c)));
      const nomes = await Promise.all(
        unicos.map(async (c) => ({ cnes: c, nome: (await buscarEstabelecimento(c)) || c })),
      );
      setCnesOpcoes(nomes);
    });
  }, []);

  const { pode } = usePermissoes();
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  const naCentral = caminho === "/relatorios" || caminho === "/relatorios/";
  const periodoLabel =
    compDe === compAte ? mesLabel(compDe) : `${mesLabel(compDe)} a ${mesLabel(compAte)}`;
  const periodoArq = compDe === compAte ? compDe : `${compDe}-${compAte}`;
  const nomeUnidade = useMemo(() => {
    const map = new Map(cnesOpcoes.map((u) => [u.cnes, u.nome]));
    return (c: string) => map.get(c) || c;
  }, [cnesOpcoes]);

  const ctx: RelatoriosCtxValue = {
    compDe,
    compAte,
    setCompDe,
    setCompAte,
    cnesSel,
    setCnesSel,
    cnesOpcoes,
    logo,
    cor,
    podeTfd,
    nomeUsuario: user?.nome ?? null,
    periodoLabel,
    periodoArq,
    nomeUnidade,
  };

  return (
    <div className="dv2 min-h-screen">
      <div className="rel-print-area mx-auto max-w-[1200px] px-4 pb-14 pt-7 sm:px-8">
        <header className="no-print mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-[#EAF1FD] text-[#1D4FB0]">
              <FileBarChart className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="m-0 text-[26px] font-bold tracking-[-0.02em] text-[#172033] sm:text-[30px]">
                Relatórios
              </h1>
              <p className="text-[13.5px] text-[#5B6B82]">
                Escolha o período e a unidade, veja o que pede atenção e gere qualquer relatório.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {logo && (
              <img
                src={logo}
                alt="Timbre da prefeitura"
                className="hidden h-11 w-auto object-contain md:block"
              />
            )}
            {naCentral && pode("emitir_rel_producao") && (
              <Link
                to="/relatorios/montar"
                className="btn inline-flex h-11 items-center gap-2 rounded-xl bg-[#15213A] px-4 text-sm font-semibold text-white hover:bg-[#1F2E4D]"
              >
                <SlidersHorizontal className="size-4" /> Montar relatório
              </Link>
            )}
          </div>
        </header>

        <RelatoriosCtx.Provider value={ctx}>
          <Outlet />
        </RelatoriosCtx.Provider>
      </div>
    </div>
  );
}
