// Dashboard v2 (rota /) — orquestrador dos dados. A lógica de carga é a mesma de antes
// (token contra carga obsoleta, paginação, nomes, chaves de profissional/unidade, filtros
// dependentes); o visual está em src/components/dashboard/. Redesign 11/2026.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import {
  carregarVinculosUsuario,
  carregarNomesProcedimentos,
  carregarDescricoesCid,
  carregarDescricoesCbo,
  carregarProducaoDashboard,
  carregarProducaoDashboardGuardada,
  carregarMesSerie,
  carregarSerieAgregada,
  carregarNomeOrganizacao,
  type VinculoResumo,
  type ProducaoBpaRow,
} from "@/lib/dashboard-producao";
import { carregarResumoFpo, type FpoResumoUnidade } from "@/lib/fpo/fpo";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { carregarLogoOrg, carregarCorOrg } from "@/lib/org-logo";
import { competenciaPadrao } from "@/lib/faturamento";
import "@/components/dashboard/dashboard.css";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { FiltrosBar } from "@/components/dashboard/FiltrosBar";
import { ResumoMes } from "@/components/dashboard/ResumoMes";
import { EvolucaoChart, type PontoMes } from "@/components/dashboard/EvolucaoChart";
import { FpoPorUnidade } from "@/components/dashboard/FpoPorUnidade";
import { ProducaoPorUnidade } from "@/components/dashboard/ProducaoPorUnidade";
import { TopProcedimentos } from "@/components/dashboard/TopProcedimentos";
import { ProfissionaisLista } from "@/components/dashboard/ProfissionaisLista";
import { ProcedimentosModal, ProfissionalDetalhe } from "@/components/dashboard/detalhes";
import {
  agrupar,
  chaveProfissional,
  mesCurtoMin,
  mesLabel,
  nomeOuCodigo,
  somarMes,
} from "@/components/dashboard/util";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard SPA Digital" },
      {
        name: "description",
        content:
          "Dashboard de produção BPA-C, BPA-I e RAAS com filtros por unidade, profissional, procedimento e competência.",
      },
    ],
  }),
  component: Home,
});

// Cache em memória da série de 6 meses, por período (não recarrega ao trocar filtros).

function Home() {
  const [rows, setRows] = useState<ProducaoBpaRow[]>([]);
  const [vinculos, setVinculos] = useState<VinculoResumo[]>([]);
  const [competencia, setCompetencia] = useState(competenciaPadrao());
  const [cnes, setCnes] = useState("todos");
  const [profissional, setProfissional] = useState("todos");
  const [procedimento, setProcedimento] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [nomesProc, setNomesProc] = useState<Record<string, string>>({});
  const [nomesCid, setNomesCid] = useState<Record<string, string>>({});
  const [nomesCbo, setNomesCbo] = useState<Record<string, string>>({});
  const [profDetalhe, setProfDetalhe] = useState<string | null>(null);
  const [procModalOpen, setProcModalOpen] = useState(false);
  const [resumoFpo, setResumoFpo] = useState<FpoResumoUnidade[]>([]);
  const [fpoCarregando, setFpoCarregando] = useState(true);
  const [logoOrg, setLogoOrg] = useState<string | null>(null);
  const [corOrg, setCorOrg] = useState<string | null>(null);
  const [orgNome, setOrgNome] = useState<string | null>(null);
  const [nomesEstabFpo, setNomesEstabFpo] = useState<Record<string, string>>({});
  // Nome do estabelecimento pelo CADASTRO (fallback quando a ficha não traz o nome embutido —
  // ex.: RAAS importado, onde `estabelecimentoNome` vem vazio). Resolve pela tabela `estabelecimentos`.
  const [nomesEstabCad, setNomesEstabCad] = useState<Record<string, string>>({});
  // Série dos últimos 6 meses (gráfico) — carregada DEPOIS da carga principal.
  const [serieErro, setSerieErro] = useState(false);
  const maxComp = competenciaPadrao();

  // Token da carga mais recente: a produção é paginada (várias idas ao banco), então uma
  // carga antiga (ex.: mês anterior, mais lenta) pode responder DEPOIS da nova e sobrescrever
  // os dados do mês recém-selecionado. Só aplicamos o resultado se ainda for a carga atual.
  const cargaRef = useRef(0);
  const carregar = async () => {
    const token = ++cargaRef.current;
    setLoading(true);
    setErroCarga(false);
    try {
      const [vincs, producao] = await Promise.all([
        carregarVinculosUsuario(),
        // Mês ANTERIOR ao de faturamento: cópia guardada (só recalcula se algo do mês mudou).
        // Mês atual: ao vivo pela view. Se a cópia falhar, cai na view.
        competencia < competenciaPadrao()
          ? carregarProducaoDashboardGuardada(competencia).then(
              (r) => r ?? carregarProducaoDashboard(competencia),
            )
          : carregarProducaoDashboard(competencia),
      ]);
      if (cargaRef.current !== token) return; // carga obsoleta — ignora
      setVinculos(vincs);
      setRows(producao);
      const [np, ncid, ncbo] = await Promise.all([
        carregarNomesProcedimentos(producao.map((r) => r.procedimento)),
        carregarDescricoesCid(producao.map((r) => r.cid).filter((c): c is string => !!c)),
        carregarDescricoesCbo(producao.map((r) => r.cbo).filter((c): c is string => !!c)),
      ]);
      if (cargaRef.current !== token) return;
      setNomesProc(np);
      setNomesCid(ncid);
      setNomesCbo(ncbo);
      setAtualizadoEm(new Date());
    } catch {
      if (cargaRef.current === token) setErroCarga(true);
    } finally {
      if (cargaRef.current === token) setLoading(false);
    }
  };

  const nomeProc = (codigo: string) => nomesProc[codigo] || null;
  // Descrição do CBO em MAIÚSCULAS, p/ casar com os nomes dos profissionais (também
  // gravados em maiúsculas) e manter o design uniforme no ranking.
  const nomeCbo = (cbo: string | null) =>
    cbo ? (nomesCbo[cbo] ? nomesCbo[cbo].toUpperCase() : null) : null;
  // Rótulo do profissional no ranking/filtros: nome (BPA-I/BPA-C v3) → descrição do CBO
  // (ocupação, p/ fichas antigas sem nome) → CNS → código do CBO.
  const rotuloProfissional = (r: ProducaoBpaRow) =>
    nomeOuCodigo(r.profissional_nome, nomeCbo(r.cbo) || r.profissional_cns || r.cbo);
  // CID: "código — descrição" quando existe na tabela CID-10; senão só o código.
  const rotuloCid = (cid: string | null) => {
    if (!cid) return "Sem CID";
    const d = nomesCid[cid];
    return d ? `${cid} — ${d}` : cid;
  };

  useEffect(() => {
    carregar();
  }, [competencia]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    carregarLogoOrg().then(setLogoOrg);
    carregarCorOrg().then(setCorOrg);
    carregarNomeOrganizacao().then(setOrgNome);
  }, []);
  // Ao TROCAR de mês, limpa as linhas na hora (o Atualizar não passa por aqui): evita exibir
  // o total do mês anterior sob o rótulo do mês novo enquanto a nova carga não chega.
  useEffect(() => {
    setRows([]);
    setCnes("todos");
    setProfissional("todos");
    setProcedimento("todos");
  }, [competencia]);
  // Ao trocar de unidade, zera Profissional/Procedimento: as opções passam a ser as daquele
  // CNES, então uma seleção anterior poderia não existir mais (e zeraria os dados).
  useEffect(() => {
    setProfissional("todos");
    setProcedimento("todos");
  }, [cnes]);

  // Série de 6 meses: só depois da carga principal (não atrasa os números do topo). O mês
  // atual reaproveita `rows` (o mesmo dado do topo); os 5 anteriores vêm JÁ SOMADOS do banco
  // numa consulta (tempo real: recalculada a cada abertura, Atualizar ou troca de mês; trocar
  // filtro não rebusca). Se a consulta somada falhar, cai no modo mês a mês, em sequência.
  const deSerie = somarMes(competencia, -5);
  const mesesAnteriores = useMemo(
    () => Array.from({ length: 5 }, (_, i) => somarMes(deSerie, i)),
    [deSerie],
  );
  const [serieAnt, setSerieAnt] = useState<ProducaoBpaRow[] | null>(null);
  const serieRef = useRef(0);
  const carregarSerie = async () => {
    const token = ++serieRef.current;
    setSerieErro(false);
    setSerieAnt(null);
    try {
      let r = await carregarSerieAgregada(
        mesesAnteriores[0],
        mesesAnteriores[mesesAnteriores.length - 1],
      );
      if (r === null) {
        r = [];
        for (const m of mesesAnteriores) {
          r.push(...(await carregarMesSerie(m)));
          if (serieRef.current !== token) return;
        }
      }
      if (serieRef.current !== token) return;
      setSerieAnt(r);
    } catch {
      if (serieRef.current === token) setSerieErro(true);
    }
  };
  // Recarrega a série sempre que a carga principal termina (abertura, Atualizar ou troca de mês).
  useEffect(() => {
    if (loading) return;
    void carregarSerie();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deSerie, loading]);
  const serie = useMemo(
    () => (serieAnt === null ? null : [...serieAnt, ...rows]),
    [serieAnt, rows],
  );
  const atualizar = () => {
    void carregar();
  };

  // Busca no cadastro o nome das unidades cujas linhas vieram SEM nome embutido (ex.: RAAS
  // importado). Só busca as que ainda não temos, para não repetir requisições.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const faltando = [
        ...new Set(
          rows
            .filter((r) => r.cnes && !r.estabelecimento_nome?.trim())
            .map((r) => r.cnes as string),
        ),
      ].filter((c) => !nomesEstabCad[c]);
      if (faltando.length === 0) return;
      const achados = await Promise.all(
        faltando.map(async (c) => [c, (await buscarEstabelecimento(c)) || ""] as const),
      );
      if (vivo)
        setNomesEstabCad((prev) => ({
          ...prev,
          ...Object.fromEntries(achados.filter(([, n]) => n)),
        }));
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Rótulo da unidade: nome embutido na ficha → nome do cadastro → código do CNES.
  const labelUnidade = useMemo(
    () => (r: ProducaoBpaRow) =>
      r.estabelecimento_nome?.trim() || nomesEstabCad[r.cnes || ""] || nomeOuCodigo(null, r.cnes),
    [nomesEstabCad],
  );

  const unidades = useMemo(
    () => agrupar(rows, (r) => r.cnes || "sem-cnes", labelUnidade),
    [rows, labelUnidade],
  );
  // Escopo das opções de Profissional/Procedimento: quando uma unidade está selecionada, só
  // as linhas dela — assim o filtro de profissional lista só quem atende naquele CNES.
  const rowsDaUnidade = useMemo(
    () => (cnes === "todos" ? rows : rows.filter((r) => (r.cnes || "sem-cnes") === cnes)),
    [rows, cnes],
  );

  const profissionais = useMemo(
    () => agrupar(rowsDaUnidade, (r) => chaveProfissional(r), rotuloProfissional),
    [rowsDaUnidade, nomesCbo],
  );
  // Opções do filtro de Procedimento: NOME (código), em ordem CRESCENTE de código.
  const procedimentos = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rowsDaUnidade)
      if (r.procedimento && !map.has(r.procedimento))
        map.set(r.procedimento, nomeProc(r.procedimento) || r.procedimento);
    return [...map.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsDaUnidade, nomesProc]);

  const passaFiltros = (
    r: Pick<
      ProducaoBpaRow,
      "cnes" | "procedimento" | "profissional_cns" | "profissional_nome" | "cbo"
    >,
  ) =>
    (cnes === "todos" || (r.cnes || "sem-cnes") === cnes) &&
    (profissional === "todos" || chaveProfissional(r) === profissional) &&
    (procedimento === "todos" || r.procedimento === procedimento);

  const filtradas = useMemo(
    () => rows.filter(passaFiltros),
    [rows, cnes, profissional, procedimento],
  );

  const kpis = useMemo(() => {
    const total = filtradas.reduce((s, r) => s + r.quantidade, 0);
    const bpaC = filtradas.filter((r) => r.tipo === "BPA-C").reduce((s, r) => s + r.quantidade, 0);
    const bpaI = filtradas.filter((r) => r.tipo === "BPA-I").reduce((s, r) => s + r.quantidade, 0);
    const raas = filtradas.filter((r) => r.tipo === "RAAS").reduce((s, r) => s + r.quantidade, 0);
    const unidadesAtivas = new Set(filtradas.map((r) => r.cnes).filter(Boolean)).size;
    const profissionaisAtivos = new Set(
      filtradas.map((r) => r.profissional_cns || r.profissional_nome || r.cbo).filter(Boolean),
    ).size;
    return { total, bpaC, bpaI, raas, unidadesAtivas, profissionaisAtivos };
  }, [filtradas]);

  const topUnidades = useMemo(
    () => agrupar(filtradas, (r) => r.cnes || "sem-cnes", labelUnidade).slice(0, 8),
    [filtradas, labelUnidade],
  );
  // Todos os profissionais do período (mesma chave do KPI). O card mostra 5 e expande.

  const topProfissionais = useMemo(
    () => agrupar(filtradas, (r) => chaveProfissional(r), rotuloProfissional),
    [filtradas, nomesCbo],
  );
  const ocupacaoPorChave = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of filtradas) {
      const k = chaveProfissional(r);
      if (!m.has(k) || !m.get(k)) m.set(k, nomeCbo(r.cbo));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas, nomesCbo]);
  // Lista COMPLETA de procedimentos; o card mostra o top 5 e o modal, todos.

  const procedimentosFull = useMemo(
    () =>
      agrupar(
        filtradas,
        (r) => r.procedimento,
        (r) => nomeProc(r.procedimento) || r.procedimento,
      ),
    [filtradas, nomesProc],
  );

  // FPO × Produção: escopo = CNES vinculados (ou a unidade filtrada), no mês selecionado.
  const cnesEscopo = useMemo(
    () => (cnes === "todos" ? [...new Set(vinculos.map((v) => v.cnes).filter(Boolean))] : [cnes]),
    [vinculos, cnes],
  );
  useEffect(() => {
    let vivo = true;
    setFpoCarregando(true);
    // Espera a carga principal e REAPROVEITA as linhas do mês (não consulta a view de novo).
    if (loading)
      return () => {
        vivo = false;
      };
    (async () => {
      const r = await carregarResumoFpo(cnesEscopo, competencia, rows);
      if (!vivo) return;
      setResumoFpo(r);
      setFpoCarregando(false);
      // Unidades com teto mas sem produção no mês não estão em `rows` (nome desconhecido):
      // busca o nome do cadastro para não exibir só o código.
      const nomes = await Promise.all(
        r
          // Só as que aparecem no card (com produção) — evita buscas à toa.
          .filter((u) => u.produzidoQtd > 0 || u.produzidoForaQtd > 0 || u.produzidoRS > 0)
          .map(async (u) => [u.cnes, (await buscarEstabelecimento(u.cnes)) || ""] as const),
      );
      if (vivo)
        setNomesEstabFpo((prev) => ({
          ...prev,
          ...Object.fromEntries(nomes.filter(([, n]) => n)),
        }));
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnesEscopo, competencia, loading]);
  const nomeCnes = useMemo(() => {
    const m = new Map(unidades.map((u) => [u.key, u.name]));
    return (c: string) => m.get(c) || nomesEstabFpo[c] || c;
  }, [unidades, nomesEstabFpo]);
  const fpoTotal = useMemo(
    () =>
      resumoFpo.length === 0
        ? null
        : resumoFpo.reduce(
            (a, u) => ({ tetoRS: a.tetoRS + u.tetoRS, prodRS: a.prodRS + u.produzidoRS }),
            { tetoRS: 0, prodRS: 0 },
          ),
    [resumoFpo],
  );

  // Série filtrada → pontos por mês × tipo (mesmos filtros da dashboard).
  const pontos: PontoMes[] = useMemo(() => {
    const base = Array.from({ length: 6 }, (_, i) => somarMes(deSerie, i));
    const m = new Map(base.map((c) => [c, { comp: c, c: 0, i: 0, r: 0 }]));
    for (const r of serie ?? []) {
      if (!passaFiltros(r)) continue;
      const p = m.get(r.mes_producao ?? "");
      if (!p) continue;
      if (r.tipo === "BPA-C") p.c += r.quantidade;
      else if (r.tipo === "BPA-I") p.i += r.quantidade;
      else p.r += r.quantidade;
    }
    return base.map((c) => m.get(c)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, deSerie, cnes, profissional, procedimento]);
  // Variação contra o mês anterior (da série). Sem dado do mês anterior → sem selo.
  const variacao = useMemo(() => {
    if (!serie || loading) return null;
    const ant = pontos[pontos.length - 2];
    const totAnt = ant ? ant.c + ant.i + ant.r : 0;
    if (!ant || totAnt <= 0) return null;
    return { pct: (kpis.total - totAnt) / totAnt, mesAnterior: mesCurtoMin(ant.comp) };
  }, [serie, loading, pontos, kpis.total]);

  const status = loading
    ? "Carregando produção…"
    : atualizadoEm
      ? `Atualizado às ${atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
      : "";
  const semProducao = !loading && !erroCarga && filtradas.length === 0;

  return (
    <div className="dv2 min-h-screen">
      <main className="box-border px-4 pb-14 pt-7 sm:px-10">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-5">
          <DashboardHeader
            orgNome={orgNome}
            competencia={competencia}
            maxComp={maxComp}
            carregando={loading}
            onCompetencia={(c) => setCompetencia(c > maxComp ? maxComp : c)}
            onAtualizar={atualizar}
          />
          <FiltrosBar
            cnes={cnes}
            profissional={profissional}
            procedimento={procedimento}
            unidades={unidades}
            profissionais={profissionais}
            procedimentos={procedimentos}
            onCnes={setCnes}
            onProfissional={setProfissional}
            onProcedimento={setProcedimento}
            status={status}
          />

          {erroCarga && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F3D3CF] bg-[#FDF3F2] px-5 py-3 text-[13.5px] text-[#A3241A]"
            >
              Não foi possível carregar a produção agora.
              <button
                type="button"
                onClick={atualizar}
                className="btn inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#F3D3CF] bg-white px-4 font-semibold"
              >
                <RefreshCw className="size-4" /> Tentar de novo
              </button>
            </div>
          )}

          <ResumoMes
            carregando={loading}
            total={kpis.total}
            porTipo={{ c: kpis.bpaC, i: kpis.bpaI, r: kpis.raas }}
            variacao={semProducao ? null : variacao}
            unidadesAtivas={kpis.unidadesAtivas}
            unidadesTotal={cnesEscopo.length}
            profissionaisAtivos={kpis.profissionaisAtivos}
            fpo={fpoTotal}
            competencia={competencia}
          />

          <div className="flex flex-wrap gap-5">
            <EvolucaoChart
              meses={pontos}
              carregando={serie === null && !serieErro}
              erro={serieErro}
              selecionado={competencia}
              onSelecionar={(c) => setCompetencia(c > maxComp ? maxComp : c)}
              onTentarDeNovo={() => void carregarSerie()}
            />
            <FpoPorUnidade
              resumo={resumoFpo}
              nomeCnes={nomeCnes}
              competencia={competencia}
              carregando={fpoCarregando}
            />
          </div>

          {semProducao ? (
            <section
              className="rv rounded-[18px] border border-[#E3E8EF] bg-white p-14 text-center"
              style={{ animationDelay: "380ms" }}
            >
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#EAF1FD] text-[#1D4FB0]">
                <Activity className="size-6" />
              </div>
              <h2 className="mt-4 text-base font-semibold">
                Ainda não há produção registrada em {mesLabel(competencia)}.
              </h2>
              <p className="mt-1 text-sm text-[#5B6B82]">
                A dashboard preenche com as fichas BPA-C/BPA-I/RAAS salvas neste mês de produção.
              </p>
            </section>
          ) : (
            <div className="flex flex-wrap gap-5">
              <ProducaoPorUnidade unidades={topUnidades} carregando={loading} />
              <TopProcedimentos
                itens={procedimentosFull.slice(0, 5)}
                total={procedimentosFull.length}
                carregando={loading}
                onVerTodos={() => setProcModalOpen(true)}
              />
              <ProfissionaisLista
                itens={topProfissionais}
                ocupacao={(k) => ocupacaoPorChave.get(k) ?? null}
                carregando={loading}
                onAbrir={setProfDetalhe}
              />
            </div>
          )}
        </div>

        {profDetalhe && (
          <ProfissionalDetalhe
            chave={profDetalhe}
            rows={filtradas.filter((r) => chaveProfissional(r) === profDetalhe)}
            nomeProc={nomeProc}
            nomeCbo={nomeCbo}
            rotuloCid={rotuloCid}
            competenciaLabel={mesLabel(competencia)}
            logo={logoOrg}
            cor={corOrg}
            onClose={() => setProfDetalhe(null)}
          />
        )}

        {procModalOpen && (
          <ProcedimentosModal rows={procedimentosFull} onClose={() => setProcModalOpen(false)} />
        )}
      </main>
    </div>
  );
}
