import { supabase } from "@/lib/supabase";

// Persistência das fichas do BPA-I v2 no Supabase (tabela `fichas`, RLS dono-apenas).
// Tudo null-safe: sem config/login/erro, degrada p/ localStorage sem quebrar o form.

export interface FichaResumo {
  id: string;
  titulo: string;
  competencia: string | null;
  updated_at: string;
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
      const { error } = await supabase
        .from("fichas")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", id);
      return error ? null : id;
    }
    const { data, error } = await supabase
      .from("fichas")
      .insert(payload)
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
      .select("id, titulo, competencia, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (tipo) req = req.eq("tipo", tipo);
    const { data, error } = await req;
    return error || !data ? [] : (data as FichaResumo[]);
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
