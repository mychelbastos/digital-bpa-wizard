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

// Competências (AAAAMM) que estão de fato carregadas nas tabelas SIGTAP. Cache em
// memória: só muda quando importamos uma competência nova (evento raro), então uma
// leitura por sessão basta. null enquanto não carregou.
let competenciasCarregadas: Set<string> | null = null;

async function carregarCompetencias(): Promise<Set<string>> {
  if (competenciasCarregadas) return competenciasCarregadas;
  const set = new Set<string>();
  if (supabase) {
    try {
      const { data } = await supabase.from("sigtap_competencias").select("competencia");
      for (const r of data ?? []) set.add(String((r as { competencia: string }).competencia));
    } catch { /* fail-open: set vazio → crivo cai no comportamento padrão (sem filtro) */ }
  }
  competenciasCarregadas = set;
  return set;
}

// Resolve a competência que o crivo deve usar: a do atendimento se ela estiver de fato
// carregada; senão null — e null significa "sem filtro", ou seja, cai na competência
// mais recente / união de todas (comportamento padrão). Assim nunca marcamos falso
// "não encontrado" só porque a competência foi podada (ou ainda não foi importada).
export async function resolverCompetencia(competencia: string | null | undefined): Promise<string | null> {
  if (!competencia || competencia.length !== 6) return null;
  const set = await carregarCompetencias();
  return set.has(competencia) ? competencia : null;
}

// Busca um procedimento pelo código (10 dígitos) na tabela oficial do SIGTAP. Quando a
// `competencia` (AAAAMM do atendimento) está carregada, valida contra ELA; senão pega a
// mais recente carregada (a tabela pode ter várias em paralelo). null = não configurado,
// não encontrado (código inválido/inexistente) ou erro — nunca lança (não bloqueia o
// formulário; quem decide o que fazer é a UI).
export async function buscarProcedimentoSigtap(codigo: string, competencia?: string | null): Promise<ProcedimentoSigtap | null> {
  if (!supabase || codigo.length !== 10) return null;
  try {
    const comp = await resolverCompetencia(competencia);
    let q = supabase
      .from("procedimentos_sigtap")
      .select("codigo, nome, sexo, qt_maxima_execucao, idade_minima_meses, idade_maxima_meses")
      .eq("codigo", codigo);
    q = comp ? q.eq("competencia", comp) : q.order("competencia", { ascending: false });
    const { data, error } = await q.limit(1).maybeSingle();
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
export async function servicoClassificacaoValida(procedimento: string, servico: string, classificacao: string, competencia?: string | null): Promise<boolean | null> {
  if (!supabase || procedimento.length !== 10 || servico.length !== 3 || classificacao.length !== 3) return null;
  try {
    const comp = await resolverCompetencia(competencia);
    let q = supabase
      .from("procedimento_servico")
      .select("procedimento")
      .eq("procedimento", procedimento)
      .eq("servico", servico)
      .eq("classificacao", classificacao);
    if (comp) q = q.eq("competencia", comp);
    const { data, error } = await q.limit(1);
    if (error) return null;
    return Boolean(data && data.length > 0);
  } catch {
    return null;
  }
}

// CBO (ocupação) é compatível com este procedimento? Regra: se o procedimento tem
// CBOs cadastrados, só esses valem; se não tem nenhum, não critica (retorna null).
// null = não sabemos / sem restrição (fail-open, não bloqueia).
export async function cboValidoParaProcedimento(procedimento: string, cbo: string, competencia?: string | null): Promise<boolean | null> {
  if (!supabase || procedimento.length !== 10 || cbo.length !== 6) return null;
  try {
    const comp = await resolverCompetencia(competencia);
    let q = supabase
      .from("procedimento_ocupacao")
      .select("cbo")
      .eq("procedimento", procedimento);
    if (comp) q = q.eq("competencia", comp);
    const { data, error } = await q.limit(1000);
    if (error) return null;
    if (!data || data.length === 0) return null; // procedimento sem CBO cadastrado → não critica
    return data.some((r) => (r as { cbo: string }).cbo === cbo);
  } catch {
    return null;
  }
}

// CID é compatível com este procedimento?
export async function cidValidoParaProcedimento(procedimento: string, cid: string, competencia?: string | null): Promise<boolean | null> {
  if (!supabase || procedimento.length !== 10 || !cid) return null;
  try {
    const comp = await resolverCompetencia(competencia);
    let q = supabase
      .from("procedimento_cid")
      .select("procedimento")
      .eq("procedimento", procedimento)
      .eq("cid", cid);
    if (comp) q = q.eq("competencia", comp);
    const { data, error } = await q.limit(1);
    if (error) return null;
    return Boolean(data && data.length > 0);
  } catch {
    return null;
  }
}
