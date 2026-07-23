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
export type PacienteInput = Partial<Omit<Paciente, "id" | "organizacao_id">> & {
  organizacao_id: string;
  nome: string;
  id?: string;
  tfd?: boolean;
};

// Campos exigidos para um cadastro "completo" de paciente (paridade com o BPA-I). Além
// destes, exige-se CNS OU CPF. `pacienteFaltando` devolve as chaves ausentes (vazio = ok).
export const CAMPOS_OBRIGATORIOS_PACIENTE: (keyof Paciente)[] = [
  "nome", "sexo", "nascimento", "nacionalidade", "raca_cor",
  "cep", "municipio_ibge", "logradouro", "numero", "bairro", "uf", "telefone",
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
  "id, organizacao_id, cns, cpf, nome, nome_social, sexo, nascimento, nome_mae, telefone, email, nacionalidade, raca_cor, etnia, situacao_rua, cod_logradouro, logradouro, numero, complemento, bairro, cep, municipio_ibge, municipio_nome, uf, acompanhante_id";

const soDigitos = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

// Autocomplete de paciente dentro de uma org: por nome (ilike) ou, se o termo for numérico,
// por CNS/CPF (prefixo). Não loga leitura — a lista é um índice; o log é ao ABRIR o paciente.
export async function buscarPacientes(organizacaoId: string, termo: string, apenasTfd = false): Promise<Paciente[]> {
  const q = termo.trim();
  if (!supabase || !organizacaoId || q.length < 3) return [];
  try {
    let req = supabase.from("pacientes").select(COLS).eq("organizacao_id", organizacaoId).is("excluido_em", null).limit(12);
    if (apenasTfd) req = req.eq("tfd", true);
    if (/^\d+$/.test(q)) {
      req = req.or(`cns.like.${q}%,cpf.like.${q}%`);
    } else {
      req = req.ilike("nome", `%${q}%`).order("nome");
    }
    const { data, error } = await req;
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

// Procura um paciente já cadastrado por CNS (ou CPF) na org — base da deduplicação.
export async function acharPacientePorDocumento(
  organizacaoId: string,
  cns: string | null | undefined,
  cpf: string | null | undefined,
): Promise<Paciente | null> {
  if (!supabase || !organizacaoId) return null;
  const c = soDigitos(cns);
  const p = soDigitos(cpf);
  if (!c && !p) return null;
  try {
    let req = supabase.from("pacientes").select(COLS).eq("organizacao_id", organizacaoId).is("excluido_em", null).limit(1);
    if (c) req = req.eq("cns", c);
    else req = req.eq("cpf", p);
    const { data, error } = await req.maybeSingle();
    return error || !data ? null : (data as Paciente);
  } catch {
    return null;
  }
}

// Cria ou atualiza um paciente, deduplicando por CNS/CPF na org (find-then-write; a tabela
// tem índice único parcial, mas o upsert por índice parcial é frágil no PostgREST). Retorna
// o paciente salvo, ou null em falha.
export async function salvarPaciente(input: PacienteInput): Promise<Paciente | null> {
  if (!supabase) return null;
  const cns = soDigitos(input.cns) || null;
  const cpf = soDigitos(input.cpf) || null;
  const row = {
    organizacao_id: input.organizacao_id,
    cns,
    cpf,
    nome: input.nome.trim().toUpperCase(),
    nome_social: input.nome_social?.trim() || null,
    sexo: input.sexo ?? null,
    nascimento: input.nascimento || null,
    nome_mae: input.nome_mae?.trim().toUpperCase() || null,
    telefone: soDigitos(input.telefone) || null,
    email: input.email?.trim().toLowerCase() || null,
    nacionalidade: input.nacionalidade?.trim() || null,
    raca_cor: input.raca_cor?.trim() || null,
    etnia: input.etnia?.trim() || null,
    situacao_rua: input.situacao_rua?.trim().toUpperCase() || null,
    cod_logradouro: soDigitos(input.cod_logradouro) || null,
    logradouro: input.logradouro?.trim() || null,
    numero: input.numero?.trim() || null,
    complemento: input.complemento?.trim() || null,
    bairro: input.bairro?.trim() || null,
    cep: soDigitos(input.cep) || null,
    municipio_ibge: soDigitos(input.municipio_ibge) || null,
    municipio_nome: input.municipio_nome?.trim() || null,
    uf: input.uf?.trim().toUpperCase() || null,
    acompanhante_id: input.acompanhante_id ?? undefined, // undefined = não mexe
    atualizado_em: new Date().toISOString(),
    ...(input.tfd ? { tfd: true } : {}), // só marca; nunca desmarca num update
  };
  try {
    // Atualização explícita por id (edição/complemento de um paciente já selecionado).
    if (input.id) {
      const { data, error } = await supabase.from("pacientes").update(row).eq("id", input.id).select(COLS).single();
      return error || !data ? null : (data as Paciente);
    }
    // Senão, deduplica por documento: atualiza o existente ou insere novo.
    const existente = await acharPacientePorDocumento(input.organizacao_id, cns, cpf);
    if (existente) {
      const { data, error } = await supabase.from("pacientes").update(row).eq("id", existente.id).select(COLS).single();
      return error || !data ? null : (data as Paciente);
    }
    const { data, error } = await supabase.from("pacientes").insert(row).select(COLS).single();
    return error || !data ? null : (data as Paciente);
  } catch {
    return null;
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
