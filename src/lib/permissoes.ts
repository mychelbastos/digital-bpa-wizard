import { supabase } from "@/lib/supabase";

// CNES em que o usuário atual tem a permissão indicada (via RPC no banco — fonte única
// da regra de autorização). Ex.: cnesComPermissao("gerar_producao"). Nunca lança.
export async function cnesComPermissao(perm: string): Promise<string[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc("cnes_com_permissao", { _perm: perm });
    if (error || !data) return [];
    return (data as { cnes: string }[]).map((r) => r.cnes);
  } catch {
    return [];
  }
}
