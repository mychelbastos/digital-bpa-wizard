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

// Organização (Prefeitura) + cabeçalho do arquivo magnético + última gestão.
export interface OrganizacaoAdmin {
  id: string;
  nome: string;
  municipio_ibge: string | null;
  uf: string | null;
  cab_orgao_origem: string | null;
  cab_sigla: string | null;
  cab_cgc_cpf: string | null;
  cab_orgao_destino: string | null;
  cab_destino_tipo: string;
  cab_versao: string;
  gestao_id: string | null;
  gestao_nome: string | null;
  gestao_inicio: string | null;
  gestao_fim: string | null;
}

// Cria uma prefeitura (organização) nova — só super-admin. Devolve o id.
export async function criarOrganizacao(nome: string, ibge: string, uf: string): Promise<string> {
  if (!supabase) throw new Error("Sem conexão.");
  const { data, error } = await supabase.rpc("admin_criar_organizacao", {
    _nome: nome,
    _ibge: ibge,
    _uf: uf,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listarOrganizacoes(): Promise<OrganizacaoAdmin[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc("admin_organizacoes");
    return error || !data ? [] : (data as OrganizacaoAdmin[]);
  } catch {
    return [];
  }
}

export async function salvarOrganizacao(o: {
  id: string;
  nome: string;
  municipio_ibge: string;
  uf: string;
  cab_orgao_origem: string;
  cab_sigla: string;
  cab_cgc_cpf: string;
  cab_orgao_destino: string;
  cab_destino_tipo: string;
  cab_versao: string;
}): Promise<void> {
  if (!supabase) throw new Error("Sem conexão.");
  const { error } = await supabase.rpc("admin_salvar_organizacao", {
    _org: o.id,
    _nome: o.nome,
    _ibge: o.municipio_ibge,
    _uf: o.uf,
    _orig: o.cab_orgao_origem,
    _sigla: o.cab_sigla,
    _cgc: o.cab_cgc_cpf,
    _dest: o.cab_orgao_destino,
    _dtipo: o.cab_destino_tipo,
    _versao: o.cab_versao,
  });
  if (error) throw new Error(error.message);
}

// Cadastra/atualiza um estabelecimento (CNES) numa prefeitura. Fallback enquanto não há a
// base pública do CNES por município. Após cadastrar, o app puxa os profissionais (cache).
export async function adicionarEstabelecimento(
  orgId: string,
  cnes: string,
  nome: string,
): Promise<void> {
  if (!supabase) throw new Error("Sem conexão.");
  const { error } = await supabase.rpc("admin_adicionar_estabelecimento", {
    _org: orgId,
    _cnes: cnes,
    _nome: nome,
  });
  if (error) throw new Error(error.message);
}

export async function salvarGestao(
  orgId: string,
  gestaoId: string | null,
  nome: string,
  inicio: string,
  fim: string | null,
): Promise<string> {
  if (!supabase) throw new Error("Sem conexão.");
  const { data, error } = await supabase.rpc("admin_salvar_gestao", {
    _org: orgId,
    _gestao_id: gestaoId,
    _nome: nome,
    _inicio: inicio,
    _fim: fim,
  });
  if (error) throw new Error(error.message);
  return data as string;
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

// Cria uma conta nova pelo painel (sem verificação por e-mail) e já vincula ao CNES no papel
// dado. Roda numa Edge Function com service-role, gated por 'gerenciar_vinculos' no CNES.
// Devolve o user_id criado. Traduz o erro JSON da função (não o genérico do supabase-js).
export async function criarConta(
  email: string,
  senha: string,
  cnes: string,
  papel: string,
): Promise<string> {
  if (!supabase) throw new Error("Sem conexão.");
  const { data, error } = await supabase.functions.invoke("admin-criar-usuario", {
    body: { email, senha, cnes, papel },
  });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const body = ctx ? await ctx.json() : null;
      if (body?.erro) msg = body.erro;
    } catch {
      /* mantém msg genérica */
    }
    throw new Error(msg);
  }
  if (data?.erro) throw new Error(data.erro);
  if (!data?.user_id) throw new Error("Resposta inesperada ao criar conta.");
  return data.user_id as string;
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
