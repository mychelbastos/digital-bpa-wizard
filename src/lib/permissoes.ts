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

// Vê a página de Administração? (super-admin global OU gerenciar_vinculos em alguma unidade).
export async function souAdmin(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc("sou_admin");
    return !error && data === true;
  } catch {
    return false;
  }
}

// É super-admin do sistema (operador que administra todas as prefeituras)?
export async function souSuperAdmin(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc("is_super_admin");
    return !error && data === true;
  } catch {
    return false;
  }
}
