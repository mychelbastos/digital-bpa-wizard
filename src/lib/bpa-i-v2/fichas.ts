import { supabase } from "@/lib/supabase";

// Persistência das fichas do BPA-I v2 no Supabase (tabela `fichas`, RLS dono-apenas).
// Tudo null-safe: sem config/login/erro, degrada p/ localStorage sem quebrar o form.

export interface FichaResumo {
  id: string;
  titulo: string;
  competencia: string | null;
  mes_producao: string | null;
  updated_at: string;
  tipo: "BPA-I" | "BPA-C";
}

// Ficha com o `dados` completo — usada no Fechamento do mês e na dashboard p/ reconstruir
// as linhas. `mes_producao` = mês em que foi criada (agrupamento da produção).
export interface FichaCompleta {
  id: string;
  tipo: "BPA-I" | "BPA-C";
  mes_producao: string | null;
  dados: unknown;
}

// Mês de produção (AAAAMM) = mês local atual — carimbado no 1º save da ficha.
function mesProducaoAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface FichaMetadados {
  tipo?: "BPA-C" | "BPA-I";
  cnes?: string | null;
  profissionalCns?: string | null;
  profissionalNome?: string | null;
}

// Cria (id null) ou atualiza uma ficha. Retorna o id (ou null em falha).
export async function salvarFicha(
  id: string | null,
  titulo: string,
  competencia: string,
  dados: unknown,
  meta: FichaMetadados = {},
): Promise<string | null> {
  if (!supabase) return null;
  const payload = {
    titulo,
    competencia,
    dados,
    tipo: meta.tipo ?? "BPA-I",
    cnes: meta.cnes || null,
    profissional_cns: meta.profissionalCns || null,
    profissional_nome: meta.profissionalNome || null,
  };
  try {
    if (id) {
      // Update NÃO mexe em mes_producao: o mês de produção é fixado na criação da ficha.
      const { error } = await supabase
        .from("fichas")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", id);
      return error ? null : id;
    }
    const { data, error } = await supabase
      .from("fichas")
      .insert({ ...payload, mes_producao: mesProducaoAtual() })
      .select("id")
      .single();
    return error || !data ? null : (data as { id: string }).id;
  } catch {
    return null;
  }
}

// Renomeia uma ficha (só o título). Retorna true em sucesso.
export async function renomearFicha(id: string, titulo: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("fichas")
      .update({ titulo, updated_at: new Date().toISOString() })
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

// Lista as fichas do usuário. `tipo` opcional filtra por BPA-C/BPA-I (omitido = todas —
// mantém o comportamento atual de quem não passa o filtro).
export async function listarFichas(tipo?: "BPA-C" | "BPA-I"): Promise<FichaResumo[]> {
  if (!supabase) return [];
  try {
    let req = supabase
      .from("fichas")
      .select("id, titulo, competencia, mes_producao, updated_at, tipo")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (tipo) req = req.eq("tipo", tipo);
    const { data, error } = await req;
    return error || !data ? [] : (data as FichaResumo[]);
  } catch {
    return [];
  }
}

// Todas as fichas de um MÊS DE PRODUÇÃO (mês em que foram criadas) + CNES, com o `dados`
// completo — base do Fechamento do mês (arquivo combinado 01+02+03) e da dashboard. A
// produção de um mês pode conter fichas de competências de atendimento diferentes (até 4
// meses de retroatividade); o agrupamento é por mês de produção, não por competência.
export async function fichasDoMes(mesProducao: string, cnes?: string): Promise<FichaCompleta[]> {
  if (!supabase) return [];
  try {
    let req = supabase.from("fichas").select("id, tipo, mes_producao, dados").eq("mes_producao", mesProducao).limit(500);
    if (cnes) req = req.eq("cnes", cnes);
    const { data, error } = await req;
    return error || !data ? [] : (data as FichaCompleta[]);
  } catch {
    return [];
  }
}

export async function carregarFicha(id: string): Promise<unknown | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("fichas").select("dados").eq("id", id).maybeSingle();
    return error || !data ? null : (data as { dados: unknown }).dados;
  } catch {
    return null;
  }
}

export async function excluirFicha(id: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("fichas").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}
