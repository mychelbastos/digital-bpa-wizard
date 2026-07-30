// Lógica do relatório de TFD (agrupamentos, colunas/dados, CSV) — extraída para ser usada
// tanto na tela do TFD quanto na página Relatórios, sem duplicar a regra.
import type { TfdRelatorioRow, TfdStatus } from "@/lib/tfd/tfd";

const compLabel = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : c);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type AgrupamentoRel = "detalhado" | "competencia" | "paciente" | "profissional" | "destino";
export const AGRUPAMENTOS: { valor: AgrupamentoRel; rotulo: string }[] = [
  { valor: "detalhado", rotulo: "Detalhado (um por TFD)" },
  { valor: "competencia", rotulo: "Por competência (mês)" },
  { valor: "paciente", rotulo: "Por paciente" },
  { valor: "profissional", rotulo: "Por profissional (faturamento)" },
  { valor: "destino", rotulo: "Por destino" },
];
export const STATUS_ROTULO: Record<TfdStatus, string> = {
  agendada: "Agendada", realizada: "Realizada", faturada: "Faturada", cancelada: "Cancelada",
};

export interface RelatorioTfdMontado {
  colunas: string[];
  dados: string[][];
  totalRS: number;
  totalViagens: number;
  totalTfd: number;
}

// Aplica o filtro de status e monta colunas/linhas conforme o agrupamento (mesma regra da
// tela do TFD).
export function montarRelatorioTfd(rows: TfdRelatorioRow[], status: "" | TfdStatus, agrup: AgrupamentoRel): RelatorioTfdMontado {
  const filtradas = status ? rows.filter((r) => r.status === status) : rows;
  const viagensDe = (r: TfdRelatorioRow) => r.qtd_com_pernoite + r.qtd_sem_pernoite;
  const somaRS = filtradas.reduce((s, r) => s + r.total_rs, 0);
  const somaViag = filtradas.reduce((s, r) => s + viagensDe(r), 0);

  if (agrup === "detalhado") {
    return {
      colunas: ["Competência", "Paciente", "CNS", "Destino", "Profissional", "Viagens", "Status", "Total"],
      dados: filtradas.map((r) => [compLabel(r.competencia), r.paciente_nome ?? "—", r.paciente_cns ?? "", r.destino_descricao ?? "—", r.prof_nome ?? "—", String(viagensDe(r)), STATUS_ROTULO[r.status], brl(r.total_rs)]),
      totalRS: somaRS, totalViagens: somaViag, totalTfd: filtradas.length,
    };
  }
  const chave = (r: TfdRelatorioRow) =>
    agrup === "competencia" ? compLabel(r.competencia)
      : agrup === "paciente" ? (r.paciente_nome ?? "—")
        : agrup === "profissional" ? (r.prof_nome ?? "— (sem profissional)")
          : (r.destino_descricao ?? "—");
  const g = new Map<string, { qtd: number; viagens: number; total: number }>();
  for (const r of filtradas) {
    const k = chave(r);
    const cur = g.get(k) ?? { qtd: 0, viagens: 0, total: 0 };
    cur.qtd++; cur.viagens += viagensDe(r); cur.total += r.total_rs;
    g.set(k, cur);
  }
  const rotuloChave = agrup === "competencia" ? "Competência" : agrup === "paciente" ? "Paciente" : agrup === "profissional" ? "Profissional" : "Destino";
  return {
    colunas: [rotuloChave, "TFDs", "Viagens", "Total"],
    dados: [...g.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, v]) => [k, String(v.qtd), String(v.viagens), brl(v.total)]),
    totalRS: somaRS, totalViagens: somaViag, totalTfd: filtradas.length,
  };
}

export function csvTabela(colunas: string[], dados: string[][]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const linhas = [colunas, ...dados].map((l) => l.map((c) => esc(String(c))).join(";"));
  return "﻿" + linhas.join("\r\n");
}

export { compLabel as compLabelTfd, brl as brlTfd };
