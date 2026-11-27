// "O que pede atenção" na Central de Relatórios: 5 destaques, cada um calculado de forma
// INDEPENDENTE (a tela dispara todos em paralelo e mostra cada um quando chega; se um falhar,
// só ele avisa). Resultados guardados em memória por período/unidade p/ não recalcular ao voltar.
import { coletarErros, type CategoriaErro } from "./erros";
import { carregarInativos } from "./inativos";
import { carregarCadastrosIncompletos } from "./cadastros";
import { carregarResumoFpo } from "@/lib/fpo/fpo";
import { carregarSerieAgregada, carregarNomesProcedimentos } from "@/lib/dashboard-producao";
import { mesesNoIntervalo } from "./erros";

const cache = new Map<string, Promise<unknown>>();
function memo<T>(chave: string, fn: () => Promise<T>): Promise<T> {
  const c = cache.get(chave);
  if (c) return c as Promise<T>;
  const p = fn().catch((e) => {
    cache.delete(chave);
    throw e;
  });
  cache.set(chave, p);
  return p;
}
export const limparCacheDestaques = () => cache.clear();

const TODAS_CATS: CategoriaErro[] = [
  "producao-sigtap",
  "ficha-incompleta",
  "paciente-revisao",
  "duplicidade",
  "tfd-sem-profissional",
  "municipio-uf",
  "sem-cbo-proc-qtd",
];

export async function destaqueErros(de: string, ate: string, cnes: string[]) {
  return memo(`erros|${de}|${ate}|${cnes.join(",")}`, async () => {
    const itens = await coletarErros({ de, ate, categorias: new Set(TODAS_CATS), cnes });
    const erros = itens.filter((e) => e.gravidade === "erro");
    const porDesc = new Map<string, number>();
    for (const e of erros) {
      const chave = e.descricao
        .replace(/^Seq\. \d+: /, "")
        .replace(/^"[^"]*" — /, "")
        .split(/[.(]/)[0]
        .trim();
      porDesc.set(chave, (porDesc.get(chave) ?? 0) + 1);
    }
    const principais = [...porDesc.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d]) => d);
    return { total: erros.length, principais };
  });
}

export async function destaqueInativos(
  de: string,
  ate: string,
  cnes: string[],
  nomes: Record<string, string>,
) {
  return memo(`inativos|${de}|${ate}|${cnes.join(",")}`, async () => {
    const r = await carregarInativos({
      cnesList: cnes,
      nomesUnidade: nomes,
      competencia: de,
      mesesReferencia: mesesNoIntervalo(de, ate),
      janelaMeses: 3,
      incluirRosterSemProducao: false,
    });
    const porUnidade = new Map<string, number>();
    for (const x of r.rows)
      porUnidade.set(x.nomeUnidade || x.cnes, (porUnidade.get(x.nomeUnidade || x.cnes) ?? 0) + 1);
    const maior = [...porUnidade.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    return { total: r.rows.length, maiorUnidade: maior ? { nome: maior[0], n: maior[1] } : null };
  });
}

export async function destaqueFpo(ate: string, cnes: string[], nomes: Record<string, string>) {
  return memo(`fpo|${ate}|${cnes.join(",")}`, async () => {
    const r = await carregarResumoFpo(cnes, ate);
    const comPct = r
      .filter((u) => u.tetoRS > 0)
      .map((u) => ({ ...u, pct: u.produzidoRS / u.tetoRS }));
    const maior = comPct.sort((a, b) => b.pct - a.pct)[0] ?? null;
    return {
      unidades: r.length,
      maior: maior
        ? { nome: nomes[maior.cnes] || maior.cnes, pct: maior.pct, estourados: maior.estourados }
        : null,
    };
  });
}

export async function destaqueCadastros(de: string, ate: string, cnesSel: Set<string>) {
  return memo(`cad|${de}|${ate}|${[...cnesSel].join(",")}`, async () => {
    const r = await carregarCadastrosIncompletos(de, ate, cnesSel);
    return {
      total: r.incompletos.length,
      semDoc: r.incompletos.filter((p) => p.faltam.includes("documento")).length,
      atendidos: r.atendidos,
    };
  });
}

// Tendência: total do período × período anterior de mesmo tamanho (pela série somada e guardada
// no banco — rápida) e a maior queda por procedimento.
export async function destaqueTendencia(
  de: string,
  ate: string,
  antDe: string,
  antAte: string,
  cnesSel: Set<string>,
) {
  return memo(`tend|${de}|${ate}|${[...cnesSel].join(",")}`, async () => {
    const [atual, ant] = await Promise.all([
      carregarSerieAgregada(de, ate),
      carregarSerieAgregada(antDe, antAte),
    ]);
    if (!atual || !ant) throw new Error("série indisponível");
    const filtra = <T extends { cnes: string | null }>(xs: T[]) =>
      cnesSel.size ? xs.filter((x) => cnesSel.has(x.cnes ?? "")) : xs;
    const somaPorProc = (xs: { procedimento: string; quantidade: number }[]) => {
      const m = new Map<string, number>();
      for (const x of xs) m.set(x.procedimento, (m.get(x.procedimento) ?? 0) + x.quantidade);
      return m;
    };
    const a = filtra(atual),
      b = filtra(ant);
    const totA = a.reduce((s, x) => s + x.quantidade, 0),
      totB = b.reduce((s, x) => s + x.quantidade, 0);
    const pa = somaPorProc(a),
      pb = somaPorProc(b);
    let pior: { proc: string; pct: number } | null = null;
    for (const [proc, vb] of pb) {
      if (vb < 20) continue; // ignora procedimentos pequenos (variação sem significado)
      const pct = ((pa.get(proc) ?? 0) - vb) / vb;
      if (!pior || pct < pior.pct) pior = { proc, pct };
    }
    let piorNome: string | null = null;
    if (pior && pior.pct < 0)
      piorNome = (await carregarNomesProcedimentos([pior.proc]))[pior.proc] ?? pior.proc;
    return {
      total: totA,
      anterior: totB,
      pct: totB > 0 ? (totA - totB) / totB : null,
      maiorQueda:
        pior && pior.pct < 0
          ? { proc: pior.proc, nome: piorNome ?? pior.proc, pct: pior.pct }
          : null,
    };
  });
}
