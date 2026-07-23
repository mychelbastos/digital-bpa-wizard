import { jsPDF } from "jspdf";
import { desenharCabecalhoPdf } from "@/lib/relatorio-comum";

export interface DadosRelatorioTfd {
  logo?: string | null;
  nomeUnidade: string;
  periodo: string;       // ex.: "07/2026" ou "05/2026 a 07/2026"
  status: string;        // ex.: "Todos" / "Faturada"
  agrupamento: string;   // rótulo do agrupamento
  colunas: string[];
  dados: string[][];
  totalTfd: number;
  totalViagens: number;
  totalRS: string;       // já formatado (brl)
  geradoEm?: Date;
}

// Monta o PDF do relatório de TFD (timbre + tabela do agrupamento escolhido).
export function construirPdfTfd(d: DadosRelatorioTfd): jsPDF {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margem = 32;
  const largura = pdf.internal.pageSize.getWidth();
  const altura = pdf.internal.pageSize.getHeight();

  let y = desenharCabecalhoPdf(pdf, {
    logo: d.logo,
    titulo: `Relatório de TFD — ${d.nomeUnidade}`,
    subtitulo: `Período: ${d.periodo}  ·  Status: ${d.status}  ·  Agrupamento: ${d.agrupamento}`,
    geradoEm: d.geradoEm ?? new Date(),
  });

  // Larguras de coluna: última (valor) fixa à direita; demais dividem o resto.
  const nCols = d.colunas.length;
  const dispon = largura - margem * 2;
  const larguraUltima = 90;
  const larguraDemais = (dispon - larguraUltima) / Math.max(1, nCols - 1);
  const xDe = (i: number) => margem + (i < nCols - 1 ? i * larguraDemais : dispon - larguraUltima);
  const wDe = (i: number) => (i < nCols - 1 ? larguraDemais : larguraUltima);

  const desenharCabecalhoTabela = () => {
    pdf.setFillColor(240, 240, 240);
    pdf.rect(margem, y - 10, dispon, 16, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(70);
    d.colunas.forEach((c, i) => {
      const alinhaDir = i === nCols - 1;
      pdf.text(c.toUpperCase(), alinhaDir ? xDe(i) + wDe(i) - 2 : xDe(i) + 2, y, { align: alinhaDir ? "right" : "left" });
    });
    pdf.setTextColor(0);
    y += 12;
  };

  desenharCabecalhoTabela();
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);

  for (const linha of d.dados) {
    if (y > altura - margem - 24) { pdf.addPage(); y = margem + 8; desenharCabecalhoTabela(); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); }
    linha.forEach((cel, i) => {
      const alinhaDir = i === nCols - 1;
      const texto = pdf.splitTextToSize(String(cel), wDe(i) - 4)[0] ?? "";
      pdf.text(texto, alinhaDir ? xDe(i) + wDe(i) - 2 : xDe(i) + 2, y, { align: alinhaDir ? "right" : "left" });
    });
    y += 13;
    pdf.setDrawColor(235);
    pdf.line(margem, y - 9, margem + dispon, y - 9);
  }

  // Rodapé de totais.
  y += 6;
  pdf.setDrawColor(160);
  pdf.line(margem, y - 6, margem + dispon, y - 6);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.text(`Total: ${d.totalTfd} TFD · ${d.totalViagens} viagens`, margem, y + 6);
  pdf.text(d.totalRS, margem + dispon, y + 6, { align: "right" });

  return pdf;
}
