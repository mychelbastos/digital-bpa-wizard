// Lógica do relatório de TFD (agrupamentos, colunas/dados, CSV) — extraída para ser usada
// tanto na tela do TFD quanto na página Relatórios, sem duplicar a regra.
import type { TfdRelatorioRow, TfdStatus } from "@/lib/tfd/tfd";
import { COD_TFD } from "@/lib/tfd/gerar-bpa-tfd";

const compLabel = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : c);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Os 6 procedimentos do TFD (código SIGTAP + rótulo), na ordem canônica. Fonte única —
// reusado na tela do TFD e no agrupamento "por procedimento".
export const CODIGOS_TFD: { codigo: string; rotulo: string }[] = [
  { codigo: COD_TFD.DESLOC_PAC, rotulo: "Deslocamento — paciente (cada 50 km)" },
  { codigo: COD_TFD.ALIM_PERNOITE_PAC, rotulo: "Alimentação c/ pernoite — paciente" },
  { codigo: COD_TFD.ALIM_SEM_PERNOITE_PAC, rotulo: "Alimentação s/ pernoite — paciente" },
  { codigo: COD_TFD.DESLOC_ACOMP, rotulo: "Deslocamento — acompanhante (cada 50 km)" },
  { codigo: COD_TFD.ALIM_PERNOITE_ACOMP, rotulo: "Alimentação c/ pernoite — acompanhante" },
  { codigo: COD_TFD.ALIM_SEM_PERNOITE_ACOMP, rotulo: "Alimentação s/ pernoite — acompanhante" },
];
const ROTULO_PROC = new Map(CODIGOS_TFD.map((c) => [c.codigo, c.rotulo]));
const ORDEM_PROC = CODIGOS_TFD.map((c) => c.codigo);

export type AgrupamentoRel = "detalhado" | "competencia" | "paciente" | "profissional" | "destino" | "procedimento";
export const AGRUPAMENTOS: { valor: AgrupamentoRel; rotulo: string }[] = [
  { valor: "detalhado", rotulo: "Detalhado (um por TFD)" },
  { valor: "procedimento", rotulo: "Por procedimento (produção)" },
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
  totalProducao: number; // qtd de procedimentos BPA-I gerados
  totalTfd: number;
}

// Aplica o filtro de status e monta colunas/linhas conforme o agrupamento (mesma regra da
// tela do TFD).
export function montarRelatorioTfd(rows: TfdRelatorioRow[], status: "" | TfdStatus, agrup: AgrupamentoRel): RelatorioTfdMontado {
  const filtradas = status ? rows.filter((r) => r.status === status) : rows;
  const viagensDe = (r: TfdRelatorioRow) => r.qtd_com_pernoite + r.qtd_sem_pernoite;
  const producaoDe = (r: TfdRelatorioRow) => r.linhas.reduce((s, l) => s + l.quantidade, 0);
  const somaRS = filtradas.reduce((s, r) => s + r.total_rs, 0);
  const somaViag = filtradas.reduce((s, r) => s + viagensDe(r), 0);
  const somaProd = filtradas.reduce((s, r) => s + producaoDe(r), 0);

  if (agrup === "detalhado") {
    return {
      colunas: ["Competência", "Paciente", "CNS", "Destino", "Profissional", "Viagens", "Produção", "Status", "Total"],
      dados: filtradas.map((r) => [compLabel(r.competencia), r.paciente_nome ?? "—", r.paciente_cns ?? "", r.destino_descricao ?? "—", r.prof_nome ?? "—", String(viagensDe(r)), String(producaoDe(r)), STATUS_ROTULO[r.status], brl(r.total_rs)]),
      totalRS: somaRS, totalViagens: somaViag, totalProducao: somaProd, totalTfd: filtradas.length,
    };
  }
  // Por procedimento: soma a QUANTIDADE de produção (procedimentos BPA-I gerados) por código.
  if (agrup === "procedimento") {
    const gp = new Map<string, { qtd: number; total: number }>();
    for (const r of filtradas) {
      for (const l of r.linhas) {
        if (!l.codigo) continue;
        const cur = gp.get(l.codigo) ?? { qtd: 0, total: 0 };
        cur.qtd += l.quantidade;
        cur.total += l.quantidade * l.valor_unitario;
        gp.set(l.codigo, cur);
      }
    }
    const linhasProc = [...gp.entries()].sort((a, b) => ORDEM_PROC.indexOf(a[0]) - ORDEM_PROC.indexOf(b[0]));
    return {
      colunas: ["Procedimento", "Código", "Quantidade", "Total"],
      dados: linhasProc.map(([cod, v]) => [ROTULO_PROC.get(cod) ?? cod, cod, String(v.qtd), brl(v.total)]),
      totalRS: somaRS, totalViagens: somaViag, totalProducao: somaProd, totalTfd: filtradas.length,
    };
  }
  const chave = (r: TfdRelatorioRow) =>
    agrup === "competencia" ? compLabel(r.competencia)
      : agrup === "paciente" ? (r.paciente_nome ?? "—")
        : agrup === "profissional" ? (r.prof_nome ?? "— (sem profissional)")
          : (r.destino_descricao ?? "—");
  const g = new Map<string, { qtd: number; viagens: number; producao: number; total: number }>();
  for (const r of filtradas) {
    const k = chave(r);
    const cur = g.get(k) ?? { qtd: 0, viagens: 0, producao: 0, total: 0 };
    cur.qtd++; cur.viagens += viagensDe(r); cur.producao += producaoDe(r); cur.total += r.total_rs;
    g.set(k, cur);
  }
  const rotuloChave = agrup === "competencia" ? "Competência" : agrup === "paciente" ? "Paciente" : agrup === "profissional" ? "Profissional" : "Destino";
  return {
    colunas: [rotuloChave, "TFDs", "Viagens", "Produção", "Total"],
    dados: [...g.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, v]) => [k, String(v.qtd), String(v.viagens), String(v.producao), brl(v.total)]),
    totalRS: somaRS, totalViagens: somaViag, totalProducao: somaProd, totalTfd: filtradas.length,
  };
}

export function csvTabela(colunas: string[], dados: string[][]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const linhas = [colunas, ...dados].map((l) => l.map((c) => esc(String(c))).join(";"));
  return "﻿" + linhas.join("\r\n");
}

export { compLabel as compLabelTfd, brl as brlTfd };
