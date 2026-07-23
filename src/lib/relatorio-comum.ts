import type { jsPDF } from "jspdf";

// Desenha o cabeçalho padrão dos relatórios em PDF: timbre (logo) da prefeitura no topo +
// título/subtítulo. Retorna o Y (pt) logo abaixo do cabeçalho, para o conteúdo continuar.
export function desenharCabecalhoPdf(
  pdf: jsPDF,
  opts: { logo?: string | null; titulo: string; subtitulo?: string; geradoEm?: Date },
): number {
  const margem = 32;
  const largura = pdf.internal.pageSize.getWidth();
  let y = margem;

  if (opts.logo) {
    try {
      // Timbre com proporção ~3.18 (760x239). Altura fixa; largura por proporção.
      const h = 40;
      const w = h * 3.18;
      pdf.addImage(opts.logo, "PNG", margem, y, w, h);
      y += h + 8;
    } catch {
      /* logo inválida: segue sem ela */
    }
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(opts.titulo, margem, y + 6);
  y += 14;

  if (opts.subtitulo) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(90);
    pdf.text(opts.subtitulo, margem, y + 6);
    pdf.setTextColor(0);
    y += 12;
  }

  // Data de geração no canto direito.
  if (opts.geradoEm) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    const dt = opts.geradoEm.toLocaleString("pt-BR");
    pdf.text(`Gerado em ${dt}`, largura - margem, margem + 6, { align: "right" });
    pdf.setTextColor(0);
  }

  y += 8;
  pdf.setDrawColor(200);
  pdf.line(margem, y, largura - margem, y);
  return y + 14;
}
