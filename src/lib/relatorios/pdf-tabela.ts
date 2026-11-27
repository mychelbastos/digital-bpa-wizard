// PDF de TABELA que se ajusta ao tamanho do conteúdo (Montar relatório e Cadastros).
//  • Orientação: automática (paisagem só se não couber em retrato no menor tamanho legível),
//    retrato ou paisagem.
//  • "Ajustar à largura": colunas proporcionais ao conteúdo, nomes em até 2 linhas (quebra só
//    entre palavras), números à direita, fonte de 9 a 7 pt — só o necessário.
//  • Se nem em paisagem a 7 pt couber: as colunas viram BLOCOS; a 1ª coluna (nome) se repete
//    em cada bloco com "continua →" / "← continuação".
//  • Cabeçalho da tabela em toda página; linha de Total em negrito no fim, nunca sozinha no topo.
//  • Cabeçalho do relatório (timbre/cor da org) e rodapé "Gerado por … · Página X de Y". A4.
import { jsPDF } from "jspdf";
import { paletaRelatorio } from "@/lib/relatorio-cor";
import { carimbarRodapeSpa } from "@/lib/spa-emblem-pdf";

export type Orientacao = "auto" | "retrato" | "paisagem";

export interface ColunaPdf {
  titulo: string;
  alinhar: "left" | "right";
  extra?: boolean; // coluna de informação extra (fundo azul bem claro)
}

export interface GrupoPdf {
  titulo?: string; // ex.: nome da unidade (PDF por unidade)
  linhas: string[][]; // células já formatadas
  total?: string[]; // linha de Total (negrito)
}

export interface OpcoesPdfTabela {
  titulo: string;
  infos: string[]; // linhas de contexto: período, unidade(s), filtros, extras
  colunas: ColunaPdf[]; // a 1ª é a coluna de nome (repete nos blocos)
  grupos: GrupoPdf[];
  logo?: string | null;
  cor?: string | null;
  geradoPor?: string | null;
  orientacao?: Orientacao;
  ajustar?: boolean;
  rodapeNota?: string; // ex.: "Lista nominal — uso interno"
}

export interface ResultadoPdfTabela {
  pdf: jsPDF;
  orientacaoUsada: "retrato" | "paisagem";
  partes: number; // blocos de colunas (1 = coube inteira)
  fonte: number; // pt usado
}

const M = 30; // margem (igual aos PDFs atuais)
const PAD = 4; // respiro lateral da célula
const FONTES = [9, 8.5, 8, 7.5, 7];
const TOPO_BANDA = 54;

type Medidas = { nomeMin: number; nomeNat: number; nums: number[] };

function medir(pdf: jsPDF, colunas: ColunaPdf[], grupos: GrupoPdf[], fonte: number): Medidas {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(fonte);
  const todas = grupos.flatMap((g) => [...g.linhas, ...(g.total ? [g.total] : [])]);
  const larg = (s: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    return pdf.getTextWidth(s);
  };
  let nomeNat = larg(colunas[0]?.titulo ?? "", true);
  let palavra = 0;
  for (const l of todas) {
    const t = l[0] ?? "";
    nomeNat = Math.max(nomeNat, larg(t));
    for (const p of t.split(/\s+/)) palavra = Math.max(palavra, larg(p));
  }
  // Em até 2 linhas: precisa de pelo menos metade do texto mais longo e da maior palavra.
  const nomeMin = Math.max(palavra, nomeNat / 2 + 6) + 2 * PAD;
  const nums = colunas.slice(1).map((c, i) => {
    let w = 0;
    for (const p of c.titulo.split(/\s+/)) w = Math.max(w, larg(p, true)); // título quebra entre palavras
    for (const l of todas) w = Math.max(w, larg(l[i + 1] ?? "", true));
    return w + 2 * PAD;
  });
  return { nomeMin, nomeNat: nomeNat + 2 * PAD, nums };
}

// Quebra um texto em até 2 linhas, só entre palavras; se sobrar, a 2ª termina em "…".
export function quebrar(pdf: jsPDF, txt: string, w: number): string[] {
  const palavras = txt.split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [""];
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tent = atual ? `${atual} ${p}` : p;
    if (!atual || pdf.getTextWidth(tent) <= w) atual = tent;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  linhas.push(atual);
  if (linhas.length <= 2) return linhas;
  let l2 = linhas.slice(1).join(" ");
  while (l2.includes(" ") && pdf.getTextWidth(`${l2} …`) > w) l2 = l2.slice(0, l2.lastIndexOf(" "));
  return [linhas[0], `${l2} …`];
}

export function gerarPdfTabela(o: OpcoesPdfTabela): ResultadoPdfTabela {
  const ajustar = o.ajustar !== false;
  const pref = o.orientacao ?? "auto";
  const larguraUtil = (paisagem: boolean) => (paisagem ? 842 : 595) - 2 * M;
  const sonda = new jsPDF({ unit: "pt", format: "a4" });

  // Escolhe orientação e fonte: menor esforço que caiba.
  const tentativas: { paisagem: boolean; fonte: number }[] = [];
  const oris = pref === "retrato" ? [false] : pref === "paisagem" ? [true] : [false, true];
  for (const p of oris)
    for (const f of ajustar ? FONTES : [9]) tentativas.push({ paisagem: p, fonte: f });
  let escolha = tentativas[tentativas.length - 1];
  let cabe = false;
  for (const t of tentativas) {
    const md = medir(sonda, o.colunas, o.grupos, t.fonte);
    if (md.nomeMin + md.nums.reduce((a, b) => a + b, 0) <= larguraUtil(t.paisagem)) {
      escolha = t;
      cabe = true;
      break;
    }
  }
  const paisagem = escolha.paisagem;
  const fonte = escolha.fonte;
  const W = larguraUtil(paisagem);
  const md = medir(sonda, o.colunas, o.grupos, fonte);

  // Blocos de colunas (quando não cabe nem no menor tamanho).
  const blocos: number[][] = [];
  if (cabe) blocos.push(o.colunas.slice(1).map((_, i) => i + 1));
  else {
    const nomeW = Math.min(md.nomeMin, W * 0.4);
    let atual: number[] = [],
      usado = nomeW;
    md.nums.forEach((w, i) => {
      if (atual.length && usado + w > W) {
        blocos.push(atual);
        atual = [];
        usado = nomeW;
      }
      atual.push(i + 1);
      usado += w;
    });
    if (atual.length) blocos.push(atual);
  }

  const pdf = new jsPDF({
    orientation: paisagem ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });
  const PW = pdf.internal.pageSize.getWidth();
  const PH = pdf.internal.pageSize.getHeight();
  const { accent, accentClaro } = paletaRelatorio(o.cor);
  const AZUL_EXTRA: [number, number, number] = [240, 245, 253];
  const lineH = fonte * 1.25;
  const geradoEm = new Date();

  const bandaTopo = () => {
    pdf.setFillColor(accent[0], accent[1], accent[2]);
    pdf.rect(0, 0, PW, TOPO_BANDA, "F");
    let reserva = 0;
    if (o.logo) {
      try {
        const lh = 34,
          lw = lh * 3.21;
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(PW - M - lw - 6, 10, lw + 12, lh + 6, 3, 3, "F");
        pdf.addImage(o.logo, "PNG", PW - M - lw, 13, lw, lh);
        reserva = lw + 20;
      } catch {
        /* logo inválida */
      }
    }
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    const tituloMax = PW - 2 * M - reserva;
    let t = o.titulo;
    while (pdf.getTextWidth(t) > tituloMax && t.length > 4) t = `${t.slice(0, -2)}…`;
    pdf.text(t, M, 26);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(o.infos[0] ?? "", M, 42);
    pdf.setTextColor(0);
  };

  let y = 0;
  const novaPagina = (primeira: boolean) => {
    if (!primeira) pdf.addPage();
    bandaTopo();
    y = TOPO_BANDA + 16;
    if (primeira) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(75, 85, 99);
      for (const linha of o.infos.slice(1)) {
        for (const l of pdf.splitTextToSize(linha, PW - 2 * M) as string[]) {
          pdf.text(l, M, y);
          y += 11;
        }
      }
      y += 4;
      pdf.setTextColor(0);
    }
  };

  const larguras = (cols: number[]) => {
    const nums = cols.map((c) => md.nums[c - 1]);
    const somaNums = nums.reduce((a, b) => a + b, 0);
    let nomeW = Math.max(md.nomeMin, Math.min(md.nomeNat, W - somaNums));
    if (!cabe) nomeW = Math.min(md.nomeMin, W * 0.4);
    // Sobra de largura vai proporcionalmente para as colunas numéricas (tabela ocupa a página).
    const sobra = Math.max(0, W - nomeW - somaNums);
    const extraNome = cols.length === 0 ? sobra : 0;
    const fator = somaNums > 0 ? 1 + sobra / somaNums : 1;
    return { nomeW: nomeW + extraNome, nums: cols.length ? nums.map((w) => w * fator) : [] };
  };

  const desenharCabecalhoTabela = (
    cols: number[],
    lw: { nomeW: number; nums: number[] },
    aviso?: string,
  ) => {
    if (aviso) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(7.5);
      pdf.setTextColor(107, 114, 128);
      pdf.text(aviso, M + W, y, { align: "right" });
      y += 9;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fonte);
    const tit = [o.colunas[0].titulo, ...cols.map((c) => o.colunas[c].titulo)];
    const ws = [lw.nomeW, ...lw.nums];
    const linhasTit = tit.map((t, i) => quebrar(pdf, t, ws[i] - 2 * PAD));
    const h = Math.max(...linhasTit.map((l) => l.length)) * lineH + 6;
    pdf.setFillColor(accentClaro[0], accentClaro[1], accentClaro[2]);
    pdf.rect(
      M,
      y,
      ws.reduce((a, b) => a + b, 0),
      h,
      "F",
    );
    pdf.setTextColor(accent[0], accent[1], accent[2]);
    let x = M;
    linhasTit.forEach((ls, i) => {
      const dir = i > 0 && o.colunas[cols[i - 1]].alinhar === "right";
      ls.forEach((l, k) =>
        pdf.text(l, dir ? x + ws[i] - PAD : x + PAD, y + 3 + fonte + k * lineH, {
          align: dir ? "right" : "left",
        }),
      );
      x += ws[i];
    });
    pdf.setTextColor(0);
    y += h;
  };

  const alturaLinha = (cel: string[], lw: { nomeW: number }) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(fonte);
    return quebrar(pdf, cel[0] ?? "", lw.nomeW - 2 * PAD).length * lineH + 5;
  };

  const desenharLinha = (
    cel: string[],
    cols: number[],
    lw: { nomeW: number; nums: number[] },
    bold: boolean,
    zebra: boolean,
  ) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(fonte);
    const nomeLinhas = quebrar(pdf, cel[0] ?? "", lw.nomeW - 2 * PAD);
    const h = nomeLinhas.length * lineH + 5;
    const larguraTotal = lw.nomeW + lw.nums.reduce((a, b) => a + b, 0);
    if (bold) {
      pdf.setFillColor(accentClaro[0], accentClaro[1], accentClaro[2]);
      pdf.rect(M, y, larguraTotal, h, "F");
    } else if (zebra) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(M, y, larguraTotal, h, "F");
    }
    let x = M + lw.nomeW;
    cols.forEach((c, i) => {
      if (o.colunas[c].extra && !bold) {
        pdf.setFillColor(...AZUL_EXTRA);
        pdf.rect(x, y, lw.nums[i], h, "F");
      }
      x += lw.nums[i];
    });
    pdf.setTextColor(31, 41, 55);
    nomeLinhas.forEach((l, k) => pdf.text(l, M + PAD, y + 2.5 + fonte + k * lineH));
    x = M + lw.nomeW;
    cols.forEach((c, i) => {
      const t = cel[c] ?? "";
      if (o.colunas[c].alinhar === "right")
        pdf.text(t, x + lw.nums[i] - PAD, y + 2.5 + fonte, { align: "right" });
      else pdf.text(t, x + PAD, y + 2.5 + fonte);
      x += lw.nums[i];
    });
    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(0.4);
    pdf.line(M, y + h, M + larguraTotal, y + h);
    y += h;
  };

  const limite = PH - M - 18; // espaço do rodapé
  novaPagina(true);
  blocos.forEach((cols, bi) => {
    const lw = larguras(cols);
    const aviso =
      blocos.length > 1
        ? bi === 0
          ? `Parte 1 de ${blocos.length} · continua →`
          : `← continuação · parte ${bi + 1} de ${blocos.length}`
        : undefined;
    if (bi > 0) {
      novaPagina(false);
    }
    o.grupos.forEach((g, gi) => {
      if (g.titulo) {
        if (y + 40 > limite) novaPagina(false);
        if (gi > 0) y += 8;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(accent[0], accent[1], accent[2]);
        pdf.text(g.titulo, M, y + 10);
        y += 16;
        pdf.setTextColor(0);
      }
      desenharCabecalhoTabela(cols, lw, gi === 0 ? aviso : undefined);
      g.linhas.forEach((cel, i) => {
        const h = alturaLinha(cel, lw);
        // A última linha antes do Total leva o Total junto se este não couber depois dela.
        const proxTotal = g.total && i === g.linhas.length - 1 ? alturaLinha(g.total, lw) : 0;
        if (y + h + proxTotal > limite) {
          novaPagina(false);
          desenharCabecalhoTabela(cols, lw);
        }
        desenharLinha(cel, cols, lw, false, i % 2 === 1);
      });
      if (g.total) {
        const h = alturaLinha(g.total, lw);
        if (y + h > limite) {
          novaPagina(false);
          desenharCabecalhoTabela(cols, lw);
        }
        desenharLinha(g.total, cols, lw, true, false);
      }
    });
  });

  const n = pdf.getNumberOfPages();
  const quando = `${geradoEm.toLocaleDateString("pt-BR")} ${geradoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  for (let p = 1; p <= n; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(107, 114, 128);
    const base = `Gerado por ${o.geradoPor || "usuário"} em ${quando} · Página ${p} de ${n}`;
    pdf.text(o.rodapeNota ? `${o.rodapeNota} · ${base}` : base, M, PH - 16);
    carimbarRodapeSpa(pdf);
  }
  return { pdf, orientacaoUsada: paisagem ? "paisagem" : "retrato", partes: blocos.length, fonte };
}
