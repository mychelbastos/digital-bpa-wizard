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
  escopo: "organizacao" | "cnes";
}

// Pessoa (usuário × organização) — a unidade de administração. Um vínculo por CNES no
// modelo; aqui agrupado. `perms[codigo]` = quantos vínculos da pessoa têm a permissão
// (a UI deriva on = todos, parcial = alguns, off = nenhum).
export interface PessoaAdmin {
  user_id: string;
  email: string;
  organizacao_id: string;
  org_nome: string;
  papeis: string[];
  cnes: string[];
  vinculo_ids: string[];
  total_vinculos: number;
  perms: Record<string, number>;
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
      .select("codigo, descricao, escopo")
      .order("codigo");
    return error || !data ? [] : (data as PermissaoCat[]);
  } catch {
    return [];
  }
}

// Padrão de cada cargo (papel → permissões). A UI usa para marcar "≠ padrão do cargo".
export async function listarPapelPermissoes(): Promise<Record<string, string[]>> {
  if (!supabase) return {};
  try {
    const { data, error } = await supabase.from("papel_permissoes").select("papel, permissao");
    if (error || !data) return {};
    const mapa: Record<string, string[]> = {};
    for (const row of data as { papel: string; permissao: string }[]) {
      (mapa[row.papel] ??= []).push(row.permissao);
    }
    return mapa;
  } catch {
    return {};
  }
}

// Pessoas (usuário × organização) que o usuário atual administra.
export async function listarPessoasAdmin(): Promise<PessoaAdmin[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc("admin_listar_pessoas");
    return error || !data ? [] : (data as PessoaAdmin[]);
  } catch {
    return [];
  }
}

// Aplica a permissão a TODOS os vínculos da pessoa na organização.
// concedida: true = concede; false = revoga; null = limpa o override (volta ao papel).
export async function definirPermissaoPessoa(
  userId: string,
  orgId: string,
  permissao: string,
  concedida: boolean | null,
): Promise<void> {
  if (!supabase) throw new Error("Sem conexão.");
  const { error } = await supabase.rpc("admin_definir_permissao_pessoa", {
    _user_id: userId,
    _org: orgId,
    _permissao: permissao,
    _concedida: concedida,
  });
  if (error) throw new Error(error.message);
}

// Troca o cargo em todos os vínculos da pessoa (limpa overrides CNES-scoped).
export async function trocarCargoPessoa(
  userId: string,
  orgId: string,
  papel: string,
): Promise<void> {
  if (!supabase) throw new Error("Sem conexão.");
  const { error } = await supabase.rpc("admin_trocar_cargo_pessoa", {
    _user_id: userId,
    _org: orgId,
    _papel: papel,
  });
  if (error) throw new Error(error.message);
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

export interface EstabelecimentoOrg {
  cnes: string;
  nome: string;
}

// Estabelecimentos (CNES) da organização — para o seletor "adicionar unidade".
export async function estabelecimentosOrg(orgId: string): Promise<EstabelecimentoOrg[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc("admin_estabelecimentos_org", { _org: orgId });
    return error || !data ? [] : (data as EstabelecimentoOrg[]);
  } catch {
    return [];
  }
}

// Cria um vínculo vigente da pessoa com o CNES no papel dado.
export async function vincularUnidade(
  userId: string,
  orgId: string,
  cnes: string,
  papel: string,
): Promise<void> {
  if (!supabase) throw new Error("Sem conexão.");
  const { error } = await supabase.rpc("admin_vincular_unidade", {
    _user_id: userId,
    _org: orgId,
    _cnes: cnes,
    _papel: papel,
  });
  if (error) throw new Error(error.message);
}

// Encerra a vigência dos vínculos ativos da pessoa nesse CNES (acesso cai na hora; histórico fica).
export async function desvincularUnidade(
  userId: string,
  orgId: string,
  cnes: string,
): Promise<void> {
  if (!supabase) throw new Error("Sem conexão.");
  const { error } = await supabase.rpc("admin_desvincular_unidade", {
    _user_id: userId,
    _org: orgId,
    _cnes: cnes,
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
