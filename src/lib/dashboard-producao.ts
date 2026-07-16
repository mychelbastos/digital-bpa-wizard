import { supabase } from "@/lib/supabase";

export type TipoBpa = "BPA-C" | "BPA-I";

// Uma linha de produção para a dashboard, já achatada e SEM PII do paciente pela view
// `producao_dashboard` (security_invoker => respeita a RLS de fichas de quem consulta).
// `competencia` é a de ATENDIMENTO da linha; a produção agrupa por `mes_producao`.
export interface ProducaoBpaRow {
  id: string;
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
  "id,tipo,competencia,mes_producao,cnes,estabelecimento_nome,profissional_cns,profissional_nome,cbo,procedimento,quantidade,servico,classificacao,cid,carater,idade";

// Produção de um MÊS DE PRODUÇÃO, já no escopo do usuário (RLS). Sem mês, vazio.
export async function carregarProducaoDashboard(mesProducao?: string): Promise<ProducaoBpaRow[]> {
  if (!supabase || !mesProducao) return [];
  try {
    const { data, error } = await supabase
      .from("producao_dashboard")
      .select(COLS)
      .eq("mes_producao", mesProducao)
      .limit(10000);
    return error || !data ? [] : (data as ProducaoBpaRow[]);
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

// Descrição (ocupação/CBO) de vários códigos de uma vez, a partir do cache de vínculos
// (`profissional_vinculos`, populado quando os profissionais são sincronizados). Mapa
// código→descrição; códigos ausentes ficam de fora (o dashboard cai no código puro). É
// best-effort: a cobertura cresce à medida que os estabelecimentos sincronizam. Nunca lança.
export async function carregarDescricoesCbo(codigos: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(codigos.filter((c) => c && c.length >= 4))];
  if (!supabase || unicos.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from("profissional_vinculos")
      .select("cbo_codigo, cbo_descricao")
      .in("cbo_codigo", unicos);
    if (error || !data) return {};
    const mapa: Record<string, string> = {};
    for (const row of data as { cbo_codigo: string; cbo_descricao: string | null }[]) {
      const d = (row.cbo_descricao ?? "").trim();
      if (d && !mapa[row.cbo_codigo]) mapa[row.cbo_codigo] = d;
    }
    return mapa;
  } catch {
    return {};
  }
}
