import { supabase } from "@/lib/supabase";

// Cadastro central de pacientes (tabela `pacientes`, por organização, dedup por CNS/CPF).
// PII sensível: toda leitura de um paciente deve chamar registrarLeituraPaciente (log LGPD,
// mesma regra do BPA-I). Tudo null-safe: sem config/erro degrada sem quebrar a tela.

export interface Paciente {
  id: string;
  organizacao_id: string;
  cns: string | null;
  cpf: string | null;
  nome: string;
  nome_social: string | null;
  sexo: "M" | "F" | null;
  nascimento: string | null; // YYYY-MM-DD
  nome_mae: string | null;
  nome_responsavel: string | null; // responsável pelo paciente (RAAS ras_nomresp)
  responsavel_tipo: string | null; // 'paciente' | 'mae' | 'outro' (como o nome é preenchido)
  data_admissao: string | null; // YYYY-MM-DD — admissão/início do acompanhamento no CAPS (RAAS)
  prontuario: string | null; // Nº do prontuário no CAPS (RAAS PSI)
  telefone: string | null;
  email: string | null;
  nacionalidade: string | null; // código CADSUS (1 = Brasileiro)
  raca_cor: string | null;
  etnia: string | null;
  situacao_rua: string | null;  // 'S' / 'N'
  cod_logradouro: string | null; // código do tipo de logradouro
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  municipio_ibge: string | null;
  municipio_nome: string | null;
  uf: string | null;
  acompanhante_id: string | null; // acompanhante habitual (outra pessoa cadastrada)
}

// Campos gravável. `id` presente = atualiza aquele registro; `tfd` marca paciente do TFD.
// `origem` (primeira aparição: 'bpa_i' | 'tfd' | 'manual') é gravada SÓ na criação.
export type PacienteInput = Partial<Omit<Paciente, "id" | "organizacao_id">> & {
  organizacao_id: string;
  nome: string;
  id?: string;
  tfd?: boolean;
  origem?: "bpa_i" | "tfd" | "manual";
};

// Campos exigidos para um cadastro "completo" de paciente (paridade com o BPA-I). Além
// destes, exige-se CNS OU CPF. `pacienteFaltando` devolve as chaves ausentes (vazio = ok).
export const CAMPOS_OBRIGATORIOS_PACIENTE: (keyof Paciente)[] = [
  "nome", "sexo", "nascimento", "nacionalidade", "raca_cor",
  "cep", "municipio_ibge", "logradouro", "numero", "bairro", "uf",
];

export function pacienteFaltando(p: Partial<Paciente>): string[] {
  const faltam: string[] = [];
  if (!p.cns && !p.cpf) faltam.push("documento (CNS/CPF)");
  for (const c of CAMPOS_OBRIGATORIOS_PACIENTE) {
    const v = p[c];
    if (v === null || v === undefined || String(v).trim() === "") faltam.push(c);
  }
  return faltam;
}

const COLS =
  "id, organizacao_id, cns, cpf, nome, nome_social, sexo, nascimento, nome_mae, nome_responsavel, responsavel_tipo, data_admissao, prontuario, telefone, email, nacionalidade, raca_cor, etnia, situacao_rua, cod_logradouro, logradouro, numero, complemento, bairro, cep, municipio_ibge, municipio_nome, uf, acompanhante_id";

const soDigitos = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

// Autocomplete de paciente dentro de uma org: nome ACENTO-INSENSÍVEL (unaccent+trigram) ou,
// se o termo for numérico, por CNS/CPF (prefixo). Via RPC `buscar_pacientes` (security
// invoker → respeita a RLS por vínculo). Não loga leitura — a lista é um índice; o log é ao
// ABRIR o paciente. Devolve as linhas completas de `pacientes` (superset de COLS).
export async function buscarPacientes(organizacaoId: string, termo: string, apenasTfd = false): Promise<Paciente[]> {
  const q = termo.trim();
  if (!supabase || !organizacaoId || q.length < 3) return [];
  try {
    const { data, error } = await supabase.rpc("buscar_pacientes", {
      _org: organizacaoId,
      _termo: q,
      _apenas_tfd: apenasTfd,
    });
    return error || !data ? [] : (data as Paciente[]);
  } catch {
    return [];
  }
}

// Carrega um paciente por id (e loga a leitura de PII). null se não existe/erro.
export async function carregarPaciente(id: string, logar = true): Promise<Paciente | null> {
  if (!supabase || !id) return null;
  try {
    const { data, error } = await supabase.from("pacientes").select(COLS).eq("id", id).maybeSingle();
    if (error || !data) return null;
    if (logar) void registrarLeituraPaciente(id);
    return data as Paciente;
  } catch {
    return null;
  }
}

// Procura um paciente por um documento (CNS ou CPF) na org (ignora excluídos). null se não há.
async function acharPorDocumento(organizacaoId: string, coluna: "cns" | "cpf", valor: string): Promise<Paciente | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("pacientes").select(COLS)
    .eq("organizacao_id", organizacaoId).is("excluido_em", null).eq(coluna, valor).limit(1).maybeSingle();
  return error || !data ? null : (data as Paciente);
}

// Compat: retorna o paciente que casa por CNS (preferencial) ou CPF, sem tratar conflito.
export async function acharPacientePorDocumento(organizacaoId: string, cns?: string | null, cpf?: string | null): Promise<Paciente | null> {
  const c = soDigitos(cns), p = soDigitos(cpf);
  if (!supabase || !organizacaoId || (!c && !p)) return null;
  try {
    if (c) { const hit = await acharPorDocumento(organizacaoId, "cns", c); if (hit) return hit; }
    if (p) return await acharPorDocumento(organizacaoId, "cpf", p);
    return null;
  } catch { return null; }
}

export interface SalvarPacienteResultado { paciente: Paciente | null; erro?: string }

// Cria ou atualiza um paciente, deduplicando por CNS/CPF na org (CNS é o identificador forte).
// Quando os documentos apontam para PESSOAS DIFERENTES, NÃO mescla: retorna erro descritivo
// (ex.: CPF de outra pessoa). Retorna { paciente } no sucesso, ou { paciente: null, erro }.
// "Cadastro manda": após alterar um paciente, o nome/nascimento corrigido é
// escrito também nas fichas BPA-I que carregam o mesmo CNS/CPF (RPC no banco).
// Best-effort: nunca derruba o salvamento se a propagação falhar.
async function propagarParaFichas(pacienteId: string): Promise<void> {
  if (!supabase || !pacienteId) return;
  try { await supabase.rpc("propagar_paciente_fichas", { p_id: pacienteId }); }
  catch { /* propagação é best-effort */ }
}

export async function salvarPaciente(input: PacienteInput): Promise<SalvarPacienteResultado> {
  if (!supabase) return { paciente: null, erro: "Sistema indisponível." };
  const cns = soDigitos(input.cns) || null;
  const cpf = soDigitos(input.cpf) || null;
  const row = {
    organizacao_id: input.organizacao_id,
    cns,
    cpf,
    nome: input.nome.trim().toUpperCase(),
    nome_social: input.nome_social?.trim().toUpperCase() || null,
    sexo: input.sexo ?? null,
    nascimento: input.nascimento || null,
    nome_mae: input.nome_mae?.trim().toUpperCase() || null,
    nome_responsavel: input.nome_responsavel?.trim().toUpperCase() || null,
    responsavel_tipo: input.responsavel_tipo?.trim() || null,
    data_admissao: input.data_admissao || null,
    prontuario: input.prontuario?.trim() || null, // aceita dígitos e "/"
    telefone: soDigitos(input.telefone) || null,
    email: input.email?.trim().toLowerCase() || null, // e-mail sempre minúsculo
    nacionalidade: input.nacionalidade?.trim() || null,
    raca_cor: input.raca_cor?.trim() || null,
    etnia: input.etnia?.trim() || null,
    situacao_rua: input.situacao_rua?.trim().toUpperCase() || null,
    cod_logradouro: soDigitos(input.cod_logradouro) || null,
    logradouro: input.logradouro?.trim().toUpperCase() || null,
    numero: input.numero?.trim().toUpperCase() || null,
    complemento: input.complemento?.trim().toUpperCase() || null,
    bairro: input.bairro?.trim().toUpperCase() || null,
    cep: soDigitos(input.cep) || null,
    municipio_ibge: soDigitos(input.municipio_ibge) || null,
    municipio_nome: input.municipio_nome?.trim().toUpperCase() || null,
    uf: input.uf?.trim().toUpperCase() || null,
    acompanhante_id: input.acompanhante_id ?? undefined, // undefined = não mexe
    atualizado_em: new Date().toISOString(),
    ...(input.tfd ? { tfd: true } : {}), // só marca; nunca desmarca num update
  };
  const erroBanco = (msg: string | undefined): string =>
    /23505|duplicate key/i.test(msg ?? "") ? "CNS ou CPF já cadastrado para outra pessoa." : "Falha ao salvar.";

  try {
    // Atualização explícita por id (edição/complemento de um paciente já selecionado).
    // Editar pelo cadastro = revisão feita → dá baixa na marca de conflito.
    if (input.id) {
      const { data, error } = await supabase.from("pacientes").update({ ...row, flag_revisao: false }).eq("id", input.id).select(COLS).single();
      if (error || !data) return { paciente: null, erro: erroBanco(error?.message) };
      await propagarParaFichas(input.id); // cadastro manda: nome/nascimento vão p/ as fichas
      return { paciente: data as Paciente };
    }
    // Dedup SEGURA. CNS é o identificador forte.
    const byCns = cns ? await acharPorDocumento(input.organizacao_id, "cns", cns) : null;
    const byCpf = cpf ? await acharPorDocumento(input.organizacao_id, "cpf", cpf) : null;
    if (byCns && byCpf && byCns.id !== byCpf.id) {
      return { paciente: null, erro: `Conflito de documentos: o CNS é de ${byCns.nome} e o CPF é de ${byCpf.nome}. Confira o CNS/CPF.` };
    }
    const existente = byCns ?? byCpf;
    // Achado só pelo CPF, mas o registro tem OUTRO CNS ⇒ pessoas diferentes (CPF trocado).
    if (existente && !byCns && cns && existente.cns && existente.cns !== cns) {
      return { paciente: null, erro: `Este CPF já pertence a ${existente.nome} (CNS diferente). Confira o CPF.` };
    }
    if (existente) {
      const { data, error } = await supabase.from("pacientes").update(row).eq("id", existente.id).select(COLS).single();
      if (error || !data) return { paciente: null, erro: erroBanco(error?.message) };
      await propagarParaFichas(existente.id); // cadastro manda: propaga p/ as fichas
      return { paciente: data as Paciente };
    }
    // Criação: carimba `origem` (primeira aparição) quando informada.
    const rowInsert = input.origem ? { ...row, origem: input.origem } : row;
    const { data, error } = await supabase.from("pacientes").insert(rowInsert).select(COLS).single();
    return error || !data ? { paciente: null, erro: erroBanco(error?.message) } : { paciente: data as Paciente };
  } catch {
    return { paciente: null, erro: "Falha ao salvar." };
  }
}

// Exclui (soft-delete) um paciente com motivo OBRIGATÓRIO, registrado em log de auditoria.
// Retorna true se excluiu; false se motivo vazio / sem permissão / não encontrado.
export async function excluirPaciente(id: string, motivo: string): Promise<boolean> {
  if (!supabase || !id || !motivo.trim()) return false;
  try {
    const { data, error } = await supabase.rpc("excluir_paciente", { _id: id, _motivo: motivo.trim() });
    return !error && data === true;
  } catch {
    return false;
  }
}

// Registra uma leitura de PII (LGPD). Silencioso — nunca falha a tela.
export async function registrarLeituraPaciente(pacienteId: string): Promise<void> {
  if (!supabase || !pacienteId) return;
  try {
    await supabase.rpc("registrar_leitura_paciente", { _paciente_id: pacienteId });
  } catch {
    /* silencioso */
  }
}
