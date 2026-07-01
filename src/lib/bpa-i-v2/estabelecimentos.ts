import { supabase } from "@/lib/supabase";

// Busca o nome do estabelecimento pelo CNES (7 dígitos). Retorna null se não
// configurado, não encontrado, ou em erro — nunca lança (não bloqueia o formulário).
export async function buscarEstabelecimento(cnes: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("estabelecimentos")
      .select("nome")
      .eq("cnes", cnes)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { nome: string }).nome;
  } catch {
    return null;
  }
}
