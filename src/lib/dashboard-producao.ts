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

// Produção de um PERÍODO de meses de produção [de, ate] (AAAAMM, inclusive). Se de==ate,
// equivale a um mês só. Para períodos grandes a produção passa fácil de dezenas de milhares
// de linhas: em vez de paginar em SÉRIE (dezenas de round-trips), conta o total e busca todas
// as páginas EM PARALELO — reduz muito o tempo de carga. Cai para o modo serial se a contagem
// falhar. Ordena por (mes_producao, id) — estável.
const TAM_PAGINA = 1000;
export async function carregarProducaoDashboardPeriodo(de: string, ate: string): Promise<ProducaoBpaRow[]> {
  if (!supabase || !/^\d{6}$/.test(de) || !/^\d{6}$/.test(ate)) return [];
  const [ini, fim] = de <= ate ? [de, ate] : [ate, de]; // tolera inversão
  const base = () => supabase!.from("producao_dashboard").select(COLS).gte("mes_producao", ini).lte("mes_producao", fim)
    .order("mes_producao", { ascending: true }).order("id", { ascending: true });
  try {
    const { count } = await supabase.from("producao_dashboard").select("id", { count: "exact", head: true })
      .gte("mes_producao", ini).lte("mes_producao", fim);
    if (count == null) {
      // Sem contagem: paginação serial (fallback seguro).
      return await buscarTodasPaginado<ProducaoBpaRow>((lo, hi) => base().range(lo, hi), TAM_PAGINA);
    }
    if (count === 0) return [];
    const nPaginas = Math.ceil(count / TAM_PAGINA);
    const paginas = await Promise.all(
      Array.from({ length: nPaginas }, (_, i) => base().range(i * TAM_PAGINA, i * TAM_PAGINA + TAM_PAGINA - 1)),
    );
    return paginas.flatMap((p) => (p.data as ProducaoBpaRow[] | null) ?? []);
  } catch {
    return [];
  }
}

// Vínculos ativos do usuário logado (RLS: a pessoa vê os próprios).
export async function carregarVinculosUsuario(): Promise<VinculoResumo[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("vinculos")
      .select("cnes, papel")
      .is("fim", null);
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
export async function carregarNomesProcedimentos(codigos: string[]): Promise<Record<string, string>> {
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
