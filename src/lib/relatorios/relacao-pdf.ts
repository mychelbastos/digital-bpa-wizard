import { jsPDF } from "jspdf";
import { desenharCabecalhoPdf } from "@/lib/relatorio-comum";
import { carimbarRodapeSpa } from "@/lib/spa-emblem-pdf";
import { paletaRelatorio, type RGB } from "@/lib/relatorio-cor";
import { RACAS } from "@/lib/bpa-i-v2/racas";
import type { PacienteNominal } from "@/lib/relatorios/relacao";

const RACA = new Map(RACAS.map((r) => [r.code, r.label]));
const rotSexo = (s: string) => (s === "F" ? "Fem." : s === "M" ? "Masc." : "—");
const rotRaca = (r: string) => RACA.get(r) ?? (r || "—");

// PDF da RELAÇÃO NOMINAL de pacientes (com nome — uso interno/conferência).
export function construirPdfRelacao(d: {
  titulo: string; subtitulo: string; pacientes: PacienteNominal[];
  mostrarMunicipio?: boolean; logo?: string | null; cor?: string | RGB | null; geradoEm?: Date;
}): jsPDF {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 28;
  const { accent } = paletaRelatorio(d.cor);
  let y = desenharCabecalhoPdf(pdf, { logo: d.logo, titulo: d.titulo, subtitulo: d.subtitulo, geradoEm: d.geradoEm ?? new Date(), cor: d.cor });

  // Aviso de uso interno (PII).
  pdf.setFillColor(255, 247, 237); pdf.setDrawColor(251, 191, 36); pdf.roundedRect(M, y, W - 2 * M, 18, 3, 3, "FD");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(146, 64, 14);
  pdf.text("USO INTERNO · CONFERÊNCIA — contém dados pessoais. Não divulgar. (LGPD: acesso restrito a fins de gestão em saúde.)", M + 8, y + 12);
  pdf.setTextColor(0); y += 30;

  const disp = W - 2 * M;
  const cols = d.mostrarMunicipio
    ? [{ t: "#", w: 26 }, { t: "Nome", w: disp - 26 - 130 - 78 - 46 - 90 - 120 - 110 }, { t: "Documento (CNS/CPF)", w: 130 }, { t: "Nascimento", w: 78 }, { t: "Sexo", w: 46 }, { t: "Raça/Cor", w: 90 }, { t: "Bairro", w: 120 }, { t: "Município", w: 110 }]
    : [{ t: "#", w: 26 }, { t: "Nome", w: disp - 26 - 130 - 78 - 46 - 90 - 150 }, { t: "Documento (CNS/CPF)", w: 130 }, { t: "Nascimento", w: 78 }, { t: "Sexo", w: 46 }, { t: "Raça/Cor", w: 90 }, { t: "Bairro", w: 150 }];
  const totalW = cols.reduce((a, c) => a + c.w, 0);
  const fit = (t: string, w: number) => pdf.splitTextToSize(String(t ?? ""), w - 6)[0] ?? "";
  const cab = () => {
    pdf.setFillColor(accent[0], accent[1], accent[2]); pdf.rect(M, y, totalW, 16, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(255, 255, 255);
    let x = M; for (const c of cols) { pdf.text(c.t, x + 3, y + 11); x += c.w; }
    pdf.setTextColor(0); y += 16;
  };
  cab(); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5);
  d.pacientes.forEach((p, i) => {
    if (y + 13 > H - 34) { pdf.addPage(); y = M + 8; cab(); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); }
    if (i % 2 === 1) { pdf.setFillColor(247, 248, 250); pdf.rect(M, y, totalW, 13, "F"); }
    const vals = d.mostrarMunicipio
      ? [String(i + 1), p.nome, p.documento, p.nascimento, rotSexo(p.sexo), rotRaca(p.raca), p.bairro, p.municipio ?? ""]
      : [String(i + 1), p.nome, p.documento, p.nascimento, rotSexo(p.sexo), rotRaca(p.raca), p.bairro];
    let x = M; vals.forEach((v, ci) => { pdf.text(fit(v, cols[ci].w), x + 3, y + 9); x += cols[ci].w; });
    pdf.setDrawColor(235); pdf.line(M, y + 13, M + totalW, y + 13); y += 13;
  });
  y += 6; pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5);
  pdf.text(`Total: ${d.pacientes.length.toLocaleString("pt-BR")} paciente(s).`, M, y + 6);

  carimbarRodapeSpa(pdf);
  return pdf;
}
