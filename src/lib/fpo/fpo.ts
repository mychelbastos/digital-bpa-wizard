import { supabase, buscarTodasPaginado } from "@/lib/supabase";
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
  codApuracao?: string;        // "21"/"24"/"34" — só do .IMP; usado na exportação p/ o SIA
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
      codApuracao: l.codApuracao,
    };
  });
}

// Grava (upsert) os tetos de um CNES+competência. Substitui os itens existentes dessa
// combinação (carga do arquivo é a fonte). Retorna quantos itens foram gravados, ou null em erro.
export async function salvarTetosFpo(cnes: string, competencia: string, itens: FpoItemResolvido[], atualizadoPor: string | null): Promise<number | null> {
  if (!supabase || itens.length === 0) return 0;
  // Só grava cod_apuracao quando a carga traz (import de .IMP). Import de .xls NÃO traz esse
  // campo — então o omitimos para NÃO sobrescrever (apagar) o que já está no banco.
  const temCod = itens.some((it) => it.codApuracao);
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
    ...(temCod ? { cod_apuracao: it.codApuracao ?? null } : {}),
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
  vals: { qtdOrcada: number; valorUnitario: number; codigoFpo?: string | null; descricaoFpo?: string | null; resolvido?: boolean; codApuracao?: string | null },
  atualizadoPor: string | null,
): Promise<boolean> {
  if (!supabase) return false;
  const cod = vals.codApuracao && /^[0-9]{2}$/.test(vals.codApuracao) ? vals.codApuracao : null;
  const { error } = await supabase.from("fpo_teto").upsert({
    cnes, procedimento, competencia,
    qtd_orcada: vals.qtdOrcada,
    valor_unitario: vals.valorUnitario,
    codigo_fpo: vals.codigoFpo ?? null,
    descricao_fpo: vals.descricaoFpo ?? null,
    resolvido: vals.resolvido ?? true,
    cod_apuracao: cod,
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
  codApuracao: string | null; // "21"/"24"/"34" (financiamento+apuração) — p/ export do .IMP
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
  const [{ data: tetos }, prod] = await Promise.all([
    supabase.from("fpo_teto").select("procedimento, competencia, qtd_orcada, valor_unitario, codigo_fpo, descricao_fpo, resolvido, cod_apuracao")
      .eq("cnes", cnes).lte("competencia", competencia),
    // Pagina: a produção de um mês passa de 1.000 linhas (teto do PostgREST) e é somada
    // no cliente — truncar subnotifica o "produzido" da FPO.
    buscarTodasPaginado<{ procedimento: string; quantidade: number }>((de, ate) =>
      supabase!.from("producao_dashboard").select("procedimento, quantidade")
        .eq("cnes", cnes).eq("mes_producao", competencia).order("id", { ascending: true }).range(de, ate)),
  ]);

  // Produção somada por procedimento (10 díg.).
  const produzidoPor = new Map<string, number>();
  for (const r of prod as { procedimento: string; quantidade: number }[]) {
    produzidoPor.set(r.procedimento, (produzidoPor.get(r.procedimento) ?? 0) + (r.quantidade || 0));
  }

  // Teto vigente por procedimento = a linha de maior competência ≤ X.
  type T = { procedimento: string; competencia: string; qtd_orcada: number; valor_unitario: number; codigo_fpo: string | null; descricao_fpo: string | null; resolvido: boolean; cod_apuracao: string | null };
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
      codApuracao: t?.cod_apuracao ?? null,
      produzido,
      saldo,
      tetoRS: qtdOrcada * valorUnitario,
      produzidoRS: produzido * valorUnitario,
      saldoRS: saldo * valorUnitario,
    });
  }
  // Ordena pelo CÓDIGO do procedimento (crescente), agrupando pelos 7 primeiros dígitos —
  // arrumação da página FPO (não afeta a dashboard nem o resumo).
  return linhas.sort((a, b) =>
    a.procedimento.slice(0, 7).localeCompare(b.procedimento.slice(0, 7)) ||
    a.procedimento.localeCompare(b.procedimento));
}

// CNES em que o usuário pode EDITAR a FPO (permissão editar_fpo).
export async function cnesEditaveisFpo(): Promise<string[]> {
  return cnesComPermissao("editar_fpo");
}

export interface FpoExportItem {
  cnes: string;
  codigoFpo: string;     // 9 díg. (p/ o .IMP)
  qtdOrcada: number;
  valorUnitario: number;
  codApuracao: string | null;
}

// Carrega o FPO VIGENTE de uma competência (teto = última competência ≤ X por cnes+proc),
// pronto para exportar o .IMP do SIA. Restringe aos CNES que o usuário pode editar (ou à
// lista passada). Reporta quantos itens estão SEM nível de apuração (sairão com o padrão).
export async function carregarFpoParaExport(competencia: string, cnesList?: string[]): Promise<{ itens: FpoExportItem[]; semApuracao: number }> {
  if (!supabase || !competencia) return { itens: [], semApuracao: 0 };
  const cnes = cnesList && cnesList.length ? [...new Set(cnesList.filter(Boolean))] : await cnesEditaveisFpo();
  if (cnes.length === 0) return { itens: [], semApuracao: 0 };
  const { data } = await supabase.from("fpo_teto")
    .select("cnes, procedimento, competencia, qtd_orcada, valor_unitario, codigo_fpo, cod_apuracao")
    .in("cnes", cnes).lte("competencia", competencia);
  type T = { cnes: string; procedimento: string; competencia: string; qtd_orcada: number; valor_unitario: number; codigo_fpo: string | null; cod_apuracao: string | null };
  const vig = new Map<string, T>();
  for (const t of (data ?? []) as T[]) {
    const k = `${t.cnes}|${t.procedimento}`;
    const cur = vig.get(k);
    if (!cur || t.competencia > cur.competencia) vig.set(k, t);
  }
  const itens: FpoExportItem[] = [];
  let semApuracao = 0;
  for (const t of vig.values()) {
    if (!t.codigo_fpo || !/^[0-9]{9}$/.test(t.codigo_fpo) || (t.qtd_orcada ?? 0) <= 0) continue;
    if (!t.cod_apuracao) semApuracao++;
    itens.push({ cnes: t.cnes, codigoFpo: t.codigo_fpo, qtdOrcada: t.qtd_orcada, valorUnitario: Number(t.valor_unitario), codApuracao: t.cod_apuracao });
  }
  return { itens, semApuracao };
}

export interface FpoResumoUnidade {
  cnes: string;
  tetoQtd: number;
  produzidoQtd: number;      // produção de procedimentos COM teto
  produzidoForaQtd: number;  // produção de procedimentos SEM teto (fora do orçado)
  tetoRS: number;
  produzidoRS: number;       // produção (com teto) valorada pelo preço do teto
  estourados: number;        // nº de procedimentos com produzido > teto
}

// Resumo FPO × produção por unidade, para um conjunto de CNES e a competência (mês de
// apresentação). Usa o mesmo modelo de vigência (teto = última competência ≤ X). Retorna só
// as unidades que têm FPO vigente. Nunca lança.
export async function carregarResumoFpo(cnesList: string[], competencia: string): Promise<FpoResumoUnidade[]> {
  const cnes = [...new Set(cnesList.filter(Boolean))];
  if (!supabase || cnes.length === 0 || !competencia) return [];
  const [{ data: tetos }, prod] = await Promise.all([
    supabase.from("fpo_teto").select("cnes, procedimento, competencia, qtd_orcada, valor_unitario")
      .in("cnes", cnes).lte("competencia", competencia),
    // Pagina: junho passa de 1.000 linhas somando todas as unidades (teto do PostgREST).
    buscarTodasPaginado<{ cnes: string; procedimento: string; quantidade: number }>((de, ate) =>
      supabase!.from("producao_dashboard").select("cnes, procedimento, quantidade")
        .in("cnes", cnes).eq("mes_producao", competencia).order("id", { ascending: true }).range(de, ate)),
  ]);

  // Teto vigente por (cnes, procedimento) = maior competência ≤ X.
  type V = { competencia: string; qtd: number; valor: number };
  const vig = new Map<string, V>();
  for (const t of (tetos ?? []) as { cnes: string; procedimento: string; competencia: string; qtd_orcada: number; valor_unitario: number }[]) {
    const k = `${t.cnes}|${t.procedimento}`;
    const cur = vig.get(k);
    if (!cur || t.competencia > cur.competencia) vig.set(k, { competencia: t.competencia, qtd: t.qtd_orcada, valor: Number(t.valor_unitario) });
  }

  // Produção somada por (cnes, procedimento).
  const prodPor = new Map<string, number>();
  for (const p of prod as { cnes: string; procedimento: string; quantidade: number }[]) {
    const k = `${p.cnes}|${p.procedimento}`;
    prodPor.set(k, (prodPor.get(k) ?? 0) + (p.quantidade || 0));
  }

  const porCnes = new Map<string, FpoResumoUnidade>();
  const getU = (c: string) => {
    let u = porCnes.get(c);
    if (!u) { u = { cnes: c, tetoQtd: 0, produzidoQtd: 0, produzidoForaQtd: 0, tetoRS: 0, produzidoRS: 0, estourados: 0 }; porCnes.set(c, u); }
    return u;
  };
  for (const [k, v] of vig) {
    const [c] = k.split("|");
    const u = getU(c);
    const p = prodPor.get(k) ?? 0;
    u.tetoQtd += v.qtd; u.tetoRS += v.qtd * v.valor;
    u.produzidoQtd += p; u.produzidoRS += p * v.valor;
    if (p > v.qtd) u.estourados++;
  }
  // Produção fora do teto (procedimento sem FPO), só nas unidades que já têm FPO.
  for (const [k, p] of prodPor) {
    if (vig.has(k)) continue;
    const [c] = k.split("|");
    if (porCnes.has(c)) getU(c).produzidoForaQtd += p;
  }
  return [...porCnes.values()].sort((a, b) => b.tetoRS - a.tetoRS);
}
