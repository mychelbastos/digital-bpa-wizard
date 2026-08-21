import { jsPDF } from "jspdf";
import { carimbarRodapeSpa } from "@/lib/spa-emblem-pdf";
import { paletaRelatorio } from "@/lib/relatorio-cor";
import type { ProducaoBpaRow } from "@/lib/dashboard-producao";

// Relatórios de PRODUÇÃO (BPA-I/BPA-C) a partir das linhas achatadas do dashboard
// (view producao_dashboard, sem PII de paciente). Dois formatos:
//   - CSV: todas as linhas filtradas (o "baixar tudo, filtrando por tudo").
//   - PDF (timbre da prefeitura): resumo + tabela agregada por procedimento.

const compLabel = (c: string | null | undefined) =>
  c && /^\d{6}$/.test(c) ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : (c ?? "");
const int = (n: number) => n.toLocaleString("pt-BR");

export interface MapasNome {
  nomeProc: (c: string) => string | null;
  rotuloCid: (c: string | null) => string;
  nomeCbo: (c: string | null) => string | null;
  nomeCarater: (c: string | null) => string | null;
}

// ---------------- CSV (linhas cruas filtradas) ----------------
export function csvProducao(rows: ProducaoBpaRow[], m: MapasNome): string {
  const cols = [
    "Tipo", "Competência", "Mês produção", "CNES", "Estabelecimento",
    "CNS profissional", "Profissional", "CBO", "Ocupação",
    "Procedimento", "Descrição procedimento", "Quantidade",
    "Serviço", "Classificação", "CID", "Descrição CID", "Caráter", "Idade",
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = rows.map((r) => [
    r.tipo, compLabel(r.competencia), compLabel(r.mes_producao), r.cnes ?? "", r.estabelecimento_nome ?? "",
    r.profissional_cns ?? "", r.profissional_nome ?? "", r.cbo ?? "", m.nomeCbo(r.cbo) ?? "",
    r.procedimento, m.nomeProc(r.procedimento) ?? "", r.quantidade,
    r.servico ?? "", r.classificacao ?? "", r.cid ?? "", r.cid ? m.rotuloCid(r.cid) : "",
    r.carater ?? "", r.idade ?? "",
  ].map(esc).join(";"));
  // BOM + CRLF p/ abrir certinho no Excel brasileiro.
  return "﻿" + [cols.join(";"), ...linhas].join("\r\n");
}

export function baixarCsv(nome: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------- PDF (timbre) ----------------
const CINZA: [number, number, number] = [107, 114, 128];
const ESCURO: [number, number, number] = [31, 41, 55];

export interface DadosRelatorioProducao {
  rows: ProducaoBpaRow[];
  mapas: MapasNome;
  competenciaMes: string;      // mês de produção selecionado (AAAAMM)
  filtros: string;             // resumo dos filtros ativos (subtítulo)
  logo?: string | null;
  cor?: string | null;         // cor de destaque da org (hex); null = verde padrão
  responsavel?: string | null;
  geradoEm?: Date;
}

interface Col { titulo: string; w: number; align: "left" | "right" }
const COLS: Col[] = [
  { titulo: "Procedimento", w: 360, align: "left" },
  { titulo: "Código", w: 90, align: "left" },
  { titulo: "Atendimentos", w: 110, align: "right" },
  { titulo: "Quantidade", w: 110, align: "right" },
];

export function construirPdfProducao(d: DadosRelatorioProducao): jsPDF {
  const { rows, mapas } = d;
  const { accent: VERDE, accentClaro: VERDE_CLARO } = paletaRelatorio(d.cor);
  const geradoEm = d.geradoEm ?? new Date();
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 30;
  const totalW = COLS.reduce((a, c) => a + c.w, 0);
  const x0 = M;

  // Agrega por procedimento.
  const mapa = new Map<string, { cod: string; nome: string; qtd: number; atend: number }>();
  for (const r of rows) {
    const a = mapa.get(r.procedimento) ?? { cod: r.procedimento, nome: mapas.nomeProc(r.procedimento) || r.procedimento, qtd: 0, atend: 0 };
    a.qtd += r.quantidade; a.atend += 1; mapa.set(r.procedimento, a);
  }
  const agg = [...mapa.values()].sort((a, b) => b.qtd - a.qtd);
  const totalQtd = rows.reduce((s, r) => s + r.quantidade, 0);
  const totalAtend = rows.length;
  const bpaC = rows.filter((r) => r.tipo === "BPA-C").reduce((s, r) => s + r.quantidade, 0);
  const bpaI = rows.filter((r) => r.tipo === "BPA-I").reduce((s, r) => s + r.quantidade, 0);
  const raas = rows.filter((r) => r.tipo === "RAAS").reduce((s, r) => s + r.quantidade, 0);

  const fit = (txt: string, maxW: number, size: number) => {
    pdf.setFontSize(size);
    if (pdf.getTextWidth(txt) <= maxW) return txt;
    let s = txt;
    while (s.length > 1 && pdf.getTextWidth(s + "…") > maxW) s = s.slice(0, -1);
    return s + "…";
  };
  const cell = (txt: string, x: number, y: number, col: Col, size: number) => {
    const t = fit(txt, col.w - 8, size);
    if (col.align === "right") pdf.text(t, x + col.w - 4, y, { align: "right" });
    else pdf.text(t, x + 4, y);
  };

  let pagina = 0;
  const cabecalhoPagina = () => {
    if (pagina > 0) pdf.addPage();
    pagina++;
    pdf.setFillColor(...VERDE);
    pdf.rect(0, 0, W, 54, "F");
    let reservaDir = 0;
    if (d.logo) {
      try {
        const lh = 34, lw = lh * 3.21;
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(W - M - lw - 6, 10, lw + 12, lh + 6, 3, 3, "F");
        pdf.addImage(d.logo, "PNG", W - M - lw, 13, lw, lh);
        reservaDir = lw + 20;
      } catch { /* logo inválida */ }
    }
    const xDir = W - M - reservaDir;
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(15);
    pdf.text("Relatório de Produção", M, 26);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    pdf.text(`Mês de produção ${compLabel(d.competenciaMes)}`, M, 42);
    pdf.setFontSize(8);
    pdf.text(`Gerado em ${geradoEm.toLocaleDateString("pt-BR")} ${geradoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, xDir, 26, { align: "right" });
    pdf.text(`Página ${pagina}`, xDir, 42, { align: "right" });
    // Filtros
    pdf.setTextColor(...CINZA); pdf.setFontSize(8);
    pdf.text(fit(d.filtros || "Sem filtros (tudo)", W - 2 * M, 8), M, 70);
    return 84;
  };

  const desenharResumo = (yTop: number) => {
    const chips = [
      { label: "Procedimentos", valor: int(totalQtd) },
      { label: "Atendimentos", valor: int(totalAtend) },
      { label: "BPA-C", valor: int(bpaC) },
      { label: "BPA-I", valor: int(bpaI) },
      // RAAS só entra no resumo quando há produção RAAS no recorte (senão mantém 4 chips).
      ...(raas > 0 ? [{ label: "RAAS", valor: int(raas) }] : []),
    ];
    const gap = 10;
    const cw = (totalW - gap * (chips.length - 1)) / chips.length;
    chips.forEach((ch, i) => {
      const cx = x0 + i * (cw + gap);
      pdf.setFillColor(...VERDE_CLARO);
      pdf.roundedRect(cx, yTop, cw, 40, 4, 4, "F");
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...CINZA);
      pdf.text(ch.label.toUpperCase(), cx + 8, yTop + 15);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(...VERDE);
      pdf.text(ch.valor, cx + 8, yTop + 32);
    });
    return yTop + 40 + 16;
  };

  const cabecalhoTabela = (y: number) => {
    pdf.setFillColor(...ESCURO);
    pdf.rect(x0, y, totalW, 20, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
    let x = x0;
    for (const col of COLS) { cell(col.titulo, x, y + 13, col, 8); x += col.w; }
    return y + 20;
  };

  let y = cabecalhoPagina();
  y = desenharResumo(y);
  y = cabecalhoTabela(y);

  const rodapeLimite = H - 40;
  pdf.setFont("helvetica", "normal");
  agg.forEach((r, i) => {
    if (y + 16 > rodapeLimite) { y = cabecalhoPagina(); y = cabecalhoTabela(y); }
    if (i % 2 === 1) { pdf.setFillColor(247, 248, 250); pdf.rect(x0, y, totalW, 16, "F"); }
    pdf.setTextColor(...ESCURO); pdf.setFontSize(8);
    const vals = [r.nome, r.cod, int(r.atend), int(r.qtd)];
    let x = x0;
    COLS.forEach((col, ci) => { cell(vals[ci], x, y + 11, col, 8); x += col.w; });
    pdf.setDrawColor(230, 232, 236); pdf.line(x0, y + 16, x0 + totalW, y + 16);
    y += 16;
  });

  // Total — mantém o fecho junto: TOTAL + nota + assinatura formam um bloco único. Se ele
  // não couber no que resta da página, leva tudo para a próxima (evita a assinatura sozinha
  // numa folha, sem nenhum conteúdo acima dela).
  const alturaFecho = 28 /*total*/ + 12 /*nota*/ + 80 /*assinatura*/;
  if (y + alturaFecho > H - 20) { y = cabecalhoPagina(); y = cabecalhoTabela(y); }
  pdf.setFillColor(...VERDE_CLARO); pdf.rect(x0, y, totalW, 18, "F");
  pdf.setFont("helvetica", "bold"); pdf.setTextColor(...ESCURO);
  const totVals = ["TOTAL", "", int(totalAtend), int(totalQtd)];
  let xt = x0;
  COLS.forEach((col, ci) => { cell(totVals[ci], xt, y + 12, col, 8); xt += col.w; });
  y += 28;

  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...CINZA);
  if (y + 12 < rodapeLimite) pdf.text(`${agg.length} procedimento(s) distinto(s).`, M, y);

  // Assinatura
  if (y + 78 > H - 20) y = cabecalhoPagina();
  const sy = y + 48; const cx = W / 2; const lw = 300;
  pdf.setDrawColor(...ESCURO); pdf.setLineWidth(0.7);
  pdf.line(cx - lw / 2, sy, cx + lw / 2, sy);
  if (d.responsavel) {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(...ESCURO);
    pdf.text(fit(d.responsavel, lw, 10), cx, sy + 14, { align: "center" });
  }
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...CINZA);
  pdf.text("Assinatura do responsável", cx, sy + (d.responsavel ? 26 : 14), { align: "center" });

  carimbarRodapeSpa(pdf);
  return pdf;
}
