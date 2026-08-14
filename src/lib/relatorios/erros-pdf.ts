import { jsPDF } from "jspdf";
import { desenharCabecalhoPdf } from "@/lib/relatorio-comum";
import { carimbarRodapeSpa } from "@/lib/spa-emblem-pdf";
import { ROTULO_CATEGORIA, type ErroItem } from "./erros";

const compLabel = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : c);

export function csvErros(itens: ErroItem[]): string {
  const cols = ["Categoria", "Gravidade", "Tipo", "Competência", "CNES", "Profissional", "Procedimento", "Descrição", "Ficha"];
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linhas = itens.map((e) => [
    ROTULO_CATEGORIA[e.categoria], e.gravidade, e.tipo, compLabel(e.competencia), e.cnes, e.profissional, e.procedimento, e.descricao, e.fichaId ?? "",
  ].map(esc).join(";"));
  return "﻿" + [cols.join(";"), ...linhas].join("\r\n");
}

interface Col { titulo: string; w: number }
const COLS: Col[] = [
  { titulo: "Categoria", w: 92 },
  { titulo: "Grav.", w: 40 },
  { titulo: "Tipo", w: 42 },
  { titulo: "CNES", w: 54 },
  { titulo: "Profissional", w: 120 },
  { titulo: "Proc.", w: 66 },
  { titulo: "Descrição", w: 0 }, // resto
];

export function construirPdfErros(d: { itens: ErroItem[]; subtitulo: string; logo?: string | null; geradoEm?: Date }): jsPDF {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margem = 32;
  const largura = pdf.internal.pageSize.getWidth();
  const altura = pdf.internal.pageSize.getHeight();
  const dispon = largura - margem * 2;
  const fixas = COLS.reduce((a, c) => a + c.w, 0);
  const cols = COLS.map((c) => ({ ...c, w: c.titulo === "Descrição" ? dispon - fixas : c.w }));
  const xDe = (i: number) => margem + cols.slice(0, i).reduce((a, c) => a + c.w, 0);

  let y = desenharCabecalhoPdf(pdf, { logo: d.logo, titulo: "Relatório de erros / crivo", subtitulo: d.subtitulo, geradoEm: d.geradoEm ?? new Date() });

  const cabecalho = () => {
    pdf.setFillColor(240, 240, 240); pdf.rect(margem, y - 10, dispon, 16, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(70);
    cols.forEach((c, i) => pdf.text(c.titulo.toUpperCase(), xDe(i) + 2, y));
    pdf.setTextColor(0); y += 12;
  };
  cabecalho();
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);

  for (const e of d.itens) {
    const desc = pdf.splitTextToSize(e.descricao, cols[6].w - 4) as string[];
    const linhaH = Math.max(13, desc.length * 9 + 4);
    if (y + linhaH > altura - margem - 20) { pdf.addPage(); y = margem + 8; cabecalho(); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); }
    if (e.gravidade === "erro") pdf.setTextColor(190, 40, 60); else pdf.setTextColor(120, 90, 10);
    pdf.text(e.gravidade === "erro" ? "ERRO" : "AVISO", xDe(1) + 2, y);
    pdf.setTextColor(30);
    const cells = [ROTULO_CATEGORIA[e.categoria], "", e.tipo, e.cnes, e.profissional, e.procedimento];
    cells.forEach((c, i) => { if (i === 1) return; pdf.text(pdf.splitTextToSize(String(c), cols[i].w - 4)[0] ?? "", xDe(i) + 2, y); });
    desc.forEach((ln, li) => pdf.text(ln, xDe(6) + 2, y + li * 9));
    y += linhaH;
    pdf.setDrawColor(235); pdf.line(margem, y - linhaH + 3 + linhaH - 4, margem + dispon, y - 4);
  }

  y += 6; pdf.setDrawColor(160); pdf.line(margem, y - 6, margem + dispon, y - 6);
  const nErros = d.itens.filter((e) => e.gravidade === "erro").length;
  const nAvisos = d.itens.length - nErros;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9.5); pdf.setTextColor(0);
  pdf.text(`Total: ${d.itens.length}  ·  ${nErros} erro(s)  ·  ${nAvisos} aviso(s)`, margem, y + 6);
  carimbarRodapeSpa(pdf);
  return pdf;
}
