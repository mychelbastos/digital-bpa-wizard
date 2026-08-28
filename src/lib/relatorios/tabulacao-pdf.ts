import { jsPDF } from "jspdf";
import { desenharCabecalhoPdf } from "@/lib/relatorio-comum";
import { carimbarRodapeSpa } from "@/lib/spa-emblem-pdf";
import { paletaRelatorio, type RGB } from "@/lib/relatorio-cor";
import { RACAS } from "@/lib/bpa-i-v2/racas";
import { FAIXAS } from "@/lib/relatorios/perfil";
import type { Tabulacao } from "@/lib/relatorios/relacao";

const RACA = new Map(RACAS.map((r) => [r.code, r.label]));
const int = (n: number) => n.toLocaleString("pt-BR");

export type DimTab = "faixa" | "faixa_sexo" | "sexo" | "raca" | "bairro";

// PDF da TABULAÇÃO por procedimento (agregada, só números). `dims` = quais recortes exibir.
export function construirPdfTabulacao(d: {
  tab: Tabulacao; procLabel: string; periodoLabel: string; filtros?: string;
  dims: DimTab[]; k: number; logo?: string | null; cor?: string | RGB | null; geradoEm?: Date;
}): jsPDF {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 32;
  const { accent, accentClaro } = paletaRelatorio(d.cor);
  // Relatório de uso interno/gestão: valores REAIS (sem supressão).
  const sup = (n: number) => int(n);
  const pct = (n: number) => (d.tab.total > 0 ? `${((n / d.tab.total) * 100).toFixed(1).replace(".", ",")}%` : "—");
  const rotSexo = (s: string) => (s === "F" ? "Feminino" : s === "M" ? "Masculino" : "Não inf.");
  const rotRaca = (r: string) => RACA.get(r) ?? (r === "-" ? "Não informado" : r || "—");

  let y = desenharCabecalhoPdf(pdf, {
    logo: d.logo, titulo: "Tabulação por procedimento",
    subtitulo: `${d.procLabel} · ${d.periodoLabel}${d.filtros ? `  ·  ${d.filtros}` : ""}`,
    geradoEm: d.geradoEm ?? new Date(), cor: d.cor,
  });

  // Destaque do total de atendimentos.
  pdf.setFillColor(accentClaro[0], accentClaro[1], accentClaro[2]); pdf.roundedRect(M, y, W - 2 * M, 30, 4, 4, "F");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(accent[0], accent[1], accent[2]);
  pdf.text("TOTAL DE ATENDIMENTOS", M + 10, y + 12);
  pdf.setFontSize(16); pdf.text(int(d.tab.total), M + 10, y + 26);
  pdf.setTextColor(0); y += 44;

  const novaPag = (h: number) => { if (y + h > H - 40) { pdf.addPage(); y = M + 8; } };
  const secao = (t: string) => {
    novaPag(40); pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(accent[0], accent[1], accent[2]);
    pdf.text(t, M, y); y += 6; pdf.setDrawColor(accent[0], accent[1], accent[2]); pdf.setLineWidth(1.2); pdf.line(M, y, W - M, y); pdf.setLineWidth(1); y += 14; pdf.setTextColor(0);
  };
  const disp = W - 2 * M;
  const tabela = (cols: { t: string; w: number; r?: boolean }[], linhas: string[][], destTot = true) => {
    const tw = cols.reduce((a, c) => a + c.w, 0);
    const cab = () => { pdf.setFillColor(accent[0], accent[1], accent[2]); pdf.rect(M, y, tw, 15, "F"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(255, 255, 255); let x = M; for (const c of cols) { pdf.text(c.t, c.r ? x + c.w - 4 : x + 4, y + 10.5, { align: c.r ? "right" : "left" }); x += c.w; } pdf.setTextColor(0); y += 15; };
    novaPag(40); cab(); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5);
    linhas.forEach((ln, i) => {
      if (y + 14 > H - 40) { pdf.addPage(); y = M + 8; cab(); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); }
      const tot = destTot && i === linhas.length - 1;
      if (tot) { pdf.setFillColor(accentClaro[0], accentClaro[1], accentClaro[2]); pdf.rect(M, y, tw, 14, "F"); pdf.setFont("helvetica", "bold"); }
      else if (i % 2 === 1) { pdf.setFillColor(247, 248, 250); pdf.rect(M, y, tw, 14, "F"); }
      let x = M; ln.forEach((c, ci) => { const co = cols[ci]; pdf.text(pdf.splitTextToSize(String(c), co.w - 6)[0] ?? "", co.r ? x + co.w - 4 : x + 4, y + 10, { align: co.r ? "right" : "left" }); x += co.w; });
      pdf.setDrawColor(232); pdf.line(M, y + 14, M + tw, y + 14); y += 14; if (tot) pdf.setFont("helvetica", "normal");
    });
    y += 12;
  };

  const rankNum = (rotulo: string, itens: { k: string; n: number }[], rot?: (k: string) => string) => {
    const ord = [...itens].sort((a, b) => b.n - a.n);
    const linhas = ord.map((it) => [rot ? rot(it.k) : it.k, sup(it.n), pct(it.n)]);
    linhas.push(["TOTAL", int(ord.reduce((s, it) => s + it.n, 0)), "100%"]);
    secao(rotulo);
    tabela([{ t: rotulo, w: disp - 200 }, { t: "Atendimentos", w: 100, r: true }, { t: "%", w: 100, r: true }], linhas);
  };

  for (const dim of d.dims) {
    if (dim === "faixa") {
      const ord = FAIXAS.filter((f) => d.tab.faixa.some((x) => x.k === f)).map((f) => ({ k: f, n: d.tab.faixa.find((x) => x.k === f)!.n }));
      const linhas = ord.map((it) => [it.k, sup(it.n), pct(it.n)]);
      linhas.push(["TOTAL", int(ord.reduce((s, it) => s + it.n, 0)), "100%"]);
      secao("Por faixa etária"); tabela([{ t: "Faixa etária", w: disp - 200 }, { t: "Atendimentos", w: 100, r: true }, { t: "%", w: 100, r: true }], linhas);
    } else if (dim === "sexo") rankNum("Por sexo", d.tab.sexo, rotSexo);
    else if (dim === "raca") rankNum("Por raça/cor", d.tab.raca, rotRaca);
    else if (dim === "bairro") rankNum("Por bairro", d.tab.bairro);
    else if (dim === "faixa_sexo") {
      const sexos = ["F", "M", "-"]; const m = new Map<string, Map<string, number>>();
      for (const r of d.tab.faixaSexo) { if (!m.has(r.faixa)) m.set(r.faixa, new Map()); m.get(r.faixa)!.set(r.sexo, r.n); }
      const faixas = FAIXAS.filter((f) => m.has(f));
      const linhas = faixas.map((f) => [f, ...sexos.map((s) => sup(m.get(f)!.get(s) ?? 0)), int(sexos.reduce((a, s) => a + (m.get(f)!.get(s) ?? 0), 0))]);
      const totCol = sexos.map((s) => faixas.reduce((a, f) => a + (m.get(f)!.get(s) ?? 0), 0));
      linhas.push(["TOTAL", ...totCol.map((n) => int(n)), int(totCol.reduce((a, b) => a + b, 0))]);
      secao("Faixa etária × Sexo");
      tabela([{ t: "Faixa etária", w: disp - 70 * 3 - 60 }, { t: "Feminino", w: 70, r: true }, { t: "Masculino", w: 70, r: true }, { t: "Não inf.", w: 70, r: true }, { t: "Total", w: 60, r: true }], linhas);
    }
  }

  novaPag(30); pdf.setFont("helvetica", "italic"); pdf.setFontSize(7.5); pdf.setTextColor(130);
  pdf.text("Relatório de uso interno / gestão em saúde (LGPD, art. 11, II). Contagem por ATENDIMENTO (quantidade); valores reais. Cobre BPA-I e RAAS.", M, y, { maxWidth: W - 2 * M });
  carimbarRodapeSpa(pdf);
  return pdf;
}
