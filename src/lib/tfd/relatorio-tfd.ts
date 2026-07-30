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

// ---------------------------------------------------------------------------
// TFD AGRUPADO POR UNIDADE (para "Todas as unidades"): uma seção por unidade (tabela do
// agrupamento escolhido + subtotal) e, no fim, um RESUMO GERAL por unidade + total geral.
// ---------------------------------------------------------------------------
export interface UnidadeTfdSecao {
  nome: string; cnes: string;
  colunas: string[]; dados: string[][];
  totalTfd: number; totalViagens: number; totalRS: string;
}

export function construirPdfTfdPorUnidade(d: {
  logo?: string | null; periodo: string; status: string; agrupamento: string;
  unidades: UnidadeTfdSecao[];
  totalGeralTfd: number; totalGeralViagens: number; totalGeralRS: string;
  resumoPorUnidade: string[][]; // [Unidade, CNES, TFDs, Viagens, Total]
  geradoEm?: Date;
}): jsPDF {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margem = 32;
  const largura = pdf.internal.pageSize.getWidth();
  const altura = pdf.internal.pageSize.getHeight();
  const dispon = largura - margem * 2;

  let y = desenharCabecalhoPdf(pdf, {
    logo: d.logo,
    titulo: "Relatório de TFD — Todas as unidades",
    subtitulo: `Período: ${d.periodo}  ·  Status: ${d.status}  ·  Agrupamento: ${d.agrupamento}`,
    geradoEm: d.geradoEm ?? new Date(),
  });

  // Desenha uma tabela (colunas/dados) a partir do y atual, com paginação. Última coluna
  // alinhada à direita. Retorna nada (usa/atualiza o `y` do escopo).
  const desenharTabela = (colunas: string[], dados: string[][]) => {
    const nCols = colunas.length;
    const larguraUltima = 90;
    const larguraDemais = (dispon - larguraUltima) / Math.max(1, nCols - 1);
    const xDe = (i: number) => margem + (i < nCols - 1 ? i * larguraDemais : dispon - larguraUltima);
    const wDe = (i: number) => (i < nCols - 1 ? larguraDemais : larguraUltima);
    const cabecalho = () => {
      pdf.setFillColor(240, 240, 240);
      pdf.rect(margem, y - 10, dispon, 16, "F");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5); pdf.setTextColor(70);
      colunas.forEach((c, i) => {
        const dir = i === nCols - 1;
        pdf.text(c.toUpperCase(), dir ? xDe(i) + wDe(i) - 2 : xDe(i) + 2, y, { align: dir ? "right" : "left" });
      });
      pdf.setTextColor(0); y += 12;
    };
    cabecalho();
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5);
    for (const linha of dados) {
      if (y > altura - margem - 24) { pdf.addPage(); y = margem + 8; cabecalho(); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); }
      linha.forEach((cel, i) => {
        const dir = i === nCols - 1;
        const texto = pdf.splitTextToSize(String(cel), wDe(i) - 4)[0] ?? "";
        pdf.text(texto, dir ? xDe(i) + wDe(i) - 2 : xDe(i) + 2, y, { align: dir ? "right" : "left" });
      });
      y += 13; pdf.setDrawColor(235); pdf.line(margem, y - 9, margem + dispon, y - 9);
    }
  };

  // Seções por unidade.
  d.unidades.forEach((u) => {
    if (y > altura - margem - 70) { pdf.addPage(); y = margem + 8; }
    y += 6;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(20);
    pdf.text(`${u.nome}  (CNES ${u.cnes})`, margem, y); y += 14;
    desenharTabela(u.colunas, u.dados);
    // Subtotal da unidade
    y += 4; pdf.setDrawColor(180); pdf.line(margem, y - 6, margem + dispon, y - 6);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(0);
    pdf.text(`Subtotal: ${u.totalTfd} TFD · ${u.totalViagens} viagens`, margem, y + 5);
    pdf.text(u.totalRS, margem + dispon, y + 5, { align: "right" });
    y += 22;
  });

  // Resumo geral.
  if (y > altura - margem - 90) { pdf.addPage(); y = margem + 8; }
  y += 8;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(16, 122, 87);
  pdf.text("Resumo geral — Todas as unidades", margem, y); y += 16; pdf.setTextColor(0);
  desenharTabela(["Unidade", "CNES", "TFDs", "Viagens", "Total"], d.resumoPorUnidade);
  y += 6; pdf.setDrawColor(160); pdf.line(margem, y - 6, margem + dispon, y - 6);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9.5);
  pdf.text(`Total geral: ${d.totalGeralTfd} TFD · ${d.totalGeralViagens} viagens`, margem, y + 6);
  pdf.text(d.totalGeralRS, margem + dispon, y + 6, { align: "right" });

  return pdf;
}
