// Parser do arquivo FPO do estado (Bahia) — ".xls" que na verdade é HTML (tabela). Puro
// (sem DOM), para ser testável e independente de ambiente. Trabalha sobre o HTML já
// decodificado em texto (o arquivo é ISO-8859-1; quem lê o File cuida do encoding).
//
// Suporta os DOIS formatos observados:
//
// (A) Download direto do site (pfo.asp) — o real, que o usuário importa:
//   Cabeçalho em linhas soltas: "Unidade: 3080560 - CLILAB ...", "Competência: 04/2026".
//   Tabela: Procedimento | Qtde Orçada | Valor Unitário | Valor Orçado | ... (SEM coluna Unidade).
//   Código com dígito verificador e traço: "020201007-4 - Determinacao ..." (= 0202010074).
//   Cada célula de procedimento carrega <div style="display:none"> com CID/CBO (removidos).
//
// (B) Arquivo "limpo" (ex.: pfo_2510332_202604 de 4,5 KB):
//   Tabela com coluna Unidade | Procedimento | Qtde Orçada | ...; código de 9 díg. sem DV.
//   Competência não vem no corpo — cai para o NOME do arquivo (pfo_<cnes>_<AAAAMM>.xls).
//
// CNES e competência são lidos do CORPO quando existem (formato A) e só então do nome (B).

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

// Remove <script>/<style> e as <div style="display:none"> (popups de CID/CBO com tabelas
// aninhadas dentro das células — quebrariam a extração de células se ficassem).
function limparHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<div[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/div>/gi, " ");
}

// Texto plano do corpo (tags fora, entidades decodificadas) para varrer CNES/competência.
function textoPlano(html: string): string {
  return decodeEntidades(limparHtml(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// "Competência: 04/2026" -> "202604". Só no formato A (download do site).
function competenciaDoCorpo(texto: string): string | null {
  const m = texto.match(/compet[êe]ncia:?\s*(\d{2})\/(\d{4})/i);
  return m ? `${m[2]}${m[1]}` : null;
}

// "Unidade: 3080560 - ..." -> "3080560". Só no formato A.
function cnesDoCorpo(texto: string): string | null {
  const m = texto.match(/unidade:?\s*(\d{7})\b/i);
  return m ? m[1] : null;
}

// Extrai as linhas/células de todas as <tr> do HTML (tags removidas). Ignora <script>/<style>
// e os popups ocultos de CID/CBO.
function extrairCelulas(html: string): string[][] {
  const corpo = limparHtml(html);
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
  const texto = textoPlano(html);

  // Competência: corpo (formato A) e só então nome do arquivo (formato B).
  const competencia = competenciaDoCorpo(texto) ?? competenciaDoNome(nomeArquivo);
  if (!competencia) avisos.push("Não consegui ler a competência (nem no corpo, nem no nome do arquivo) — informe manualmente.");

  // Acha a linha de cabeçalho (tem "Procedimento" e "Orçada") e mapeia as colunas relevantes.
  // No formato A não há coluna "Unidade" (cUnidade fica -1); no B, ela existe.
  let hi = -1;
  let cUnidade = -1, cProc = 0, cQtd = 1, cValor = 2;
  for (let i = 0; i < grade.length; i++) {
    const linha = grade[i].map(semAcento);
    if (linha.some((c) => c.includes("procedimento")) && linha.some((c) => c.includes("orcada"))) {
      hi = i;
      const idx = (frag: string) => linha.findIndex((c) => c.includes(frag));
      cUnidade = idx("unidade");
      cProc = idx("procedimento");
      cQtd = idx("qtde orcada") >= 0 ? idx("qtde orcada") : idx("orcada");
      cValor = idx("valor unitario") >= 0 ? idx("valor unitario") : idx("unitario");
      break;
    }
  }
  if (hi === -1) {
    avisos.push("Não encontrei o cabeçalho da tabela (Procedimento / Qtde Orçada). O arquivo pode não ser uma FPO válida.");
    return { cnes: cnesDoCorpo(texto), competencia, linhas: [], avisos };
  }

  const linhas: FpoLinhaParsed[] = [];
  const cnesVistos = new Set<string>();
  const codigosVistos = new Set<string>();
  for (let i = hi + 1; i < grade.length; i++) {
    const row = grade[i];
    const proc = row[cProc] ?? "";
    // Código do procedimento: 9 díg. + (opcional) traço + dígito verificador -> 9 ou 10 díg.
    const mCod = proc.match(/(\d{9})-?(\d)?/);
    if (!mCod) continue; // pula TOTAL, rodapé e linhas sem código (sem "aviso": há muito lixo estrutural)
    const codigoFpo = mCod[1] + (mCod[2] ?? "");
    if (codigosVistos.has(codigoFpo)) continue; // procedimento repetido (linhas de CBO) — ignora
    codigosVistos.add(codigoFpo);
    const descricao = proc.replace(/^\D*\d{9}-?\d?\s*-?\s*/, "").trim();
    const qtdOrcada = parseInt((row[cQtd] ?? "").replace(/\D/g, ""), 10) || 0;
    const valorUnitario = parseNumeroBR(row[cValor] ?? "");
    if (cUnidade >= 0 && /^\d{7}$/.test((row[cUnidade] ?? "").trim())) cnesVistos.add(row[cUnidade].trim());
    linhas.push({ codigoFpo, descricao, qtdOrcada, valorUnitario });
  }

  // CNES: corpo (A) -> coluna Unidade das linhas (B) -> nome do arquivo.
  const cnesLinhas = cnesVistos.size === 1 ? [...cnesVistos][0] : cnesVistos.size ? [...cnesVistos][0] : null;
  const cnesNome = (nomeArquivo.match(/\d{7}/) ?? [])[0] ?? null;
  const cnesArquivo = cnesDoCorpo(texto) ?? cnesLinhas ?? cnesNome;
  if (cnesVistos.size > 1) avisos.push(`O arquivo tem mais de um CNES (${[...cnesVistos].join(", ")}) — esperado 1 por arquivo.`);
  if (cnesNome && cnesArquivo && cnesNome !== cnesArquivo) {
    avisos.push(`CNES do nome do arquivo (${cnesNome}) diverge do CNES do conteúdo (${cnesArquivo}).`);
  }
  if (linhas.length === 0) avisos.push("Nenhum procedimento com teto encontrado nesta FPO.");

  return { cnes: cnesArquivo, competencia, linhas, avisos };
}
