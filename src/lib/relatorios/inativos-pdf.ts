import { jsPDF } from "jspdf";
import { desenharCabecalhoPdf } from "@/lib/relatorio-comum";
import { carimbarRodapeSpa } from "@/lib/spa-emblem-pdf";
import type { ProfInativoRow } from "./inativos";

const compLabel = (c: string | null) => (c && /^\d{6}$/.test(c) ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : "—");
const situacaoLabel = (s: ProfInativoRow["situacao"]) => (s === "sumiu" ? "Sem produção no mês" : "Nunca lançou produção");
const ocupacao = (r: ProfInativoRow) => r.cboLabel || "Não identificado";

export function csvInativos(rows: ProfInativoRow[]): string {
  const cols = ["Situação", "Profissional", "CNS", "Unidade", "CNES", "Ocupação (CBO)", "Último mês com produção", "Qtd no período anterior"];
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linhas = rows.map((r) => [
    situacaoLabel(r.situacao), r.nome, r.cns, r.nomeUnidade, r.cnes, ocupacao(r), compLabel(r.ultimoMes), r.qtdPeriodo,
  ].map(esc).join(";"));
  return "﻿" + [cols.join(";"), ...linhas].join("\r\n");
}

interface Col { titulo: string; w: number }
const COLS: Col[] = [
  { titulo: "Situação", w: 96 },
  { titulo: "Profissional", w: 150 },
  { titulo: "CNS", w: 96 },
  { titulo: "Unidade", w: 0 }, // resto
  { titulo: "Ocupação (CBO)", w: 150 },
  { titulo: "Últ. prod.", w: 52 },
  { titulo: "Qtd ant.", w: 46 },
];

export function construirPdfInativos(d: { rows: ProfInativoRow[]; subtitulo: string; logo?: string | null; geradoEm?: Date }): jsPDF {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margem = 32;
  const largura = pdf.internal.pageSize.getWidth();
  const altura = pdf.internal.pageSize.getHeight();
  const dispon = largura - margem * 2;
  const fixas = COLS.reduce((a, c) => a + c.w, 0);
  const cols = COLS.map((c) => ({ ...c, w: c.titulo === "Unidade" ? dispon - fixas : c.w }));
  const xDe = (i: number) => margem + cols.slice(0, i).reduce((a, c) => a + c.w, 0);

  let y = desenharCabecalhoPdf(pdf, { logo: d.logo, titulo: "Profissionais sem produção", subtitulo: d.subtitulo, geradoEm: d.geradoEm ?? new Date() });

  const cabecalho = () => {
    pdf.setFillColor(240, 240, 240); pdf.rect(margem, y - 10, dispon, 16, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(70);
    cols.forEach((c, i) => pdf.text(c.titulo.toUpperCase(), xDe(i) + 2, y));
    pdf.setTextColor(0); y += 12;
  };
  cabecalho();
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);

  for (const r of d.rows) {
    const uni = pdf.splitTextToSize(`${r.nomeUnidade}`, cols[3].w - 4) as string[];
    const linhaH = Math.max(13, uni.length * 9 + 4);
    if (y + linhaH > altura - margem - 20) { pdf.addPage(); y = margem + 8; cabecalho(); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); }
    if (r.situacao === "sumiu") pdf.setTextColor(150, 70, 10); else pdf.setTextColor(110);
    pdf.text(r.situacao === "sumiu" ? "SEM PROD." : "NUNCA", xDe(0) + 2, y);
    pdf.setTextColor(30);
    const cells = [
      "", pdf.splitTextToSize(r.nome, cols[1].w - 4)[0] ?? "", r.cns, "",
      pdf.splitTextToSize(ocupacao(r), cols[4].w - 4)[0] ?? "",
      compLabel(r.ultimoMes), String(r.qtdPeriodo || 0),
    ];
    cells.forEach((c, i) => { if (i === 0 || i === 3) return; pdf.text(String(c), xDe(i) + 2, y); });
    uni.forEach((ln, li) => pdf.text(ln, xDe(3) + 2, y + li * 9));
    y += linhaH;
    pdf.setDrawColor(235); pdf.line(margem, y - 4, margem + dispon, y - 4);
  }

  y += 6; pdf.setDrawColor(160); pdf.line(margem, y - 6, margem + dispon, y - 6);
  const sumiu = d.rows.filter((r) => r.situacao === "sumiu").length;
  const nunca = d.rows.length - sumiu;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9.5); pdf.setTextColor(0);
  pdf.text(`Total: ${d.rows.length}  ·  ${sumiu} sem produção no mês  ·  ${nunca} nunca lançaram`, margem, y + 6);
  carimbarRodapeSpa(pdf);
  return pdf;
}
