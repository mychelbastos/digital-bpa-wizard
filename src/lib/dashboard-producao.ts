import { supabase, buscarTodasPaginado } from "@/lib/supabase";

export type TipoBpa = "BPA-C" | "BPA-I" | "RAAS";

// Uma linha de produção para a dashboard, já achatada e SEM PII do paciente pela view
// `producao_dashboard` (security_invoker => respeita a RLS de fichas de quem consulta).
// `competencia` é a de ATENDIMENTO da linha; a produção agrupa por `mes_producao`.
export interface ProducaoBpaRow {
  id: string;
  ficha_id: string;
  tipo: TipoBpa;
  competencia: string;
  mes_producao: string | null;
  cnes: string | null;
  estabelecimento_nome: string | null;
  profissional_cns: string | null;
  profissional_nome: string | null;
  cbo: string | null;
  procedimento: string;
  quantidade: number;
  servico: string | null;
  classificacao: string | null;
  cid: string | null;
  carater: string | null;
  idade: number | null;
}

// Vínculo ativo do usuário (para derivar o escopo exibido na dashboard). O acesso real
// é sempre decidido pela RLS/permissão no banco, não por isto.
export interface VinculoResumo {
  cnes: string;
  papel: string;
}

const COLS =
  "id,ficha_id,tipo,competencia,mes_producao,cnes,estabelecimento_nome,profissional_cns,profissional_nome,cbo,procedimento,quantidade,servico,classificacao,cid,carater,idade";

// Produção de um MÊS DE PRODUÇÃO, já no escopo do usuário (RLS). Sem mês, vazio.
// Pagina para pegar TODAS as linhas: a produção de um mês passa fácil de 1.000 linhas
// (teto do PostgREST por resposta) e o total é somado no cliente — truncar aqui subnotifica
// a dashboard (foi a causa do "5.990 em vez de 12.560"). Ordena por id (único e estável).
export async function carregarProducaoDashboard(mesProducao?: string): Promise<ProducaoBpaRow[]> {
  if (!supabase || !mesProducao) return [];
  try {
    return await buscarTodasPaginado<ProducaoBpaRow>((de, ate) =>
      supabase!
        .from("producao_dashboard")
        .select(COLS)
        .eq("mes_producao", mesProducao)
        .order("id", { ascending: true })
        .range(de, ate),
    );
  } catch {
    return [];
  }
}

// Produção de um mês ANTERIOR pela cópia guardada no banco (RPC dashboard_producao_mes):
// mesmas linhas e mesma regra de visibilidade da view, mas o mês só é recalculado quando alguma
// ficha dele muda — mês fechado sai na hora. Devolve null se a RPC falhar (o chamador usa a view).
export async function carregarProducaoDashboardGuardada(
  mes: string,
): Promise<ProducaoBpaRow[] | null> {
  if (!supabase || !/^\d{6}$/.test(mes)) return [];
  let falhou = false;
  const linhas = await buscarTodasPaginado<ProducaoBpaRow>(async (de, ate) => {
    const r = await supabase!
      .rpc("dashboard_producao_mes" as never, { _mes: mes } as never)
      .range(de, ate);
    if (r.error) falhou = true;
    return { data: (r.data as unknown as ProducaoBpaRow[] | null) ?? null, error: r.error };
  });
  return falhou ? null : linhas;
}

// Produção de um PERÍODO, mês a mês EM SEQUÊNCIA: meses anteriores ao movimento vêm da cópia
// guardada (rápida; só recalcula se algo do mês mudou), o mês corrente ao vivo pela view. Mesmas
// linhas de carregarProducaoDashboardPeriodo, sem disparar dezenas de consultas pesadas juntas.
export async function carregarProducaoPeriodoRapido(
  de: string,
  ate: string,
  mesAtual: string,
): Promise<ProducaoBpaRow[]> {
  if (!/^\d{6}$/.test(de) || !/^\d{6}$/.test(ate)) return [];
  const [ini, fim] = de <= ate ? [de, ate] : [ate, de];
  const meses: string[] = [];
  for (
    let a = Number(ini.slice(0, 4)), m = Number(ini.slice(4, 6));
    `${a}${String(m).padStart(2, "0")}` <= fim;
  ) {
    meses.push(`${a}${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
    if (meses.length > 36) break;
  }
  const out: ProducaoBpaRow[] = [];
  for (const m of meses) {
    const r =
      m < mesAtual
        ? ((await carregarProducaoDashboardGuardada(m)) ?? (await carregarProducaoDashboard(m)))
        : await carregarProducaoDashboard(m);
    out.push(...r);
  }
  return out;
}

// Produção de um PERÍODO de meses de produção [de, ate] (AAAAMM, inclusive). Se de==ate,
// equivale a um mês só. Para períodos grandes a produção passa fácil de dezenas de milhares
// de linhas: em vez de paginar em SÉRIE (dezenas de round-trips), conta o total e busca todas
// as páginas EM PARALELO — reduz muito o tempo de carga. Cai para o modo serial se a contagem
// falhar. Ordena por (mes_producao, id) — estável.
const TAM_PAGINA = 1000;
// `colunas`: por padrão todas; o gráfico de 6 meses pede só as que usa (carga bem menor).
export async function carregarProducaoDashboardPeriodo(
  de: string,
  ate: string,
  colunas: string = COLS,
): Promise<ProducaoBpaRow[]> {
  if (!supabase || !/^\d{6}$/.test(de) || !/^\d{6}$/.test(ate)) return [];
  const [ini, fim] = de <= ate ? [de, ate] : [ate, de]; // tolera inversão
  const base = () =>
    supabase!
      .from("producao_dashboard")
      .select(colunas as typeof COLS)
      .gte("mes_producao", ini)
      .lte("mes_producao", fim)
      .order("mes_producao", { ascending: true })
      .order("id", { ascending: true });
  try {
    const { count } = await supabase
      .from("producao_dashboard")
      .select("id", { count: "exact", head: true })
      .gte("mes_producao", ini)
      .lte("mes_producao", fim);
    if (count == null) {
      // Sem contagem: paginação serial (fallback seguro).
      return await buscarTodasPaginado<ProducaoBpaRow>(
        (lo, hi) => base().range(lo, hi),
        TAM_PAGINA,
      );
    }
    if (count === 0) return [];
    const nPaginas = Math.ceil(count / TAM_PAGINA);
    const paginas = await Promise.all(
      Array.from({ length: nPaginas }, (_, i) =>
        base().range(i * TAM_PAGINA, i * TAM_PAGINA + TAM_PAGINA - 1),
      ),
    );
    // Se ALGUMA página falhou, não devolve resultado parcial (subcontaria): cai para o serial.
    if (paginas.some((p) => p.error || !p.data)) {
      return await buscarTodasPaginado<ProducaoBpaRow>(
        (lo, hi) => base().range(lo, hi),
        TAM_PAGINA,
      );
    }
    return paginas.flatMap((p) => p.data as ProducaoBpaRow[]);
  } catch {
    return [];
  }
}

// Série mensal p/ o gráfico "Últimos 6 meses": só as colunas que o gráfico e os filtros usam.
export const COLS_SERIE =
  "id,tipo,mes_producao,cnes,profissional_cns,profissional_nome,cbo,procedimento,quantidade";
// Série JÁ SOMADA no banco (RPC dashboard_serie_mensal, security invoker → mesma visibilidade
// da view; calcula na hora = tempo real). ~400 linhas numa consulta, em vez de milhares.
// Devolve null se a RPC falhar (o chamador cai no modo mês a mês).
export async function carregarSerieAgregada(
  de: string,
  ate: string,
): Promise<ProducaoBpaRow[] | null> {
  if (!supabase || !/^\d{6}$/.test(de) || !/^\d{6}$/.test(ate)) return [];
  try {
    const { data, error } = await supabase.rpc(
      "dashboard_serie_mensal" as never,
      { _de: de, _ate: ate } as never,
    );
    if (error || !Array.isArray(data)) return null;
    return (data as Record<string, unknown>[]).map(
      (r, i) =>
        ({
          id: `s${i}`,
          ficha_id: null,
          tipo: r.tipo as TipoBpa,
          competencia: null,
          mes_producao: (r.mes_producao as string) ?? null,
          cnes: (r.cnes as string) ?? null,
          estabelecimento_nome: null,
          profissional_cns: (r.profissional_cns as string) ?? null,
          profissional_nome: (r.profissional_nome as string) ?? null,
          cbo: (r.cbo as string) ?? null,
          procedimento: (r.procedimento as string) ?? "",
          quantidade: Number(r.quantidade) || 0,
          servico: null,
          classificacao: null,
          cid: null,
          carater: null,
          idade: null,
        }) as unknown as ProducaoBpaRow,
    );
  } catch {
    return null;
  }
}

// UM mês por vez (filtro de igualdade): no banco, cada página do mês sai em ~0,1–0,25 s,
// contra ~1 s por página quando se filtra o PERÍODO (between) — medido em 27/11/2026.
export async function carregarMesSerie(mes: string): Promise<ProducaoBpaRow[]> {
  if (!supabase || !/^\d{6}$/.test(mes)) return [];
  return buscarTodasPaginado<ProducaoBpaRow>((de, ate) =>
    supabase!
      .from("producao_dashboard")
      .select(COLS_SERIE as typeof COLS)
      .eq("mes_producao", mes)
      .order("id", { ascending: true })
      .range(de, ate),
  );
}

// Nome da organização do usuário (linha acima do título da dashboard). Só quando a pessoa
// enxerga UMA organização (o dono do sistema vê várias → não mostra). Nunca lança.
export async function carregarNomeOrganizacao(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("organizacoes").select("nome").limit(2);
    if (error || !data || data.length !== 1) return null;
    return ((data[0] as { nome: string | null }).nome ?? "").trim() || null;
  } catch {
    return null;
  }
}

// Vínculos ativos do usuário logado (RLS: a pessoa vê os próprios).
export async function carregarVinculosUsuario(): Promise<VinculoResumo[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from("vinculos").select("cnes, papel").is("fim", null);
    return error || !data ? [] : (data as VinculoResumo[]);
  } catch {
    return [];
  }
}

// Descrição oficial (CID-10 / SIGTAP) de vários CIDs de uma vez. Mapa código→descrição;
// códigos ausentes na tabela ficam de fora (o dashboard cai no código puro). Nunca lança.
export async function carregarDescricoesCid(codigos: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(codigos.filter((c) => c && c.length >= 3))];
  if (!supabase || unicos.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from("cid_sigtap")
      .select("codigo, nome")
      .in("codigo", unicos);
    if (error || !data) return {};
    const mapa: Record<string, string> = {};
    for (const row of data as { codigo: string; nome: string }[]) {
      if (!mapa[row.codigo]) mapa[row.codigo] = row.nome;
    }
    return mapa;
  } catch {
    return {};
  }
}

// Nome oficial (SIGTAP) de vários procedimentos de uma vez. Retorna um mapa
// código→nome; códigos não encontrados simplesmente ficam de fora. Nunca lança.
export async function carregarNomesProcedimentos(
  codigos: string[],
): Promise<Record<string, string>> {
  const unicos = [...new Set(codigos.filter((c) => c && c.length === 10))];
  if (!supabase || unicos.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from("procedimentos_sigtap")
      .select("codigo, nome")
      .in("codigo", unicos);
    if (error || !data) return {};
    const mapa: Record<string, string> = {};
    for (const row of data as { codigo: string; nome: string }[]) {
      if (!mapa[row.codigo]) mapa[row.codigo] = row.nome;
    }
    return mapa;
  } catch {
    return {};
  }
}

// Descrição (ocupação/CBO) de vários códigos de uma vez, da tabela oficial do SIGTAP
// (`ocupacoes_sigtap`, tb_ocupacao). Mapa código→descrição; códigos ausentes ficam de fora
// (o dashboard cai no código puro). Nunca lança.
export async function carregarDescricoesCbo(codigos: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(codigos.filter((c) => c && c.length >= 4))];
  if (!supabase || unicos.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from("ocupacoes_sigtap")
      .select("codigo, nome")
      .in("codigo", unicos);
    if (error || !data) return {};
    const mapa: Record<string, string> = {};
    for (const row of data as { codigo: string; nome: string }[]) {
      if (!mapa[row.codigo]) mapa[row.codigo] = row.nome;
    }
    return mapa;
  } catch {
    return {};
  }
}
