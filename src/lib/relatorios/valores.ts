// Valores (R$) da produção pela FPO: o valor unitário vigente de um procedimento numa unidade
// num mês é o `valor_unitario` do teto com a MAIOR competência ≤ ao mês (mesma regra de
// vigência de carregarResumoFpo). Funções puras (testadas em valores.test.ts).
//
// Regras do "Montar relatório":
//  • Valor total = Σ (quantidade × valor vigente) LINHA A LINHA (por CNES e mês) — nunca
//    "total × média".
//  • Linhas sem teto vigente ficam FORA do total em R$ (contadas em `qtdSemValor`).
//  • Valor unitário exibido = média PONDERADA pela quantidade das linhas com valor; se o valor
//    variar entre unidades/meses, `varia = true` (a tela mostra o ícone "varia por unidade/mês").

export interface TetoValor {
  cnes: string;
  procedimento: string;
  competencia: string; // AAAAMM
  valor_unitario: number;
}

// Índice (cnes|procedimento) → tetos ordenados por competência crescente.
export type IndiceTetos = Map<string, { competencia: string; valor: number }[]>;

export function indexarTetos(tetos: TetoValor[]): IndiceTetos {
  const idx: IndiceTetos = new Map();
  for (const t of tetos) {
    if (!t.cnes || !t.procedimento || !/^\d{6}$/.test(t.competencia)) continue;
    const k = `${t.cnes}|${t.procedimento}`;
    const arr = idx.get(k) ?? [];
    arr.push({ competencia: t.competencia, valor: Number(t.valor_unitario) || 0 });
    idx.set(k, arr);
  }
  for (const arr of idx.values()) arr.sort((a, b) => a.competencia.localeCompare(b.competencia));
  return idx;
}

// Valor unitário vigente (maior competência ≤ mês) ou null se não há teto vigente.
export function valorVigente(
  idx: IndiceTetos,
  cnes: string | null | undefined,
  procedimento: string,
  mes: string | null | undefined,
): number | null {
  if (!cnes || !mes) return null;
  const arr = idx.get(`${cnes}|${procedimento}`);
  if (!arr) return null;
  let achado: number | null = null;
  for (const t of arr) {
    if (t.competencia <= mes) achado = t.valor;
    else break;
  }
  return achado;
}

export interface LinhaValorizavel {
  cnes: string | null;
  procedimento: string;
  mes: string | null; // mês de produção (AAAAMM)
  quantidade: number;
}

export interface ResumoValor {
  valorTotal: number; // Σ qtd × valor (só linhas com valor)
  qtdComValor: number;
  qtdSemValor: number; // quantidade fora do total em R$
  unitarioMedio: number | null; // média ponderada (null se nenhuma linha com valor)
  varia: boolean; // o valor unitário muda entre as linhas (unidade/mês)
}

export function resumirValor(linhas: LinhaValorizavel[], idx: IndiceTetos): ResumoValor {
  let valorTotal = 0,
    qtdComValor = 0,
    qtdSemValor = 0;
  let primeiro: number | null = null;
  let varia = false;
  for (const l of linhas) {
    const v = valorVigente(idx, l.cnes, l.procedimento, l.mes);
    if (v === null) {
      qtdSemValor += l.quantidade;
      continue;
    }
    valorTotal += l.quantidade * v;
    qtdComValor += l.quantidade;
    if (primeiro === null) primeiro = v;
    else if (Math.abs(v - primeiro) > 0.000001) varia = true;
  }
  return {
    valorTotal,
    qtdComValor,
    qtdSemValor,
    unitarioMedio: qtdComValor > 0 ? valorTotal / qtdComValor : null,
    varia,
  };
}

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
