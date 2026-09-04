import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileBarChart } from "lucide-react";
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
    } catch { /* ignora */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(CHAVE_FILTROS, JSON.stringify({ compDe, compAte, cnes: [...cnesSel] })); } catch { /* ignora */ }
  }, [compDe, compAte, cnesSel]);

  useEffect(() => {
    carregarLogoOrg().then(setLogo);
    carregarCorOrg().then(setCor);
    carregarVinculosUsuario().then(async (v) => {
      const unicos = [...new Set(v.map((x) => x.cnes).filter(Boolean))];
      setPodeTfd(unicos.some((c) => CNES_TFD.includes(c)));
      const nomes = await Promise.all(unicos.map(async (c) => ({ cnes: c, nome: (await buscarEstabelecimento(c)) || c })));
      setCnesOpcoes(nomes);
    });
  }, []);

  const periodoLabel = compDe === compAte ? mesLabel(compDe) : `${mesLabel(compDe)} a ${mesLabel(compAte)}`;
  const periodoArq = compDe === compAte ? compDe : `${compDe}-${compAte}`;
  const nomeUnidade = useMemo(() => {
    const map = new Map(cnesOpcoes.map((u) => [u.cnes, u.nome]));
    return (c: string) => map.get(c) || c;
  }, [cnesOpcoes]);

  const ctx: RelatoriosCtxValue = {
    compDe, compAte, setCompDe, setCompAte, cnesSel, setCnesSel, cnesOpcoes,
    logo, cor, podeTfd, nomeUsuario: user?.nome ?? null, periodoLabel, periodoArq, nomeUnidade,
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileBarChart className="size-5" /></span>
            <div>
              <h1 className="text-xl font-bold text-foreground">Relatórios</h1>
              <p className="text-sm text-muted-foreground">Central de relatórios — escolha um relatório e gere na página dedicada.</p>
            </div>
          </div>
          {logo && <img src={logo} alt="Timbre" className="hidden h-12 w-auto object-contain sm:block" />}
        </header>

        <RelatoriosCtx.Provider value={ctx}>
          <Outlet />
        </RelatoriosCtx.Provider>
      </div>
    </div>
  );
}
