// Nome/descrição de um CBO pelo código (6 díg.). Reaproveita a tabela
// `profissional_vinculos` (cbo_codigo -> cbo_descricao), que já acumula as descrições
// dos CBOs consultados via CNES. Só leitura; null quando não há descrição conhecida.
import { supabase } from "@/lib/supabase";

const cache = new Map<string, string | null>();

export async function buscarNomeCbo(codigo: string): Promise<string | null> {
  const c = (codigo || "").replace(/\D/g, "");
  if (!supabase || c.length !== 6) return null;
  if (cache.has(c)) return cache.get(c)!;
  try {
    const { data, error } = await supabase
      .from("profissional_vinculos")
      .select("cbo_descricao")
      .eq("cbo_codigo", c)
      .not("cbo_descricao", "is", null)
      .limit(1)
      .maybeSingle();
    const nome = error || !data ? null : ((data as { cbo_descricao: string | null }).cbo_descricao ?? null);
    cache.set(c, nome);
    return nome;
  } catch {
    return null;
  }
}
