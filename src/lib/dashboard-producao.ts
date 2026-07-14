import { supabase } from "@/lib/supabase";
import { fichasDoMes, type FichaCompleta } from "@/lib/bpa-i-v2/fichas";
import { rowPreenchida } from "@/lib/bpa-c-v2/bpa-magnetico";
import { seqPreenchida } from "@/lib/bpa-i-v2/bpa-magnetico";
import { competenciaDoAtendimento } from "@/lib/bpa-i-v2/validacao";
import type { RowData } from "@/lib/bpac-layout";
import type { SeqData } from "@/lib/bpai-v2-layout";

export type TipoBpa = "BPA-C" | "BPA-I";

// Uma linha de produção para a dashboard, achatada a partir do `dados` de uma ficha.
// `competencia` é a de ATENDIMENTO (prd-cmp) da linha; o agrupamento da produção é por
// `mesProducao` (mês em que a ficha foi criada), não por competência.
export interface ProducaoBpaRow {
  id: string;
  tipo: TipoBpa;
  competencia: string;
  mesProducao: string | null;
  cnes: string | null;
  estabelecimento_nome: string | null;
  profissional_cns: string | null;
  profissional_nome: string | null;
  cbo: string | null;
  procedimento: string;
  quantidade: number;
  servico: string | null;
  classificacao: string | null;
  cid: string | null;
  carater: string | null;
  idade: number | null;
}

export interface DashboardProfile {
  role: "profissional" | "supervisor";
  cnes: string | null;
  municipio_ibge: string | null;
  nome: string | null;
}

const j = (a?: string[]) => (a ?? []).join("");

// Formatos do `dados` (jsonb) salvos pelos formulários — subconjunto do que a dashboard usa.
interface BpaCDados { cnes?: string[]; nome?: string; mes?: string[]; ano?: string[]; rows?: RowData[] }
interface BpaIDados {
  cnes?: string[]; nomeEstab?: string; profCns?: string[]; profNome?: string;
  profCbo?: string[]; profMes?: string[]; profAno?: string[]; seqs?: SeqData[];
}

// Achata uma ficha em suas linhas de produção. BPA-C: 1 linha por procedimento preenchido,
// competência = cabeçalho (ano+mes). BPA-I: 1 linha por sequência preenchida, competência =
// data de atendimento da sequência (produção retroativa).
function achatarFicha(f: FichaCompleta): ProducaoBpaRow[] {
  if (f.tipo === "BPA-C") {
    const d = (f.dados ?? {}) as BpaCDados;
    const comp = j(d.ano) + j(d.mes);
    return (d.rows ?? []).filter(rowPreenchida).map((r, i) => ({
      id: `${f.id}-c${i}`,
      tipo: "BPA-C" as const,
      competencia: comp,
      mesProducao: f.mes_producao,
      cnes: j(d.cnes) || null,
      estabelecimento_nome: d.nome?.trim() || null,
      profissional_cns: null,
      profissional_nome: null,
      cbo: j(r.cbo) || null,
      procedimento: j(r.procedimento),
      quantidade: Number(j(r.quantidade)) || 0,
      servico: null,
      classificacao: null,
      cid: null,
      carater: null,
      idade: Number(j(r.idade)) || null,
    }));
  }
  const d = (f.dados ?? {}) as BpaIDados;
  const cbo = j(d.profCbo) || null;
  const cns = j(d.profCns) || null;
  return (d.seqs ?? []).filter(seqPreenchida).map((s, i) => ({
    id: `${f.id}-i${i}`,
    tipo: "BPA-I" as const,
    competencia: competenciaDoAtendimento(s.dataAtend) ?? (j(d.profAno) + j(d.profMes)),
    mesProducao: f.mes_producao,
    cnes: j(d.cnes) || null,
    estabelecimento_nome: d.nomeEstab?.trim() || null,
    profissional_cns: cns,
    profissional_nome: d.profNome?.trim() || null,
    cbo,
    procedimento: j(s.codProc),
    quantidade: Number(j(s.qtde)) || 0,
    servico: j(s.servico) || null,
    classificacao: j(s.classProc) || null,
    cid: j(s.cid).trim() || null,
    carater: j(s.carater) || null,
    idade: null,
  }));
}

// Produção de um MÊS DE PRODUÇÃO (mês em que as fichas foram criadas), achatada em linhas.
// Fonte única = tabela `fichas` (RLS já limita ao dono). Sem mês, retorna vazio.
export async function carregarProducaoDashboard(mesProducao?: string): Promise<ProducaoBpaRow[]> {
  if (!supabase || !mesProducao) return [];
  const fichas = await fichasDoMes(mesProducao);
  return fichas.flatMap(achatarFicha);
}

// Nome oficial (SIGTAP) de vários procedimentos de uma vez. Retorna um mapa
// código→nome; códigos não encontrados simplesmente ficam de fora. Nunca lança.
export async function carregarNomesProcedimentos(codigos: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(codigos.filter((c) => c && c.length === 10))];
  if (!supabase || unicos.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from("procedimentos_sigtap")
      .select("codigo, nome")
      .in("codigo", unicos);
    if (error || !data) return {};
    const mapa: Record<string, string> = {};
    for (const row of data as { codigo: string; nome: string }[]) {
      // Uma competência basta; o nome é estável entre elas.
      if (!mapa[row.codigo]) mapa[row.codigo] = row.nome;
    }
    return mapa;
  } catch {
    return {};
  }
}

export async function carregarDashboardProfile(): Promise<DashboardProfile | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("dashboard_user_profiles")
      .select("role,cnes,municipio_ibge,nome")
      .maybeSingle();
    return error || !data ? null : (data as DashboardProfile);
  } catch {
    return null;
  }
}
