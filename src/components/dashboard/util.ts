// Utilitários da dashboard (movidos do index.tsx no redesign v2 — mesma lógica).
import type { ProducaoBpaRow } from "@/lib/dashboard-producao";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";

const CARATER_NOME = new Map(CARATERES.map((c) => [c.code, c.label]));
export const nomeCarater = (code: string | null) =>
  code ? (CARATER_NOME.get(code) ?? null) : null;

const MESES_CURTOS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
const MESES_LONGOS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const mesLabel = (comp: string) => {
  if (comp.length !== 6) return comp;
  const mes = MESES_CURTOS[Number(comp.slice(4, 6)) - 1] ?? comp.slice(4, 6);
  return `${mes}/${comp.slice(0, 4)}`;
};
export const mesExtenso = (comp: string) =>
  comp.length === 6
    ? `${MESES_LONGOS[Number(comp.slice(4, 6)) - 1] ?? comp.slice(4, 6)}/${comp.slice(0, 4)}`
    : comp;
export const mesCurtoMin = (comp: string) =>
  (MESES_CURTOS[Number(comp.slice(4, 6)) - 1] ?? "").toLowerCase();

// Soma meses a uma competência AAAAMM.
export function somarMes(comp: string, n: number): string {
  const a = Number(comp.slice(0, 4)),
    m = Number(comp.slice(4, 6)) - 1 + n;
  const ano = a + Math.floor(m / 12),
    mes = ((m % 12) + 12) % 12;
  return `${ano}${String(mes + 1).padStart(2, "0")}`;
}

export const nomeOuCodigo = (nome: string | null, codigo: string | null) =>
  nome?.trim() || codigo || "Não informado";
// Chave de agrupamento de "profissional": CNS (BPA-I) → nome (BPA-C v3, controle interno do
// painel) → CBO (fallback p/ fichas BPA-C antigas sem nome). Mantém profissionais distintos
// separados mesmo quando compartilham o CBO.
export const chaveProfissional = (
  r: Pick<ProducaoBpaRow, "profissional_cns" | "profissional_nome" | "cbo">,
) => r.profissional_cns || r.profissional_nome || r.cbo || "sem-profissional";

export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];
// Cores fixas por tipo de produção (v2).
export const COR_SERIE: Record<"BPA-C" | "BPA-I" | "RAAS", string> = {
  "BPA-C": "#257DE0",
  "BPA-I": "#F47230",
  RAAS: "#00B894",
};

export const brlFmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const intFmt = (n: number) => Math.round(n).toLocaleString("pt-BR");

export interface Agrupado<T extends string = string> {
  key: T;
  name: string;
  quantidade: number;
  atendimentos: number;
}
export function agrupar<T extends string>(
  rows: ProducaoBpaRow[],
  key: (r: ProducaoBpaRow) => T,
  label: (r: ProducaoBpaRow) => string,
): Agrupado<T>[] {
  const map = new Map<T, Agrupado<T>>();
  for (const r of rows) {
    const k = key(r);
    const atual = map.get(k) ?? { key: k, name: label(r), quantidade: 0, atendimentos: 0 };
    // Nome "melhor" ganha: se o já guardado é só o código (== chave) e uma linha
    // posterior trouxe um nome de verdade, adota o nome. Necessário no RAAS importado,
    // onde algumas fichas vêm sem `estabelecimentoNome` e outras com "CAPS RUY BARBOSA".
    const novo = label(r);
    if (atual.name === String(k) && novo && novo !== String(k)) atual.name = novo;
    atual.quantidade += r.quantidade;
    atual.atendimentos += 1;
    map.set(k, atual);
  }
  return [...map.values()].sort((a, b) => b.quantidade - a.quantidade);
}

export const iniciais = (nome: string) => {
  const p = nome
    .trim()
    .split(/\s+/)
    .filter((x) => x && !/^(de|da|do|dos|das|e)$/i.test(x));
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
};
