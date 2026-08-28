// Relação NOMINAL de pacientes (com nome — uso interno/conferência) e TABULAÇÃO por
// procedimento (agregada). Todas via RPC (respeitam RLS).
import { supabase } from "@/lib/supabase";

export interface PacienteNominal {
  nome: string; documento: string; nascimento: string; sexo: string; raca: string; bairro: string; municipio?: string;
}

const mapNominal = (data: unknown): PacienteNominal[] =>
  ((data ?? []) as Record<string, string>[]).map((r) => ({
    nome: r.nome ?? "", documento: r.documento ?? "", nascimento: r.nascimento ?? "",
    sexo: r.sexo ?? "", raca: r.raca ?? "", bairro: r.bairro ?? "", municipio: r.municipio ?? undefined,
  }));

export async function relacaoGeral(): Promise<PacienteNominal[]> {
  if (!supabase) return [];
  try { const { data, error } = await supabase.rpc("relacao_pacientes_geral"); return error ? [] : mapNominal(data); } catch { return []; }
}
export async function relacaoTfd(de: string | null, ate: string | null): Promise<PacienteNominal[]> {
  if (!supabase) return [];
  try { const { data, error } = await supabase.rpc("relacao_pacientes_tfd", { _de: de, _ate: ate }); return error ? [] : mapNominal(data); } catch { return []; }
}
export async function relacaoProducao(cnesList: string[], de: string, ate: string, tipo: string, proc: string | null): Promise<PacienteNominal[]> {
  if (!supabase) return [];
  try { const { data, error } = await supabase.rpc("relacao_pacientes_producao", { _cnes: cnesList.length ? cnesList : null, _de: de, _ate: ate, _tipo: tipo, _proc: proc }); return error ? [] : mapNominal(data); } catch { return []; }
}

export interface Tabulacao {
  total: number;
  faixa: { k: string; n: number }[];
  sexo: { k: string; n: number }[];
  raca: { k: string; n: number }[];
  bairro: { k: string; n: number }[];
  faixaSexo: { faixa: string; sexo: string; n: number }[];
}
export async function carregarTabulacao(cnesList: string[], de: string, ate: string, tipo: string, proc: string | null): Promise<Tabulacao | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("tabulacao_producao", { _cnes: cnesList.length ? cnesList : null, _de: de, _ate: ate, _tipo: tipo, _proc: proc });
    if (error || !data) return null;
    const d = data as { total: number; faixa: { k: string; n: number }[]; sexo: { k: string; n: number }[]; raca: { k: string; n: number }[]; bairro: { k: string; n: number }[]; faixa_sexo: { faixa: string; sexo: string; n: number }[] };
    return {
      total: d.total ?? 0,
      faixa: (d.faixa ?? []).map((r) => ({ k: r.k, n: Number(r.n) })),
      sexo: (d.sexo ?? []).map((r) => ({ k: r.k, n: Number(r.n) })),
      raca: (d.raca ?? []).map((r) => ({ k: r.k, n: Number(r.n) })),
      bairro: (d.bairro ?? []).map((r) => ({ k: r.k, n: Number(r.n) })),
      faixaSexo: (d.faixa_sexo ?? []).map((r) => ({ faixa: r.faixa, sexo: r.sexo, n: Number(r.n) })),
    };
  } catch { return null; }
}
