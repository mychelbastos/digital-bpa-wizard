import { supabase } from "@/lib/supabase";

export interface ProfissionalCache {
  cns: string;
  nome: string;
  cpf: string | null;
}

export interface CboVinculo {
  codigo: string;
  descricao: string;
}

// Dispara a Edge Function p/ buscar os profissionais do estabelecimento na API do CNES
// e gravar no cache (tabela `profissionais`). Chamada UMA vez, quando o CNES é preenchido.
// Null-safe: se não configurado/erro, retorna 0 (não bloqueia o formulário).
export async function sincronizarProfissionais(cnes: string): Promise<number> {
  if (!supabase || !/^[0-9]{7}$/.test(cnes)) return 0;
  try {
    const { data, error } = await supabase.functions.invoke("cnes-profissionais", { body: { cnes } });
    if (error) return 0;
    return (data as { total?: number } | null)?.total ?? 0;
  } catch {
    return 0;
  }
}

// Autocomplete: lê do CACHE local (tabela), nunca da API a cada tecla.
// Busca por nome (contém) ou, se o texto for numérico, por CNS (prefixo).
export async function buscarProfissionais(cnes: string, termo: string): Promise<ProfissionalCache[]> {
  const q = termo.trim();
  if (!supabase || !/^[0-9]{7}$/.test(cnes) || q.length < 2) return [];
  try {
    let req = supabase.from("profissionais").select("cns, nome, cpf").eq("cnes", cnes).limit(8);
    req = /^[0-9]+$/.test(q) ? req.like("cns", `${q}%`) : req.ilike("nome", `%${q}%`);
    const { data, error } = await req;
    if (error || !data) return [];
    return data as ProfissionalCache[];
  } catch {
    return [];
  }
}

// Busca (sob demanda) os CBOs do VÍNCULO do profissional NAQUELE estabelecimento
// (CNS + CNES), via a Edge Function (VinculacaoProfissionalService) + cache.
// Pode retornar 0, 1 ou mais CBOs (profissional com múltiplos vínculos no estabelecimento).
export async function buscarCbosVinculo(cns: string, cnes: string): Promise<CboVinculo[]> {
  if (!supabase || !/^[0-9]{15}$/.test(cns) || !/^[0-9]{7}$/.test(cnes)) return [];
  try {
    const { data, error } = await supabase.functions.invoke("cnes-profissionais", { body: { cns, cnes } });
    if (error) return [];
    return (data as { cbos?: CboVinculo[] } | null)?.cbos ?? [];
  } catch {
    return [];
  }
}
