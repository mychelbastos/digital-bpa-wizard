import type { jsPDF } from "jspdf";
import { paletaRelatorio, type RGB } from "@/lib/relatorio-cor";

// Cabeçalho padrão dos relatórios em PDF: BANDA na cor de destaque da prefeitura (verde
// padrão / roxo Ruy Barbosa etc.), com título/subtítulo em branco, logo (timbre) num cartão
// branco à direita e a data de geração. Mesmo visual dos relatórios de Produção/FPO —
// unifica TFD, inativos e crivo. Retorna o Y (pt) logo abaixo da banda, p/ o conteúdo seguir.
export function desenharCabecalhoPdf(
  pdf: jsPDF,
  opts: { logo?: string | null; titulo: string; subtitulo?: string; geradoEm?: Date; cor?: string | RGB | null },
): number {
  const M = 32;
  const W = pdf.internal.pageSize.getWidth();
  const { accent } = paletaRelatorio(opts.cor);
  const H = 54;

  pdf.setFillColor(accent[0], accent[1], accent[2]);
  pdf.rect(0, 0, W, H, "F");

  // Timbre num cartão branco à direita (proporção ~3.21, 1400x436, como nos demais).
  let reservaDir = 0;
  if (opts.logo) {
    try {
      const lh = 34;
      const lw = lh * 3.21;
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(W - M - lw - 6, 10, lw + 12, lh + 6, 3, 3, "F");
      pdf.addImage(opts.logo, "PNG", W - M - lw, 13, lw, lh);
      reservaDir = lw + 20;
    } catch {
      /* logo inválida: segue sem ela */
    }
  }
  const xDir = W - M - reservaDir;

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(opts.titulo, M, 26);

  if (opts.subtitulo) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(opts.subtitulo, M, 42);
  }
  if (opts.geradoEm) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`Gerado em ${opts.geradoEm.toLocaleString("pt-BR")}`, xDir, 26, { align: "right" });
  }

  pdf.setTextColor(0);
  return H + 20;
}
