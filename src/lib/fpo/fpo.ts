import { supabase } from "@/lib/supabase";
import { cnesComPermissao } from "@/lib/permissoes";
import { carregarNomesProcedimentos } from "@/lib/dashboard-producao";
import type { FpoLinhaParsed } from "./parse-fpo";

// Resolve códigos FPO (9 díg.) -> SIGTAP (10 díg.) via RPC. Retorna mapa código_fpo -> 10 díg.
// (ou null quando não casa no SIGTAP). Nunca lança.
export async function resolverCodigosFpo(codigos: string[]): Promise<Record<string, string | null>> {
  const unicos = [...new Set(codigos.filter(Boolean))];
  if (!supabase || unicos.length === 0) return {};
  try {
    const { data, error } = await supabase.rpc("resolver_procedimentos_fpo", { _codigos: unicos });
    if (error || !data) return {};
    const mapa: Record<string, string | null> = {};
    for (const r of data as { codigo_fpo: string; codigo_sigtap: string | null }[]) {
      mapa[r.codigo_fpo] = r.codigo_sigtap;
    }
    return mapa;
  } catch {
    return {};
  }
}

export interface FpoItemResolvido {
  procedimento: string;        // 10 díg. resolvido, ou o próprio código FPO se não resolveu
  codigoFpo: string;
  descricaoFpo: string;
  qtdOrcada: number;
  valorUnitario: number;
  resolvido: boolean;
}

// Junta o parse com a resolução dos códigos, pronto para gravar/pré-visualizar.
export async function resolverLinhasFpo(linhas: FpoLinhaParsed[]): Promise<FpoItemResolvido[]> {
  const mapa = await resolverCodigosFpo(linhas.map((l) => l.codigoFpo));
  return linhas.map((l) => {
    const sig = mapa[l.codigoFpo] ?? null;
    return {
      procedimento: sig ?? l.codigoFpo,
      codigoFpo: l.codigoFpo,
      descricaoFpo: l.descricao,
      qtdOrcada: l.qtdOrcada,
      valorUnitario: l.valorUnitario,
      resolvido: Boolean(sig),
    };
  });
}

// Grava (upsert) os tetos de um CNES+competência. Substitui os itens existentes dessa
// combinação (carga do arquivo é a fonte). Retorna quantos itens foram gravados, ou null em erro.
export async function salvarTetosFpo(cnes: string, competencia: string, itens: FpoItemResolvido[], atualizadoPor: string | null): Promise<number | null> {
  if (!supabase || itens.length === 0) return 0;
  const rows = itens.map((it) => ({
    cnes,
    competencia,
    procedimento: it.procedimento,
    qtd_orcada: it.qtdOrcada,
    valor_unitario: it.valorUnitario,
    codigo_fpo: it.codigoFpo,
    descricao_fpo: it.descricaoFpo,
    resolvido: it.resolvido,
    atualizado_por: atualizadoPor,
    atualizado_em: new Date().toISOString(),
  }));
  const { error } = await supabase.from("fpo_teto").upsert(rows, { onConflict: "cnes,procedimento,competencia" });
  return error ? null : rows.length;
}

// Define/atualiza o teto VIGENTE a partir de uma competência (modelo de vigência): grava
// uma linha em `competencia` que passa a valer dessa competência em diante, até nova edição.
// Competências anteriores ficam intactas (mantêm o valor antigo). Ex.: base em 04/2026;
// ao editar visualizando 06/2026, cria-se a vigência de 06/2026 — 04 e 05 seguem no valor base.
export async function definirTetoVigente(
  cnes: string,
  procedimento: string,
  competencia: string,
  vals: { qtdOrcada: number; valorUnitario: number; codigoFpo?: string | null; descricaoFpo?: string | null; resolvido?: boolean },
  atualizadoPor: string | null,
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("fpo_teto").upsert({
    cnes, procedimento, competencia,
    qtd_orcada: vals.qtdOrcada,
    valor_unitario: vals.valorUnitario,
    codigo_fpo: vals.codigoFpo ?? null,
    descricao_fpo: vals.descricaoFpo ?? null,
    resolvido: vals.resolvido ?? true,
    atualizado_por: atualizadoPor,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: "cnes,procedimento,competencia" });
  return !error;
}

export async function excluirTetoFpo(cnes: string, procedimento: string, competencia: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("fpo_teto").delete()
    .eq("cnes", cnes).eq("procedimento", procedimento).eq("competencia", competencia);
  return !error;
}

export interface FpoComparacaoRow {
  procedimento: string;
  codigoFpo: string | null;
  descricao: string;
  resolvido: boolean;
  temTeto: boolean;
  tetoCompetencia: string | null;  // competência de onde veio o teto vigente (base herdada)
  herdado: boolean;                // true quando o teto vem de competência anterior à visualizada
  qtdOrcada: number;
  valorUnitario: number;
  produzido: number;
  saldo: number;         // qtdOrcada - produzido
  tetoRS: number;
  produzidoRS: number;
  saldoRS: number;
}

// Comparação teto × produção de um CNES+competência. Produção casa por mes_producao
// (competência de apresentação). O TETO segue o modelo de VIGÊNCIA: para a competência X,
// vale a última linha de fpo_teto com competência ≤ X por procedimento (a base carregada
// vale para as competências futuras até ser editada). Inclui itens com teto e produção zero
// e produção de procedimento sem teto (estouro de item não orçado).
export async function carregarComparacaoFpo(cnes: string, competencia: string): Promise<FpoComparacaoRow[]> {
  if (!supabase || !cnes || !competencia) return [];
  const [{ data: tetos }, { data: prod }] = await Promise.all([
    supabase.from("fpo_teto").select("procedimento, competencia, qtd_orcada, valor_unitario, codigo_fpo, descricao_fpo, resolvido")
      .eq("cnes", cnes).lte("competencia", competencia),
    supabase.from("producao_dashboard").select("procedimento, quantidade")
      .eq("cnes", cnes).eq("mes_producao", competencia),
  ]);

  // Produção somada por procedimento (10 díg.).
  const produzidoPor = new Map<string, number>();
  for (const r of (prod ?? []) as { procedimento: string; quantidade: number }[]) {
    produzidoPor.set(r.procedimento, (produzidoPor.get(r.procedimento) ?? 0) + (r.quantidade || 0));
  }

  // Teto vigente por procedimento = a linha de maior competência ≤ X.
  type T = { procedimento: string; competencia: string; qtd_orcada: number; valor_unitario: number; codigo_fpo: string | null; descricao_fpo: string | null; resolvido: boolean };
  const tetoPor = new Map<string, T>();
  for (const t of (tetos ?? []) as T[]) {
    const cur = tetoPor.get(t.procedimento);
    if (!cur || t.competencia > cur.competencia) tetoPor.set(t.procedimento, t);
  }

  const chaves = new Set<string>([...tetoPor.keys(), ...produzidoPor.keys()]);
  const nomes = await carregarNomesProcedimentos([...chaves]);

  const linhas: FpoComparacaoRow[] = [];
  for (const proc of chaves) {
    const t = tetoPor.get(proc);
    const produzido = produzidoPor.get(proc) ?? 0;
    const qtdOrcada = t?.qtd_orcada ?? 0;
    const valorUnitario = t ? Number(t.valor_unitario) : 0;
    const saldo = qtdOrcada - produzido;
    linhas.push({
      procedimento: proc,
      codigoFpo: t?.codigo_fpo ?? null,
      descricao: nomes[proc] || t?.descricao_fpo || proc,
      resolvido: t?.resolvido ?? true,
      temTeto: Boolean(t),
      tetoCompetencia: t?.competencia ?? null,
      herdado: Boolean(t && t.competencia < competencia),
      qtdOrcada,
      valorUnitario,
      produzido,
      saldo,
      tetoRS: qtdOrcada * valorUnitario,
      produzidoRS: produzido * valorUnitario,
      saldoRS: saldo * valorUnitario,
    });
  }
  // Maior teto primeiro; depois maior produção.
  return linhas.sort((a, b) => b.qtdOrcada - a.qtdOrcada || b.produzido - a.produzido);
}

// CNES em que o usuário pode EDITAR a FPO (permissão editar_fpo).
export async function cnesEditaveisFpo(): Promise<string[]> {
  return cnesComPermissao("editar_fpo");
}
