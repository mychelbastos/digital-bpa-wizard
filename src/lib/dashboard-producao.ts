import { supabase } from "@/lib/supabase";

export type TipoBpa = "BPA-C" | "BPA-I";
export type FormatoGerado = "pdf" | "txt";

export interface ProducaoBpaInput {
  sourceKey: string;
  fichaId: string | null;
  tipo: TipoBpa;
  competencia: string;
  dataAtendimento?: string | null; // YYYY-MM-DD
  cnes?: string | null;
  estabelecimentoNome?: string | null;
  municipioIbge?: string | null;
  profissionalCns?: string | null;
  profissionalNome?: string | null;
  cbo?: string | null;
  procedimento: string;
  quantidade: number;
  servico?: string | null;
  classificacao?: string | null;
  cid?: string | null;
  carater?: string | null;
  idade?: number | null;
}

export interface ProducaoBpaRow {
  id: string;
  tipo: TipoBpa;
  competencia: string;
  data_atendimento: string | null;
  cnes: string | null;
  estabelecimento_nome: string | null;
  municipio_ibge: string | null;
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
  ultimo_formato: FormatoGerado;
  gerado_em: string;
}

export interface DashboardProfile {
  role: "profissional" | "supervisor";
  cnes: string | null;
  municipio_ibge: string | null;
  nome: string | null;
}

const normalizar = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s || null;
};

export async function hashProducao(parts: unknown[]): Promise<string> {
  const texto = JSON.stringify(parts);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(texto);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = Math.imul(31, h) + texto.charCodeAt(i) | 0;
  return `fallback-${Math.abs(h)}`;
}

export async function registrarProducaoBpa(linhas: ProducaoBpaInput[], formato: FormatoGerado): Promise<boolean> {
  if (!supabase || linhas.length === 0) return false;
  const agora = new Date().toISOString();
  const payload = linhas.map((l) => ({
    source_key: l.sourceKey,
    ficha_id: l.fichaId,
    tipo: l.tipo,
    competencia: l.competencia,
    data_atendimento: l.dataAtendimento || null,
    cnes: normalizar(l.cnes),
    estabelecimento_nome: normalizar(l.estabelecimentoNome),
    municipio_ibge: normalizar(l.municipioIbge),
    profissional_cns: normalizar(l.profissionalCns),
    profissional_nome: normalizar(l.profissionalNome),
    cbo: normalizar(l.cbo),
    procedimento: l.procedimento,
    quantidade: l.quantidade,
    servico: normalizar(l.servico),
    classificacao: normalizar(l.classificacao),
    cid: normalizar(l.cid),
    carater: normalizar(l.carater),
    idade: l.idade ?? null,
    ultimo_formato: formato,
    gerado_em: agora,
    updated_at: agora,
  }));

  try {
    const { error } = await supabase.from("producao_bpa").upsert(payload, { onConflict: "source_key" });
    return !error;
  } catch {
    return false;
  }
}

export async function carregarProducaoDashboard(competencia?: string): Promise<ProducaoBpaRow[]> {
  if (!supabase) return [];
  try {
    let req = supabase
      .from("producao_bpa")
      .select("id,tipo,competencia,data_atendimento,cnes,estabelecimento_nome,municipio_ibge,profissional_cns,profissional_nome,cbo,procedimento,quantidade,servico,classificacao,cid,carater,idade,ultimo_formato,gerado_em")
      .order("gerado_em", { ascending: false })
      .limit(5000);
    if (competencia) req = req.eq("competencia", competencia);
    const { data, error } = await req;
    return error || !data ? [] : (data as ProducaoBpaRow[]);
  } catch {
    return [];
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
      // Uma competência basta; o nome é estável entre elas.
      if (!mapa[row.codigo]) mapa[row.codigo] = row.nome;
    }
    return mapa;
  } catch {
    return {};
  }
}

export async function carregarDashboardProfile(): Promise<DashboardProfile | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("dashboard_user_profiles")
      .select("role,cnes,municipio_ibge,nome")
      .maybeSingle();
    return error || !data ? null : (data as DashboardProfile);
  } catch {
    return null;
  }
}
