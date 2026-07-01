import { supabase } from "@/lib/supabase";

export interface EstabelecimentoSug {
  cnes: string;
  nome: string;
}

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

// Autocomplete reverso: digita parte do NOME (ou do CNES, se numérico) e sugere
// estabelecimentos p/ preencher o CNES automaticamente. Lê da tabela `estabelecimentos`.
// Null-safe: sem config/erro/termo curto, retorna [] (não bloqueia o formulário).
export async function buscarEstabelecimentosPorNome(termo: string): Promise<EstabelecimentoSug[]> {
  const q = termo.trim();
  if (!supabase || q.length < 2) return [];
  try {
    let req = supabase.from("estabelecimentos").select("cnes, nome").limit(8);
    req = /^[0-9]+$/.test(q) ? req.like("cnes", `${q}%`) : req.ilike("nome", `%${q}%`);
    const { data, error } = await req.order("nome");
    if (error || !data) return [];
    return data as EstabelecimentoSug[];
  } catch {
    return [];
  }
}
