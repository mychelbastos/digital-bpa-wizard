import { jsPDF } from "jspdf";
import { carimbarRodapeSpa } from "@/lib/spa-emblem-pdf";
import { paletaRelatorio } from "@/lib/relatorio-cor";
import type { FpoComparacaoRow } from "./fpo";

// Relatório PDF do FPO × Produção de uma unidade/competência. jsPDF nativo (texto/retângulos),
// paisagem A4, tabela paginada com cabeçalho repetido — nítido e leve (sem rasterizar).

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (n: number) => n.toLocaleString("pt-BR");
const compLabel = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : c);

const CINZA: [number, number, number] = [107, 114, 128];
const ROSA: [number, number, number] = [190, 40, 60];
const ESCURO: [number, number, number] = [31, 41, 55];

interface Col { titulo: string; w: number; align: "left" | "right"; }
const COLS: Col[] = [
  { titulo: "Procedimento", w: 262, align: "left" },
  { titulo: "Código", w: 66, align: "left" },
  { titulo: "Teto", w: 44, align: "right" },
  { titulo: "Produz.", w: 50, align: "right" },
  { titulo: "Saldo", w: 46, align: "right" },
  { titulo: "Vlr unit.", w: 60, align: "right" },
  { titulo: "Teto R$", w: 76, align: "right" },
  { titulo: "Produzido R$", w: 78, align: "right" },
  { titulo: "Saldo R$", w: 80, align: "right" },
];

export interface DadosRelatorioFpo {
  nomeUnidade: string;
  cnes: string;
  competencia: string;
  rows: FpoComparacaoRow[];
  geradoEm?: Date;
  responsavel?: string | null; // nome impresso sob a linha de assinatura (ex.: usuário logado)
  logo?: string | null;        // timbre da prefeitura (data URI PNG) no cabeçalho
  cor?: string | null;         // cor de destaque da org (hex); null = verde padrão
}

export function gerarRelatorioFpo(dados: DadosRelatorioFpo) {
  const pdf = construirPdfFpo(dados);
  pdf.save(`relatorio-fpo-${dados.cnes}-${dados.competencia}.pdf`);
}

// Constrói o PDF (sem salvar) — separado p/ ser testável (contar páginas, etc.).
export function construirPdfFpo({ nomeUnidade, cnes, competencia, rows, geradoEm = new Date(), responsavel, logo, cor }: DadosRelatorioFpo): jsPDF {
  const { accent: VERDE, accentClaro: VERDE_CLARO } = paletaRelatorio(cor);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 30;
  const x0 = M;
  const totalW = COLS.reduce((a, c) => a + c.w, 0);

  const tot = rows.reduce((a, r) => ({
    teto: a.teto + r.qtdOrcada, prod: a.prod + r.produzido, saldo: a.saldo + r.saldo,
    tetoRS: a.tetoRS + r.tetoRS, prodRS: a.prodRS + r.produzidoRS, saldoRS: a.saldoRS + r.saldoRS,
  }), { teto: 0, prod: 0, saldo: 0, tetoRS: 0, prodRS: 0, saldoRS: 0 });
  const pct = tot.tetoRS > 0 ? (tot.prodRS / tot.tetoRS) * 100 : 0;
  const pendencias = rows.filter((r) => !r.resolvido).length;
  const semTeto = rows.filter((r) => r.temTeto === false && r.produzido > 0).length;

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
  const desenharCabecalhoPagina = () => {
    if (pagina > 0) pdf.addPage(); // a 1ª página já existe; as demais precisam ser criadas
    pagina++;
    // Faixa do título
    pdf.setFillColor(...VERDE);
    pdf.rect(0, 0, W, 54, "F");
    // Timbre no canto direito (sobre um retângulo branco). `reservaDir` = largura ocupada pelo
    // timbre (+ gap), para os textos de "Gerado em"/"Página" ficarem À ESQUERDA dele (sem sobrepor).
    let reservaDir = 0;
    if (logo) {
      try {
        const lh = 34, lw = lh * 3.21;
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(W - M - lw - 6, 10, lw + 12, lh + 6, 3, 3, "F");
        pdf.addImage(logo, "PNG", W - M - lw, 13, lw, lh);
        reservaDir = lw + 20;
      } catch { /* logo inválida */ }
    }
    const xDir = W - M - reservaDir;
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text("Relatório FPO × Produção", M, 26);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`Ficha de Programação Orçamentária · Competência ${compLabel(competencia)}`, M, 42);
    pdf.setFontSize(8);
    pdf.text(`Gerado em ${geradoEm.toLocaleDateString("pt-BR")} ${geradoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, xDir, 26, { align: "right" });
    pdf.text(`Página ${pagina}`, xDir, 42, { align: "right" });

    // Identificação da unidade
    pdf.setTextColor(...ESCURO);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(fit(nomeUnidade, W - 2 * M, 12), M, 78);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...CINZA);
    pdf.text(`CNES ${cnes}`, M, 92);

    return 108;
  };

  const desenharResumo = (yTop: number) => {
    const chips: { label: string; valor: string; cor: [number, number, number] }[] = [
      { label: "Teto orçado", valor: brl(tot.tetoRS), cor: ESCURO },
      { label: "Produzido", valor: brl(tot.prodRS), cor: VERDE },
      { label: "Saldo", valor: brl(tot.saldoRS), cor: tot.saldoRS < 0 ? ROSA : ESCURO },
      { label: "% do teto", valor: `${pct.toFixed(0)}%`, cor: pct > 100 ? ROSA : VERDE },
    ];
    const gap = 10;
    const cw = (totalW - gap * (chips.length - 1)) / chips.length;
    chips.forEach((ch, i) => {
      const cx = x0 + i * (cw + gap);
      pdf.setFillColor(...VERDE_CLARO);
      pdf.roundedRect(cx, yTop, cw, 40, 4, 4, "F");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(...CINZA);
      pdf.text(ch.label.toUpperCase(), cx + 8, yTop + 15);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(...ch.cor);
      pdf.text(ch.valor, cx + 8, yTop + 32);
    });
    return yTop + 40 + 16;
  };

  const desenharCabecalhoTabela = (y: number) => {
    pdf.setFillColor(...ESCURO);
    pdf.rect(x0, y, totalW, 20, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    let x = x0;
    for (const col of COLS) { cell(col.titulo, x, y + 13, col, 8); x += col.w; }
    return y + 20;
  };

  let y = desenharCabecalhoPagina();
  y = desenharResumo(y);
  y = desenharCabecalhoTabela(y);

  const rodapeLimite = H - 40;
  pdf.setFont("helvetica", "normal");
  rows.forEach((r, i) => {
    if (y + 16 > rodapeLimite) {
      y = desenharCabecalhoPagina();
      y = desenharCabecalhoTabela(y);
    }
    if (i % 2 === 1) { pdf.setFillColor(247, 248, 250); pdf.rect(x0, y, totalW, 16, "F"); }
    const valores = [
      r.descricao,
      r.codigoFpo ?? r.procedimento,
      int(r.qtdOrcada),
      int(r.produzido),
      int(r.saldo),
      brl(r.valorUnitario),
      brl(r.tetoRS),
      brl(r.produzidoRS),
      brl(r.saldoRS),
    ];
    let x = x0;
    COLS.forEach((col, ci) => {
      // Saldo (col 4) e Saldo R$ (col 8) em vermelho quando negativo.
      if ((ci === 4 && r.saldo < 0) || (ci === 8 && r.saldoRS < 0)) pdf.setTextColor(...ROSA);
      else pdf.setTextColor(...ESCURO);
      pdf.setFontSize(8);
      cell(valores[ci], x, y + 11, col, 8);
      x += col.w;
    });
    pdf.setDrawColor(230, 232, 236);
    pdf.line(x0, y + 16, x0 + totalW, y + 16);
    y += 16;
  });

  // Linha de total — fecho como bloco único (TOTAL + notas + assinatura). Se não couber no
  // que resta da página, leva tudo junto p/ a próxima (evita assinatura sozinha numa folha).
  const alturaFecho = 28 /*total*/ + 16 /*notas*/ + 80 /*assinatura*/;
  if (y + alturaFecho > H - 20) { y = desenharCabecalhoPagina(); y = desenharCabecalhoTabela(y); }
  pdf.setFillColor(...VERDE_CLARO);
  pdf.rect(x0, y, totalW, 18, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...ESCURO);
  const totVals = ["TOTAL", "", int(tot.teto), int(tot.prod), int(tot.saldo), "", brl(tot.tetoRS), brl(tot.prodRS), brl(tot.saldoRS)];
  let xt = x0;
  COLS.forEach((col, ci) => { cell(totVals[ci], xt, y + 12, col, 8); xt += col.w; });
  y += 28;

  // Notas
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...CINZA);
  const notas: string[] = [`${rows.length} procedimento(s).`];
  if (pendencias) notas.push(`${pendencias} não casaram no SIGTAP (revisar).`);
  if (semTeto) notas.push(`${semTeto} produzido(s) sem teto.`);
  notas.push("Saldo negativo = produção acima do teto.");
  if (y + 12 < rodapeLimite) { pdf.text(notas.join("  ·  "), M, y); y += 16; }

  // Assinatura do responsável — no fim do relatório. Nova página se não couber.
  if (y + 78 > H - 20) y = desenharCabecalhoPagina();
  const sy = y + 48;
  const cx = W / 2;
  const lw = 300;
  pdf.setDrawColor(...ESCURO);
  pdf.setLineWidth(0.7);
  pdf.line(cx - lw / 2, sy, cx + lw / 2, sy);
  if (responsavel) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...ESCURO);
    pdf.text(fit(responsavel, lw, 10), cx, sy + 14, { align: "center" });
  }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...CINZA);
  pdf.text("Assinatura do responsável", cx, sy + (responsavel ? 26 : 14), { align: "center" });

  carimbarRodapeSpa(pdf);
  return pdf;
}

// ---------------------------------------------------------------------------
// Relatório FPO AGRUPADO POR UNIDADE: uma seção por unidade (tabela + subtotal) e, no fim,
// um RESUMO GERAL (consolidado + valores por unidade). Para o "Todas as unidades".
// ---------------------------------------------------------------------------
export interface UnidadeFpo { nome: string; cnes: string; rows: FpoComparacaoRow[] }

interface TotaisFpo { teto: number; prod: number; saldo: number; tetoRS: number; prodRS: number; saldoRS: number }
const somaFpo = (rows: FpoComparacaoRow[]): TotaisFpo => rows.reduce((a, r) => ({
  teto: a.teto + r.qtdOrcada, prod: a.prod + r.produzido, saldo: a.saldo + r.saldo,
  tetoRS: a.tetoRS + r.tetoRS, prodRS: a.prodRS + r.produzidoRS, saldoRS: a.saldoRS + r.saldoRS,
}), { teto: 0, prod: 0, saldo: 0, tetoRS: 0, prodRS: 0, saldoRS: 0 });

export function gerarRelatorioFpoPorUnidade(d: { unidades: UnidadeFpo[]; competencia: string; logo?: string | null; responsavel?: string | null; cor?: string | null }) {
  const pdf = construirPdfFpoPorUnidade(d);
  pdf.save(`relatorio-fpo-todas-${d.competencia}.pdf`);
}

export function construirPdfFpoPorUnidade({ unidades, competencia, logo, responsavel, cor, geradoEm = new Date() }: {
  unidades: UnidadeFpo[]; competencia: string; logo?: string | null; responsavel?: string | null; cor?: string | null; geradoEm?: Date;
}): jsPDF {
  const { accent: VERDE, accentClaro: VERDE_CLARO } = paletaRelatorio(cor);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 30;
  const x0 = M;
  const totalW = COLS.reduce((a, c) => a + c.w, 0);
  const rodapeLimite = H - 40;

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
  const faixaTopo = () => {
    if (pagina > 0) pdf.addPage();
    pagina++;
    pdf.setFillColor(...VERDE);
    pdf.rect(0, 0, W, 54, "F");
    let reservaDir = 0;
    if (logo) {
      try {
        const lh = 34, lw = lh * 3.21;
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(W - M - lw - 6, 10, lw + 12, lh + 6, 3, 3, "F");
        pdf.addImage(logo, "PNG", W - M - lw, 13, lw, lh);
        reservaDir = lw + 20;
      } catch { /* logo inválida */ }
    }
    const xDir = W - M - reservaDir;
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(15);
    pdf.text("Relatório FPO × Produção", M, 26);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    pdf.text(`Ficha de Programação Orçamentária · Competência ${compLabel(competencia)}`, M, 42);
    pdf.setFontSize(8);
    pdf.text(`Gerado em ${geradoEm.toLocaleDateString("pt-BR")} ${geradoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, xDir, 26, { align: "right" });
    pdf.text(`Página ${pagina}`, xDir, 42, { align: "right" });
  };

  const cabecalhoTabela = (y: number) => {
    pdf.setFillColor(...ESCURO);
    pdf.rect(x0, y, totalW, 20, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
    let x = x0;
    for (const col of COLS) { cell(col.titulo, x, y + 13, col, 8); x += col.w; }
    return y + 20;
  };

  const linhaTotais = (y: number, rotulo: string, t: TotaisFpo) => {
    pdf.setFillColor(...VERDE_CLARO); pdf.rect(x0, y, totalW, 18, "F");
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(...ESCURO);
    const vals = [rotulo, "", int(t.teto), int(t.prod), int(t.saldo), "", brl(t.tetoRS), brl(t.prodRS), brl(t.saldoRS)];
    let xt = x0; COLS.forEach((col, ci) => { cell(vals[ci], xt, y + 12, col, 8); xt += col.w; });
    return y + 18;
  };

  // Uma seção por unidade.
  unidades.forEach((u) => {
    faixaTopo();
    // Identificação da unidade
    pdf.setTextColor(...ESCURO); pdf.setFont("helvetica", "bold"); pdf.setFontSize(12);
    pdf.text(fit(u.nome, W - 2 * M, 12), M, 78);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...CINZA);
    pdf.text(`CNES ${u.cnes}`, M, 92);
    let y = cabecalhoTabela(108);
    pdf.setFont("helvetica", "normal");
    u.rows.forEach((r, i) => {
      if (y + 16 > rodapeLimite) { faixaTopo(); y = cabecalhoTabela(24); }
      if (i % 2 === 1) { pdf.setFillColor(247, 248, 250); pdf.rect(x0, y, totalW, 16, "F"); }
      const valores = [r.descricao, r.codigoFpo ?? r.procedimento, int(r.qtdOrcada), int(r.produzido), int(r.saldo), brl(r.valorUnitario), brl(r.tetoRS), brl(r.produzidoRS), brl(r.saldoRS)];
      let x = x0;
      COLS.forEach((col, ci) => {
        if ((ci === 4 && r.saldo < 0) || (ci === 8 && r.saldoRS < 0)) pdf.setTextColor(...ROSA);
        else pdf.setTextColor(...ESCURO);
        pdf.setFontSize(8); cell(valores[ci], x, y + 11, col, 8); x += col.w;
      });
      pdf.setDrawColor(230, 232, 236); pdf.line(x0, y + 16, x0 + totalW, y + 16);
      y += 16;
    });
    if (y + 18 > rodapeLimite) { faixaTopo(); y = cabecalhoTabela(24); }
    linhaTotais(y, "SUBTOTAL " + u.nome.toUpperCase(), somaFpo(u.rows));
  });

  // Resumo geral.
  faixaTopo();
  pdf.setTextColor(...ESCURO); pdf.setFont("helvetica", "bold"); pdf.setFontSize(13);
  pdf.text("Resumo geral — Todas as unidades", M, 80);
  const geral = somaFpo(unidades.flatMap((u) => u.rows));
  const pct = geral.tetoRS > 0 ? (geral.prodRS / geral.tetoRS) * 100 : 0;
  // Chips consolidados
  const chips = [
    { label: "Teto orçado", valor: brl(geral.tetoRS), cor: ESCURO },
    { label: "Produzido", valor: brl(geral.prodRS), cor: VERDE },
    { label: "Saldo", valor: brl(geral.saldoRS), cor: geral.saldoRS < 0 ? ROSA : ESCURO },
    { label: "% do teto", valor: `${pct.toFixed(0)}%`, cor: pct > 100 ? ROSA : VERDE },
  ];
  const gap = 10; const cw = (totalW - gap * (chips.length - 1)) / chips.length;
  let yr = 96;
  chips.forEach((ch, i) => {
    const cx = x0 + i * (cw + gap);
    pdf.setFillColor(...VERDE_CLARO); pdf.roundedRect(cx, yr, cw, 40, 4, 4, "F");
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...CINZA);
    pdf.text(ch.label.toUpperCase(), cx + 8, yr + 15);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(...ch.cor);
    pdf.text(ch.valor, cx + 8, yr + 32);
  });
  yr += 40 + 18;

  // Tabela por unidade (valores).
  const RCOLS: Col[] = [
    { titulo: "Unidade", w: 300, align: "left" },
    { titulo: "CNES", w: 70, align: "left" },
    { titulo: "Teto R$", w: 110, align: "right" },
    { titulo: "Produzido R$", w: 120, align: "right" },
    { titulo: "Saldo R$", w: 110, align: "right" },
    { titulo: "% teto", w: 62, align: "right" },
  ];
  const rTotalW = RCOLS.reduce((a, c) => a + c.w, 0);
  pdf.setFillColor(...ESCURO); pdf.rect(x0, yr, rTotalW, 20, "F");
  pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
  let xh = x0; for (const col of RCOLS) { cell(col.titulo, xh, yr + 13, col, 8); xh += col.w; }
  yr += 20;
  pdf.setFont("helvetica", "normal");
  unidades.forEach((u, i) => {
    if (yr + 16 > rodapeLimite) { faixaTopo(); yr = 40; }
    const t = somaFpo(u.rows);
    const p = t.tetoRS > 0 ? (t.prodRS / t.tetoRS) * 100 : 0;
    if (i % 2 === 1) { pdf.setFillColor(247, 248, 250); pdf.rect(x0, yr, rTotalW, 16, "F"); }
    const vals = [u.nome, u.cnes, brl(t.tetoRS), brl(t.prodRS), brl(t.saldoRS), `${p.toFixed(0)}%`];
    let x = x0;
    RCOLS.forEach((col, ci) => {
      if (ci === 4 && t.saldoRS < 0) pdf.setTextColor(...ROSA); else pdf.setTextColor(...ESCURO);
      pdf.setFontSize(8); cell(vals[ci], x, yr + 11, col, 8); x += col.w;
    });
    pdf.setDrawColor(230, 232, 236); pdf.line(x0, yr + 16, x0 + rTotalW, yr + 16);
    yr += 16;
  });
  // Total geral + assinatura como bloco único: se não couber, vão juntos p/ a próxima página
  // (evita a assinatura sozinha numa folha, sem conteúdo acima).
  if (yr + 28 + 80 > H - 20) { faixaTopo(); yr = 60; }
  // Total geral na tabela por unidade
  pdf.setFillColor(...VERDE_CLARO); pdf.rect(x0, yr, rTotalW, 18, "F");
  pdf.setFont("helvetica", "bold"); pdf.setTextColor(...ESCURO);
  const tvals = ["TOTAL GERAL", "", brl(geral.tetoRS), brl(geral.prodRS), brl(geral.saldoRS), `${pct.toFixed(0)}%`];
  let xt = x0; RCOLS.forEach((col, ci) => { cell(tvals[ci], xt, yr + 12, col, 8); xt += col.w; });
  yr += 28;

  // Assinatura
  if (yr + 78 > H - 20) { faixaTopo(); yr = 60; }
  const sy = yr + 40; const cx2 = W / 2; const lw2 = 300;
  pdf.setDrawColor(...ESCURO); pdf.setLineWidth(0.7);
  pdf.line(cx2 - lw2 / 2, sy, cx2 + lw2 / 2, sy);
  if (responsavel) { pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(...ESCURO); pdf.text(fit(responsavel, lw2, 10), cx2, sy + 14, { align: "center" }); }
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...CINZA);
  pdf.text("Assinatura do responsável", cx2, sy + (responsavel ? 26 : 14), { align: "center" });

  carimbarRodapeSpa(pdf);
  return pdf;
}
