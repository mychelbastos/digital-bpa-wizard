import { supabase } from "@/lib/supabase";

// Administração de vínculos (Fase 6). Fonte da verdade é o banco (RPCs security definer,
// gated por 'gerenciar_vinculos'). Tudo null-safe.

export interface VinculoAdmin {
  vinculo_id: string;
  user_id: string;
  email: string;
  organizacao_id: string;
  org_nome: string;
  cnes: string;
  papel: string;
  inicio: string | null;
  fim: string | null;
  permissoes: string[];
}

export interface PermissaoCat {
  codigo: string;
  descricao: string;
}

export interface LeituraLog {
  lida_em: string;
  email: string;
  cnes: string;
  ficha_id: string;
  titulo: string;
}

export async function listarVinculosAdmin(): Promise<VinculoAdmin[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc("admin_listar_vinculos");
    return error || !data ? [] : (data as VinculoAdmin[]);
  } catch {
    return [];
  }
}

export async function listarPermissoes(): Promise<PermissaoCat[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("permissoes")
      .select("codigo, descricao")
      .order("codigo");
    return error || !data ? [] : (data as PermissaoCat[]);
  } catch {
    return [];
  }
}

// concedida: true = concede override; false = revoga override; null = limpa (volta ao papel).
export async function definirPermissao(
  vinculoId: string,
  permissao: string,
  concedida: boolean | null,
): Promise<void> {
  if (!supabase) throw new Error("Sem conexão.");
  const { error } = await supabase.rpc("admin_definir_permissao", {
    _vinculo_id: vinculoId,
    _permissao: permissao,
    _concedida: concedida,
  });
  if (error) throw new Error(error.message);
}

export async function leiturasRecentes(limite = 100): Promise<LeituraLog[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc("admin_leituras_recentes", { _limite: limite });
    return error || !data ? [] : (data as LeituraLog[]);
  } catch {
    return [];
  }
}
