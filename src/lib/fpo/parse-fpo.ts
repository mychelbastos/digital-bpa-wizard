// Parser do arquivo FPO do estado (Bahia) — ".xls" que na verdade é HTML (tabela). Puro
// (sem DOM), para ser testável e independente de ambiente. Trabalha sobre o HTML já
// decodificado em texto (o arquivo é ISO-8859-1; quem lê o File cuida do encoding).
//
// Estrutura observada (pfo_2510332_202604.xls):
//   Cabeçalho da tabela: Unidade | Procedimento | Qtde Orçada | Valor Unitário | Valor Orçado | ... | (Prod/Aprov zerados)
//   Linhas: 2510332 | "030205002 - Atendimento fisioterapeutico ..." | 993 | 4,67 | 4.637,31 | 0 | 0,00 | ...
//   Última linha: TOTAL (ignorada).
// A COMPETÊNCIA não vem no corpo deste export — vem no NOME do arquivo (pfo_<cnes>_<AAAAMM>.xls).

export interface FpoLinhaParsed {
  codigoFpo: string;   // 9 (ou 10) dígitos, como no arquivo
  descricao: string;
  qtdOrcada: number;
  valorUnitario: number;
}

export interface FpoArquivoParsed {
  cnes: string | null;          // CNES lido das linhas (todas devem ser iguais)
  competencia: string | null;   // AAAAMM, do nome do arquivo
  linhas: FpoLinhaParsed[];
  avisos: string[];             // divergências/pulos (linhas sem código, CNES divergente, etc.)
}

// "4,67" -> 4.67 ; "4.637,31" -> 4637.31 ; "50" -> 50. Formato brasileiro (ponto = milhar,
// vírgula = decimal).
export function parseNumeroBR(s: string): number {
  const limpo = (s ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

// Competência a partir do nome do arquivo: último grupo de 6 dígitos que seja AAAAMM válido.
export function competenciaDoNome(nome: string): string | null {
  const grupos = (nome ?? "").match(/\d{6}/g) ?? [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    const ano = Number(g.slice(0, 4));
    const mes = Number(g.slice(4, 6));
    if (ano >= 2000 && ano <= 2100 && mes >= 1 && mes <= 12) return g;
  }
  return null;
}

// Decodifica as entidades HTML que aparecem nesses arquivos (cabeçalho vem com
// &ccedil;/&aacute;/etc.). Cobre as nomeadas mais comuns + numéricas (&#nnn; / &#xhh;).
const ENTIDADES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ccedil: "ç", Ccedil: "Ç", aacute: "á", Aacute: "Á", eacute: "é", Eacute: "É",
  iacute: "í", Iacute: "Í", oacute: "ó", Oacute: "Ó", uacute: "ú", Uacute: "Ú",
  atilde: "ã", Atilde: "Ã", otilde: "õ", Otilde: "Õ", ntilde: "ñ",
  acirc: "â", Acirc: "Â", ecirc: "ê", Ecirc: "Ê", ocirc: "ô", Ocirc: "Ô",
  agrave: "à", Agrave: "À", uuml: "ü", Uuml: "Ü",
};
function decodeEntidades(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTIDADES[name] ?? m);
}

// Extrai as linhas/células de todas as <tr> do HTML (tags removidas). Ignora <script>/<style>.
function extrairCelulas(html: string): string[][] {
  const corpo = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const linhas: string[][] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let mtr: RegExpExecArray | null;
  while ((mtr = trRe.exec(corpo))) {
    const celulas: string[] = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let mtd: RegExpExecArray | null;
    while ((mtd = tdRe.exec(mtr[1]))) {
      const txt = decodeEntidades(mtd[1].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      celulas.push(txt);
    }
    if (celulas.length) linhas.push(celulas);
  }
  return linhas;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function parseFpoHtml(html: string, nomeArquivo: string): FpoArquivoParsed {
  const avisos: string[] = [];
  const grade = extrairCelulas(html);
  const competencia = competenciaDoNome(nomeArquivo);
  if (!competencia) avisos.push("Não consegui ler a competência do nome do arquivo — informe manualmente.");

  // Acha a linha de cabeçalho (tem "Procedimento" e "Orçada") e mapeia as colunas relevantes.
  let hi = -1;
  let cUnidade = 0, cProc = 1, cQtd = 2, cValor = 3;
  for (let i = 0; i < grade.length; i++) {
    const linha = grade[i].map(semAcento);
    if (linha.some((c) => c.includes("procedimento")) && linha.some((c) => c.includes("orcada"))) {
      hi = i;
      const idx = (frag: string) => linha.findIndex((c) => c.includes(frag));
      cUnidade = idx("unidade") >= 0 ? idx("unidade") : 0;
      cProc = idx("procedimento");
      cQtd = idx("qtde orcada") >= 0 ? idx("qtde orcada") : idx("orcada");
      cValor = idx("valor unitario") >= 0 ? idx("valor unitario") : idx("unitario");
      break;
    }
  }
  if (hi === -1) {
    avisos.push("Não encontrei o cabeçalho da tabela (Procedimento / Qtde Orçada). O arquivo pode não ser uma FPO válida.");
    return { cnes: null, competencia, linhas: [], avisos };
  }

  const linhas: FpoLinhaParsed[] = [];
  const cnesVistos = new Set<string>();
  for (let i = hi + 1; i < grade.length; i++) {
    const row = grade[i];
    const cnes = (row[cUnidade] ?? "").trim();
    if (!/^\d{7}$/.test(cnes)) continue; // pula TOTAL e linhas sem CNES
    const proc = row[cProc] ?? "";
    const mCod = proc.match(/(\d{9,10})/);
    if (!mCod) { avisos.push(`Linha ${i + 1}: sem código de procedimento — ignorada.`); continue; }
    const codigoFpo = mCod[1];
    const descricao = proc.replace(/^\D*\d{9,10}\s*-?\s*/, "").trim();
    const qtdOrcada = parseInt((row[cQtd] ?? "").replace(/\D/g, ""), 10) || 0;
    const valorUnitario = parseNumeroBR(row[cValor] ?? "");
    cnesVistos.add(cnes);
    linhas.push({ codigoFpo, descricao, qtdOrcada, valorUnitario });
  }

  const cnesArquivo = cnesVistos.size === 1 ? [...cnesVistos][0] : (cnesVistos.size ? [...cnesVistos][0] : null);
  if (cnesVistos.size > 1) avisos.push(`O arquivo tem mais de um CNES (${[...cnesVistos].join(", ")}) — esperado 1 por arquivo.`);
  const cnesNome = (nomeArquivo.match(/\d{7}/) ?? [])[0];
  if (cnesNome && cnesArquivo && cnesNome !== cnesArquivo) {
    avisos.push(`CNES do nome do arquivo (${cnesNome}) diverge do CNES das linhas (${cnesArquivo}).`);
  }

  return { cnes: cnesArquivo, competencia, linhas, avisos };
}
