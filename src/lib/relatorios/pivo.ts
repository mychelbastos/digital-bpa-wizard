// Pivô do "Montar relatório": agrupa as linhas da produção por uma dimensão (linhas) e,
// opcionalmente, divide por outra (colunas). Função pura — a tela, o CSV e o PDF usam o mesmo
// resultado, então o que se vê na prévia é exatamente o que sai.
import type { ProducaoBpaRow } from "@/lib/dashboard-producao";

export type DimLinha =
  "unidade" | "profissional" | "procedimento" | "cid" | "faixa" | "tipo" | "mes";
export type DimColuna = "nada" | "mes" | "tipo" | "unidade";
export type Medida = "proc" | "atend";

export const ROTULO_DIM: Record<DimLinha, string> = {
  unidade: "Unidade",
  profissional: "Profissional",
  procedimento: "Procedimento",
  cid: "CID",
  faixa: "Faixa etária",
  tipo: "Tipo",
  mes: "Mês",
};

export const chaveProfissional = (
  r: Pick<ProducaoBpaRow, "profissional_cns" | "profissional_nome" | "cbo">,
) => r.profissional_cns || r.profissional_nome || r.cbo || "sem-profissional";

export const FAIXAS = [
  "0–11 anos",
  "12–17 anos",
  "18–59 anos",
  "60 anos ou mais",
  "Sem idade",
] as const;
export function faixaEtaria(idade: number | null | undefined): string {
  if (idade === null || idade === undefined || Number.isNaN(idade)) return "Sem idade";
  if (idade <= 11) return "0–11 anos";
  if (idade <= 17) return "12–17 anos";
  if (idade <= 59) return "18–59 anos";
  return "60 anos ou mais";
}

export function chaveDim(dim: DimLinha | DimColuna, r: ProducaoBpaRow): string {
  switch (dim) {
    case "unidade":
      return r.cnes || "sem-cnes";
    case "profissional":
      return chaveProfissional(r);
    case "procedimento":
      return r.procedimento || "sem-procedimento";
    case "cid":
      return r.cid || "sem-cid";
    case "faixa":
      return faixaEtaria(r.idade);
    case "tipo":
      return r.tipo;
    case "mes":
      return r.mes_producao || "sem-mes";
    default:
      return "";
  }
}

export interface LinhaPivo {
  key: string;
  celulas: Record<string, number>;
  total: number; // na medida escolhida
  procs: number; // soma de quantidade
  atends: number; // nº de linhas
  fontes: ProducaoBpaRow[];
}

export interface Pivo {
  colunas: string[]; // chaves das colunas (vazio quando "nada")
  linhas: LinhaPivo[];
  totalPorColuna: Record<string, number>;
  total: number;
  procs: number;
  atends: number;
}

const ordemColuna = (dim: DimColuna, a: string, b: string) =>
  dim === "mes" || dim === "tipo" ? a.localeCompare(b) : 0;

export function montarPivo(
  rows: ProducaoBpaRow[],
  linhas: DimLinha,
  colunas: DimColuna,
  medida: Medida,
): Pivo {
  const valor = (r: ProducaoBpaRow) => (medida === "proc" ? r.quantidade : 1);
  const mapa = new Map<string, LinhaPivo>();
  const totCol: Record<string, number> = {};
  for (const r of rows) {
    const k = chaveDim(linhas, r);
    let l = mapa.get(k);
    if (!l) {
      l = { key: k, celulas: {}, total: 0, procs: 0, atends: 0, fontes: [] };
      mapa.set(k, l);
    }
    const v = valor(r);
    l.total += v;
    l.procs += r.quantidade;
    l.atends += 1;
    l.fontes.push(r);
    if (colunas !== "nada") {
      const c = chaveDim(colunas, r);
      l.celulas[c] = (l.celulas[c] ?? 0) + v;
      totCol[c] = (totCol[c] ?? 0) + v;
    }
  }
  const linhasArr = [...mapa.values()].sort(
    (a, b) => b.total - a.total || a.key.localeCompare(b.key),
  );
  let cols = Object.keys(totCol);
  cols =
    colunas === "unidade"
      ? cols.sort((a, b) => (totCol[b] ?? 0) - (totCol[a] ?? 0))
      : cols.sort((a, b) => ordemColuna(colunas, a, b));
  return {
    colunas: cols,
    linhas: linhasArr,
    totalPorColuna: totCol,
    total: linhasArr.reduce((s, l) => s + l.total, 0),
    procs: rows.reduce((s, r) => s + r.quantidade, 0),
    atends: rows.length,
  };
}

// Período anterior de mesmo tamanho (ex.: 202608–202610 → 202605–202607).
export function periodoAnterior(
  de: string,
  ate: string,
  somarMes: (c: string, n: number) => string,
): [string, string] {
  const n =
    (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 +
    (Number(ate.slice(4, 6)) - Number(de.slice(4, 6))) +
    1;
  return [somarMes(de, -n), somarMes(de, -1)];
}
