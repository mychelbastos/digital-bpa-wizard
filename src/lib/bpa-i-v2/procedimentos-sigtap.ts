import { supabase } from "@/lib/supabase";

export interface ProcedimentoSigtap {
  codigo: string;
  nome: string;
  sexo: "M" | "F" | "I" | "N" | null;
  qtMaximaExecucao: number | null; // 9999 = sem limite
  idadeMinimaMeses: number | null; // 9999 = não se aplica
  idadeMaximaMeses: number | null; // 9999 = não se aplica
}

const SEM_LIMITE = 9999;

// Busca um procedimento pelo código (10 dígitos) na tabela oficial do SIGTAP. Sempre
// pega a competência mais recente carregada (a tabela pode ter várias em paralelo).
// null = não configurado, não encontrado (código inválido/inexistente) ou erro —
// nunca lança (não bloqueia o formulário; quem decide o que fazer é a UI).
export async function buscarProcedimentoSigtap(codigo: string): Promise<ProcedimentoSigtap | null> {
  if (!supabase || codigo.length !== 10) return null;
  try {
    const { data, error } = await supabase
      .from("procedimentos_sigtap")
      .select("codigo, nome, sexo, qt_maxima_execucao, idade_minima_meses, idade_maxima_meses")
      .eq("codigo", codigo)
      .order("competencia", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const d = data as {
      codigo: string; nome: string; sexo: "M" | "F" | "I" | "N" | null;
      qt_maxima_execucao: number | null; idade_minima_meses: number | null; idade_maxima_meses: number | null;
    };
    return {
      codigo: d.codigo,
      nome: d.nome,
      sexo: d.sexo,
      qtMaximaExecucao: d.qt_maxima_execucao,
      idadeMinimaMeses: d.idade_minima_meses,
      idadeMaximaMeses: d.idade_maxima_meses,
    };
  } catch {
    return null;
  }
}

// Sexo do procedimento restringe o sexo do paciente? (I/N = qualquer um serve).
export function sexoIncompativel(procSexo: ProcedimentoSigtap["sexo"], pacienteSexo: string): boolean {
  if (!procSexo || procSexo === "I" || procSexo === "N" || !pacienteSexo) return false;
  return procSexo !== pacienteSexo;
}

// Quantidade digitada excede o máximo de execuções permitido? (9999 = sem limite).
export function quantidadeExcedida(qtMaximaExecucao: number | null, qtdeDigitada: number): boolean {
  if (qtMaximaExecucao === null || qtMaximaExecucao === SEM_LIMITE || !qtdeDigitada) return false;
  return qtdeDigitada > qtMaximaExecucao;
}

// Idade (em meses, na data do atendimento) fora da faixa permitida pelo procedimento?
export function idadeForaDaFaixa(idadeMinima: number | null, idadeMaxima: number | null, idadeMesesPaciente: number | null): boolean {
  if (idadeMesesPaciente === null) return false;
  const min = idadeMinima === null || idadeMinima === SEM_LIMITE ? null : idadeMinima;
  const max = idadeMaxima === null || idadeMaxima === SEM_LIMITE ? null : idadeMaxima;
  if (min !== null && idadeMesesPaciente < min) return true;
  if (max !== null && idadeMesesPaciente > max) return true;
  return false;
}

// Combinação Serviço + Classificação é válida para este procedimento?
export async function servicoClassificacaoValida(procedimento: string, servico: string, classificacao: string): Promise<boolean | null> {
  if (!supabase || procedimento.length !== 10 || servico.length !== 3 || classificacao.length !== 3) return null;
  try {
    const { data, error } = await supabase
      .from("procedimento_servico")
      .select("procedimento")
      .eq("procedimento", procedimento)
      .eq("servico", servico)
      .eq("classificacao", classificacao)
      .limit(1);
    if (error) return null;
    return Boolean(data && data.length > 0);
  } catch {
    return null;
  }
}

// CID é compatível com este procedimento?
export async function cidValidoParaProcedimento(procedimento: string, cid: string): Promise<boolean | null> {
  if (!supabase || procedimento.length !== 10 || !cid) return null;
  try {
    const { data, error } = await supabase
      .from("procedimento_cid")
      .select("procedimento")
      .eq("procedimento", procedimento)
      .eq("cid", cid)
      .limit(1);
    if (error) return null;
    return Boolean(data && data.length > 0);
  } catch {
    return null;
  }
}
