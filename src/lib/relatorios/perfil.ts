// Perfil (epidemiológico) — dados AGREGADOS e ANONIMIZADOS (LGPD art. 12). Nunca traz PII.
// Cadastro de pacientes vem da RPC `perfil_pacientes_agregado` (respeita RLS, só contagens).
// Perfil clínico (CID/procedimentos) é agregado a partir da view producao_dashboard (sem PII).
import { supabase } from "@/lib/supabase";
import type { ProducaoBpaRow } from "@/lib/dashboard-producao";

export interface PerfilCadastro {
  total: number;
  faixaSexo: { faixa: string; sexo: string; n: number }[];
  raca: { raca: string; n: number }[];
  situacaoRua: { sit: string; n: number }[];
}

export async function carregarPerfilCadastro(): Promise<PerfilCadastro | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("perfil_pacientes_agregado");
    if (error || !data) return null;
    const d = data as { total: number; faixa_sexo: { faixa: string; sexo: string; n: number }[]; raca: { raca: string; n: number }[]; situacao_rua: { sit: string; n: number }[] };
    return {
      total: d.total ?? 0,
      faixaSexo: (d.faixa_sexo ?? []).map((r) => ({ faixa: r.faixa, sexo: r.sexo, n: Number(r.n) })),
      raca: (d.raca ?? []).map((r) => ({ raca: r.raca, n: Number(r.n) })),
      situacaoRua: (d.situacao_rua ?? []).map((r) => ({ sit: r.sit, n: Number(r.n) })),
    };
  } catch {
    return null;
  }
}

// Ordem canônica das faixas etárias.
export const FAIXAS = ["0-4", "5-9", "10-14", "15-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+", "Sem info"];

// ---- Agregações do perfil CLÍNICO a partir das linhas de produção (sem PII) ----
export interface ItemContagem { chave: string; rotulo: string; n: number }

// Top N CID por quantidade de procedimentos (produção). Ignora linhas sem CID.
export function agregarCid(rows: ProducaoBpaRow[], rotuloCid: (c: string | null) => string, topN = 25): ItemContagem[] {
  const m = new Map<string, number>();
  for (const r of rows) { const c = (r.cid ?? "").trim(); if (!c) continue; m.set(c, (m.get(c) ?? 0) + r.quantidade); }
  return [...m.entries()].map(([c, n]) => ({ chave: c, rotulo: rotuloCid(c), n })).sort((a, b) => b.n - a.n).slice(0, topN);
}

// Procedimentos: seleciona os top N por quantidade, mas EXIBE em ordem crescente de código.
export function agregarProcedimentos(rows: ProducaoBpaRow[], nomeProc: (c: string) => string | null, topN = 25): ItemContagem[] {
  const m = new Map<string, number>();
  for (const r of rows) { if (!r.procedimento) continue; m.set(r.procedimento, (m.get(r.procedimento) ?? 0) + r.quantidade); }
  return [...m.entries()].map(([c, n]) => ({ chave: c, rotulo: nomeProc(c) || c, n }))
    .sort((a, b) => b.n - a.n).slice(0, topN)
    .sort((a, b) => a.chave.localeCompare(b.chave));
}

// Produção total por unidade (CNES).
export function agregarPorUnidade(rows: ProducaoBpaRow[], nomeUnidade: (c: string) => string): ItemContagem[] {
  const m = new Map<string, number>();
  for (const r of rows) { const c = r.cnes || "sem-cnes"; m.set(c, (m.get(c) ?? 0) + r.quantidade); }
  return [...m.entries()].map(([c, n]) => ({ chave: c, rotulo: nomeUnidade(c), n })).sort((a, b) => b.n - a.n);
}
