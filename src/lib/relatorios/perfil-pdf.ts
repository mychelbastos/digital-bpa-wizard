import { jsPDF } from "jspdf";
import { desenharCabecalhoPdf } from "@/lib/relatorio-comum";
import { carimbarRodapeSpa } from "@/lib/spa-emblem-pdf";
import { paletaRelatorio, type RGB } from "@/lib/relatorio-cor";
import { FAIXAS, type PerfilCadastro, type ItemContagem } from "@/lib/relatorios/perfil";
import { RACAS } from "@/lib/bpa-i-v2/racas";

const RACA_LABEL = new Map(RACAS.map((r) => [r.code, r.label]));
const int = (n: number) => n.toLocaleString("pt-BR");

export interface IncluirPerfil {
  faixaSexo: boolean; raca: boolean; situacaoRua: boolean;
  cid: boolean; proc: boolean; porUnidade: boolean;
}
export interface DadosPerfil {
  cadastro: PerfilCadastro;
  cidTop: ItemContagem[];
  procTop: ItemContagem[];
  porUnidade: ItemContagem[];
  periodoLabel: string;   // rótulo do período da produção (CID/procedimentos)
  filtros?: string;       // rótulo dos filtros aplicados (unidade/tipo)
  cadastroEscopo?: string; // "toda a organização" (padrão) | "atendidos no filtro"
  incluir: IncluirPerfil; // quais seções entram no PDF
  k: number;              // limiar de supressão (ex.: 5)
  logo?: string | null;
  cor?: string | RGB | null;
  geradoEm?: Date;
}

// Constrói o PDF do relatório de perfil (agregado/anonimizado). Portrait A4.
export function construirPdfPerfil(d: DadosPerfil): jsPDF {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 32;
  const { accent, accentClaro } = paletaRelatorio(d.cor);
  // Relatório de uso interno/gestão: mostra os VALORES REAIS (sem supressão de célula).
  const sup = (n: number) => int(n);

  const inc = d.incluir;
  let y = desenharCabecalhoPdf(pdf, {
    logo: d.logo,
    titulo: "Perfil de pacientes e atendimentos",
    subtitulo: `Cadastro (total) · Perfil clínico: ${d.periodoLabel}${d.filtros ? `  ·  ${d.filtros}` : ""}`,
    geradoEm: d.geradoEm ?? new Date(),
    cor: d.cor,
  });

  const novaPaginaSePreciso = (alturaNecessaria: number) => {
    if (y + alturaNecessaria > H - 40) { pdf.addPage(); y = M + 8; }
  };

  const tituloSecao = (txt: string, sub?: string) => {
    novaPaginaSePreciso(40);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(accent[0], accent[1], accent[2]);
    pdf.text(txt, M, y);
    if (sub) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(140); pdf.text(sub, W - M, y, { align: "right" }); }
    y += 6; pdf.setDrawColor(accent[0], accent[1], accent[2]); pdf.setLineWidth(1.2); pdf.line(M, y, W - M, y); pdf.setLineWidth(1);
    y += 14; pdf.setTextColor(0);
  };

  // Desenha uma tabela genérica: colunas com título/largura/alinhamento; linhas já formatadas.
  const desenharTabela = (cols: { titulo: string; w: number; align?: "left" | "right" }[], linhas: string[][], destacarUltima = false) => {
    const totalW = cols.reduce((a, c) => a + c.w, 0);
    const cab = () => {
      pdf.setFillColor(accent[0], accent[1], accent[2]); pdf.rect(M, y, totalW, 16, "F");
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(255, 255, 255);
      let x = M; for (const c of cols) { pdf.text(c.titulo, c.align === "right" ? x + c.w - 4 : x + 4, y + 11, { align: c.align === "right" ? "right" : "left" }); x += c.w; }
      pdf.setTextColor(0); y += 16;
    };
    novaPaginaSePreciso(40); cab();
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5);
    linhas.forEach((linha, i) => {
      if (y + 15 > H - 40) { pdf.addPage(); y = M + 8; cab(); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); }
      const ultima = destacarUltima && i === linhas.length - 1;
      if (ultima) { pdf.setFillColor(accentClaro[0], accentClaro[1], accentClaro[2]); pdf.rect(M, y, totalW, 15, "F"); pdf.setFont("helvetica", "bold"); }
      else if (i % 2 === 1) { pdf.setFillColor(247, 248, 250); pdf.rect(M, y, totalW, 15, "F"); }
      let x = M;
      linha.forEach((cel, ci) => {
        const c = cols[ci];
        const t = pdf.splitTextToSize(String(cel), c.w - 6)[0] ?? "";
        pdf.text(t, c.align === "right" ? x + c.w - 4 : x + 4, y + 10.5, { align: c.align === "right" ? "right" : "left" });
        x += c.w;
      });
      pdf.setDrawColor(232); pdf.line(M, y + 15, M + totalW, y + 15);
      y += 15; if (ultima) pdf.setFont("helvetica", "normal");
    });
    y += 14;
  };

  const disp = W - 2 * M;
  const pct = (n: number, tot: number) => (tot > 0 ? `${((n / tot) * 100).toFixed(1).replace(".", ",")}%` : "—");

  // ===== 1) Faixa etária × Sexo =====
  if (inc.faixaSexo) {
    const sexos = ["F", "M", "-"]; // feminino, masculino, não informado
    const rotSexo: Record<string, string> = { F: "Feminino", M: "Masculino", "-": "Não inf." };
    const mat = new Map<string, Map<string, number>>();
    for (const r of d.cadastro.faixaSexo) {
      if (!mat.has(r.faixa)) mat.set(r.faixa, new Map());
      mat.get(r.faixa)!.set(r.sexo, (mat.get(r.faixa)!.get(r.sexo) ?? 0) + r.n);
    }
    const faixasPresentes = FAIXAS.filter((f) => mat.has(f));
    const colW = disp - 70 * sexos.length - 60;
    const cols = [{ titulo: "Faixa etária", w: colW, align: "left" as const }, ...sexos.map((s) => ({ titulo: rotSexo[s], w: 70, align: "right" as const })), { titulo: "Total", w: 60, align: "right" as const }];
    const linhas: string[][] = [];
    const totCol: Record<string, number> = { F: 0, M: 0, "-": 0 }; let totGeral = 0;
    for (const f of faixasPresentes) {
      const row = mat.get(f)!; const totLinha = sexos.reduce((s, sx) => s + (row.get(sx) ?? 0), 0);
      totGeral += totLinha; sexos.forEach((sx) => (totCol[sx] += row.get(sx) ?? 0));
      linhas.push([f, ...sexos.map((sx) => sup(row.get(sx) ?? 0)), int(totLinha)]);
    }
    linhas.push(["TOTAL", ...sexos.map((sx) => int(totCol[sx])), int(totGeral)]);
    const escopo = d.cadastroEscopo ?? "toda a organização";
    tituloSecao("Faixa etária × Sexo", `${int(d.cadastro.total)} pacientes · ${escopo}`);
    desenharTabela(cols, linhas, true);
  }

  // ===== 2) Raça/Cor =====
  if (inc.raca) {
    const tot = d.cadastro.raca.reduce((s, r) => s + r.n, 0);
    const linhas = [...d.cadastro.raca].sort((a, b) => b.n - a.n).map((r) => [RACA_LABEL.get(r.raca) ?? (r.raca === "-" ? "Não informado" : r.raca), sup(r.n), pct(r.n, tot)]);
    linhas.push(["TOTAL", int(tot), "100%"]);
    tituloSecao("Raça/Cor");
    desenharTabela([{ titulo: "Raça/Cor", w: disp - 200, align: "left" }, { titulo: "Pacientes", w: 100, align: "right" }, { titulo: "%", w: 100, align: "right" }], linhas, true);
  }

  // ===== 3) Situação de rua =====
  if (inc.situacaoRua) {
    const map = new Map(d.cadastro.situacaoRua.map((r) => [r.sit, r.n]));
    const tot = d.cadastro.situacaoRua.reduce((s, r) => s + r.n, 0);
    const linhas = [["Em situação de rua", sup(map.get("S") ?? 0), pct(map.get("S") ?? 0, tot)], ["Não", int(map.get("N") ?? 0), pct(map.get("N") ?? 0, tot)]];
    tituloSecao("Situação de rua");
    desenharTabela([{ titulo: "Situação", w: disp - 200, align: "left" }, { titulo: "Pacientes", w: 100, align: "right" }, { titulo: "%", w: 100, align: "right" }], linhas);
  }

  // ===== 4) CID mais frequentes (produção do período) =====
  if (inc.cid && d.cidTop.length > 0) {
    tituloSecao("CID mais frequentes", d.periodoLabel);
    const linhas = d.cidTop.map((c) => [c.rotulo, sup(c.n)]);
    desenharTabela([{ titulo: "CID", w: disp - 90, align: "left" }, { titulo: "Qtd.", w: 90, align: "right" }], linhas);
  }

  // ===== 5) Procedimentos mais realizados + por unidade =====
  if (inc.proc && d.procTop.length > 0) {
    tituloSecao("Procedimentos mais realizados", d.periodoLabel);
    const linhas = d.procTop.map((p) => [p.rotulo, p.chave, sup(p.n)]);
    desenharTabela([{ titulo: "Procedimento", w: disp - 180, align: "left" }, { titulo: "Código", w: 90, align: "left" }, { titulo: "Qtd.", w: 90, align: "right" }], linhas);
  }
  if (inc.porUnidade && d.porUnidade.length > 0) {
    tituloSecao("Produção por unidade", d.periodoLabel);
    const totU = d.porUnidade.reduce((s, u) => s + u.n, 0);
    const linhas = d.porUnidade.map((u) => [u.rotulo, sup(u.n)]);
    linhas.push(["TOTAL", int(totU)]);
    desenharTabela([{ titulo: "Unidade", w: disp - 90, align: "left" }, { titulo: "Qtd.", w: 90, align: "right" }], linhas, true);
  }

  // Nota LGPD no rodapé de conteúdo.
  novaPaginaSePreciso(40);
  pdf.setFont("helvetica", "italic"); pdf.setFontSize(7.5); pdf.setTextColor(130);
  pdf.text("Relatório de uso interno / gestão em saúde (LGPD, base legal art. 11, II). Dados agregados; valores reais.", M, y, { maxWidth: W - 2 * M });

  carimbarRodapeSpa(pdf);
  return pdf;
}
