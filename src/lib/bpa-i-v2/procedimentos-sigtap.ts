import { supabase } from "@/lib/supabase";

export interface ProcedimentoSigtap {
  codigo: string;
  nome: string;
  sexo: "M" | "F" | "I" | "N" | null;
}

// Busca um procedimento pelo código (10 dígitos) na tabela oficial do SIGTAP.
// null = não configurado, não encontrado (código inválido/inexistente) ou erro —
// nunca lança (não bloqueia o formulário; quem decide o que fazer é a UI).
export async function buscarProcedimentoSigtap(codigo: string): Promise<ProcedimentoSigtap | null> {
  if (!supabase || codigo.length !== 10) return null;
  try {
    const { data, error } = await supabase
      .from("procedimentos_sigtap")
      .select("codigo, nome, sexo")
      .eq("codigo", codigo)
      .maybeSingle();
    if (error || !data) return null;
    return data as ProcedimentoSigtap;
  } catch {
    return null;
  }
}
