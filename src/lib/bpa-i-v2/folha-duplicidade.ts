// Folha automática + crivo de duplicidade das fichas (BPA-I e BPA-C).
//
// FOLHA (organizacional): o número de folha da ficha NÃO vai para o .txt — a folha/seq do
// BPA Magnético é derivada no fechamento (ver fechamento-mes.ts, "DECISÃO: folha/seq é
// DERIVADA"). Aqui a folha serve só para organizar/imprimir. Regra do usuário: sequencial,
// REINICIANDO por competência, por profissional (BPA-I: CNS; BPA-C: Nome do profissional) e,
// quando não houver profissional, pela unidade (CNES). Próxima folha = maior já salva + 1.
//
// DUPLICIDADE: ao salvar, se existir uma ficha 100% idêntica (mesmo conteúdo de produção,
// ignorando o nº da folha, a assinatura do responsável e nomes de exibição), avisamos.
import { supabase } from "@/lib/supabase";

const jc = (a: unknown): string => (Array.isArray(a) ? a.join("") : String(a ?? ""));
const folhaNum = (a: unknown): number => {
  const s = jc(a).replace(/\D/g, "");
  return s ? parseInt(s, 10) : 0;
};

// ---------------- Próxima folha ----------------

// BPA-I: chave (CNES + competência) e, quando houver, o CNS do profissional (senão a unidade,
// como no BPA-C). Assim a folha já gera com CNES+competência, sem depender do profissional.
// Lê só o campo folha (leve).
export async function proximaFolhaBpaI(cnes: string, profCns: string, competencia: string): Promise<number> {
  if (!supabase || !/^\d{7}$/.test(cnes) || !/^\d{6}$/.test(competencia)) return 1;
  try {
    let req = supabase.from("fichas")
      .select("f:dados->profFolha").is("excluida_em", null)
      .eq("tipo", "BPA-I").eq("cnes", cnes).eq("competencia", competencia);
    if (/^\d{15}$/.test(profCns)) req = req.eq("profissional_cns", profCns); // sequência por profissional
    const { data, error } = await req;
    if (error || !data) return 1;
    return data.reduce((m, r) => Math.max(m, folhaNum((r as { f: unknown }).f)), 0) + 1;
  } catch {
    return 1;
  }
}

// BPA-C: chave (CNES + competência) e, quando houver, o Nome do profissional (senão a unidade).
export async function proximaFolhaBpaC(cnes: string, competencia: string, profNome?: string): Promise<number> {
  if (!supabase || !/^\d{7}$/.test(cnes) || !/^\d{6}$/.test(competencia)) return 1;
  try {
    // Lê os DOIS campos de folha: `folha` (fichas digitadas guardam o State.folha) e
    // `folhaBase` (fichas importadas). Antes lia só `folhaBase` -> digitadas sempre davam 1.
    let req = supabase.from("fichas")
      .select("fa:dados->folha, fb:dados->folhaBase").is("excluida_em", null)
      .eq("tipo", "BPA-C").eq("cnes", cnes).eq("competencia", competencia);
    const nome = (profNome ?? "").trim();
    if (nome) req = req.eq("dados->>profNome", nome);
    const { data, error } = await req;
    if (error || !data) return 1;
    return data.reduce((m, r) => {
      const row = r as { fa: unknown; fb: unknown };
      return Math.max(m, folhaNum(row.fa), folhaNum(row.fb));
    }, 0) + 1;
  } catch {
    return 1;
  }
}

// ---------------- Assinatura de conteúdo (para duplicidade) ----------------

// Uma sequência (BPA-I) só conta se tiver procedimento OU CNS do paciente. Compara os
// campos de produção + identidade do paciente; ignora folha/seq e assinatura.
function seqSig(s: Record<string, unknown> | undefined): string | null {
  const proc = jc(s?.codProc);
  const pac = jc(s?.cnsPac);
  if (!proc && !pac) return null;
  return [
    jc(s?.dataAtend), proc, pac, String((s?.sexo as string) ?? ""), jc(s?.ibge), jc(s?.cid),
    jc(s?.idade), jc(s?.qtde), jc(s?.carater), jc(s?.autorizacao),
    String((s?.nomePac as string) ?? "").trim().toUpperCase(),
  ].join("¦");
}

// Assinatura da ficha BPA-I: CBO do profissional + conjunto (ordenado) das seqs preenchidas.
// Vazia ("") quando não há nenhuma seq preenchida (não faz sentido crivar duplicidade).
export function assinaturaBpaI(profCbo: unknown, seqs: unknown): string {
  const sigs = (Array.isArray(seqs) ? seqs : [])
    .map((s) => seqSig(s as Record<string, unknown>))
    .filter((x): x is string => x !== null)
    .sort();
  if (sigs.length === 0) return "";
  return jc(profCbo) + "»" + sigs.join("«");
}

// Uma linha (BPA-C) só conta se tiver procedimento. Compara CBO/procedimento/idade/quantidade.
function rowSig(r: Record<string, unknown> | undefined): string | null {
  const proc = jc(r?.procedimento);
  if (!proc) return null;
  return [jc(r?.cbo), proc, jc(r?.idade), jc(r?.quantidade)].join("¦");
}

export function assinaturaBpaC(rows: unknown): string {
  const sigs = (Array.isArray(rows) ? rows : [])
    .map((r) => rowSig(r as Record<string, unknown>))
    .filter((x): x is string => x !== null)
    .sort();
  return sigs.length === 0 ? "" : sigs.join("«");
}

// ---------------- Crivo de duplicidade ----------------

export interface FichaDuplicada { id: string; titulo: string; }

// Procura uma ficha BPA-I já salva com a MESMA assinatura (mesma chave: CNES/CNS/competência),
// excluindo a própria ficha em edição (idAtual). Retorna a primeira encontrada, ou null.
export async function acharDuplicataBpaI(
  cnes: string, profCns: string, competencia: string, assinatura: string, idAtual: string | null,
): Promise<FichaDuplicada | null> {
  if (!supabase || !assinatura || !/^\d{7}$/.test(cnes) || !/^\d{15}$/.test(profCns) || !/^\d{6}$/.test(competencia)) return null;
  try {
    const { data, error } = await supabase.from("fichas")
      .select("id, titulo, cbo:dados->profCbo, seqs:dados->seqs").is("excluida_em", null)
      .eq("tipo", "BPA-I").eq("cnes", cnes).eq("competencia", competencia).eq("profissional_cns", profCns);
    if (error || !data) return null;
    for (const r of data as { id: string; titulo: string; cbo: unknown; seqs: unknown }[]) {
      if (r.id === idAtual) continue;
      if (assinaturaBpaI(r.cbo, r.seqs) === assinatura) return { id: r.id, titulo: r.titulo };
    }
    return null;
  } catch {
    return null;
  }
}

// BPA-C: mesma chave (CNES + competência [+ Nome do profissional quando houver]).
export async function acharDuplicataBpaC(
  cnes: string, competencia: string, profNome: string | undefined, assinatura: string, idAtual: string | null,
): Promise<FichaDuplicada | null> {
  if (!supabase || !assinatura || !/^\d{7}$/.test(cnes) || !/^\d{6}$/.test(competencia)) return null;
  try {
    let req = supabase.from("fichas")
      .select("id, titulo, rows:dados->rows").is("excluida_em", null)
      .eq("tipo", "BPA-C").eq("cnes", cnes).eq("competencia", competencia);
    const nome = (profNome ?? "").trim();
    if (nome) req = req.eq("dados->>profNome", nome);
    const { data, error } = await req;
    if (error || !data) return null;
    for (const r of data as { id: string; titulo: string; rows: unknown }[]) {
      if (r.id === idAtual) continue;
      if (assinaturaBpaC(r.rows) === assinatura) return { id: r.id, titulo: r.titulo };
    }
    return null;
  } catch {
    return null;
  }
}
