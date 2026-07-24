// Parser do arquivo de PRODUÇÃO BPA Magnético (.MAR/.JUN/.txt) — o inverso do gerador.
// Layout de largura fixa, registros separados por \r\n, encoding ISO-8859-1 (quem lê o File
// cuida do encoding). Os offsets são os MESMOS do gerador (bpa-i-v2/bpa-magnetico.ts e
// bpa-c-v2/bpa-magnetico.ts) e do harness byte-a-byte (bpa-magnetico-mar.local.test.ts),
// provados round-trip contra arquivos reais (971/971 .MAR, 1250/1250 .JUN). NÃO deduzir.
//
//   01  header (126)  : 01 #BPA# AAAAMM nLinhas nFolhas controle ORIGEM(30) SIGLA(6) CNPJ(14) DESTINO(40) M/E VERSAO(6)
//   02  BPA-C  (48)   : 02 CNES(7) AAAAMM CBO(6) folha(3) seq(2) proc(10) idade(3) qtd(6) "BPA"
//   03  BPA-I  (350)  : 02..CNES(7) AAAAMM profCns(15) profCbo(6) dataAtend(8) folha(3) seq(2)
//                       proc(10) cnsPac(15) sexo(1) ibge(6) cid(4) idade(3) qtde(6) carater(2)
//                       autoriz(13) "BPA" nomePac(30) dataNasc(8) ... cpfPac(11) sitRua(1)
//
// O arquivo pode misturar competências (até 4 meses de retroatividade) e CNES. Agrupamos:
//   BPA-C -> por (CNES + competência da linha)
//   BPA-I -> por (CNES + profCns + profCbo + competência da linha)
//
// IMPORTANTE — tamanho da FICHA DIGITAL ≠ folha do BPA MAG. O BPA Magnético empacota até
// 99 seqs por folha no .txt, mas a FICHA na tela (o formulário) só exibe/edita 3 sequências
// (BPA-I) ou 20 linhas (BPA-C). Se gravássemos toda a produção do profissional numa ficha
// só, o formulário mostraria apenas as 3 primeiras e o resto ficaria invisível. Por isso, ao
// importar, QUEBRAMOS cada grupo em fichas do tamanho do formulário (uma ficha por bloco).
// No fechamento/exportação, fechamento-mes.ts reempacota tudo em folhas de 99 (a folha/seq
// do .txt é derivada lá, não capturada aqui).
const SEQS_POR_FICHA_BPAI = 3;   // o BPA-I v3 exibe 3 sequências por ficha
const ROWS_POR_FICHA_BPAC = 20;  // o BPA-C v3 exibe 20 linhas por ficha

function emBlocos<T>(itens: T[], tamanho: number): T[][] {
  if (itens.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho));
  return out;
}

import { emptySeq, type SeqData } from "@/lib/bpai-v2-layout";
import { emptyRow, type RowData } from "@/lib/bpac-layout";

const arr = (s: string) => s.split("");

// data aaaammdd (arquivo) -> ddmmaaaa (como o SeqData guarda). Branco/inválida -> [].
function dataParaSeq(amd: string): string[] {
  if (!/\d/.test(amd) || amd.trim().length !== 8) return [];
  return arr(amd.slice(6, 8) + amd.slice(4, 6) + amd.slice(0, 4));
}

export interface FichaBpaCImport {
  cnes: string;
  competencia: string; // AAAAMM da linha
  rows: RowData[];
  folha: number;       // nº do bloco (1-based) quando o grupo é quebrado em várias fichas
  totalFolhas: number; // quantos blocos ao todo (para rotular "folha 2/5")
}

export interface FichaBpaIImport {
  cnes: string;
  competencia: string; // AAAAMM da linha
  profCns: string;
  profCbo: string;
  seqs: SeqData[];
  folha: number;       // nº do bloco (1-based) quando o grupo é quebrado em várias fichas
  totalFolhas: number; // quantos blocos ao todo (para rotular "folha 2/5")
}

export interface CabecalhoMagnetico {
  competencia: string | null; // AAAAMM de apresentação (header)
  orgaoOrigem: string;
  sigla: string;
  cnpj: string;
  orgaoDestino: string;
  tipoDestino: string; // M (magnético) / E
  versao: string;
  linhasDeclaradas: number | null;
}

export interface ResultadoMagnetico {
  cabecalho: CabecalhoMagnetico | null;
  fichasC: FichaBpaCImport[];
  fichasI: FichaBpaIImport[];
  totais: {
    linhas02: number;
    linhas03: number;
    quantidadeBpaC: number; // Σ quantidades das linhas 02
    quantidadeBpaI: number; // Σ quantidades das linhas 03
  };
  cnes: string[];
  competencias: string[];
  avisos: string[];
}

function parseHeader(linha: string): CabecalhoMagnetico {
  const n = (s: string) => { const v = parseInt(s, 10); return Number.isFinite(v) ? v : null; };
  return {
    competencia: /^\d{6}$/.test(linha.slice(7, 13)) ? linha.slice(7, 13) : null,
    linhasDeclaradas: n(linha.slice(13, 19)),
    orgaoOrigem: linha.slice(29, 59).trim(),
    sigla: linha.slice(59, 65).trim(),
    cnpj: linha.slice(65, 79).trim(),
    orgaoDestino: linha.slice(79, 119).trim(),
    tipoDestino: linha.slice(119, 120).trim(),
    versao: linha.slice(120, 126).trim(),
  };
}

// Linha 02 (BPA-C) -> RowData + chaves de agrupamento.
function parse02(line: string): { cnes: string; competencia: string; row: RowData } {
  return {
    cnes: line.slice(2, 9),
    competencia: line.slice(9, 15),
    row: {
      ...emptyRow(),
      cbo: arr(line.slice(15, 21)),
      procedimento: arr(line.slice(26, 36)),
      idade: arr(line.slice(36, 39)),
      quantidade: arr(line.slice(39, 45)),
    },
  };
}

// Linha 03 (BPA-I) -> SeqData + chaves de agrupamento. Traz PII do paciente (nome, CNS,
// CPF, endereço) — nunca logar/commitar; só vai para o banco (fichas.dados, sob RLS).
function parse03(line: string): { cnes: string; competencia: string; profCns: string; profCbo: string; seq: SeqData } {
  const seq: SeqData = {
    ...emptySeq(),
    dataAtend: dataParaSeq(line.slice(36, 44)),
    codProc: arr(line.slice(49, 59)),
    cnsPac: arr(line.slice(59, 74)),
    sexo: (line[74] === "M" || line[74] === "F" ? line[74] : "") as SeqData["sexo"],
    ibge: arr(line.slice(75, 81)),
    cid: arr(line.slice(81, 85)),
    idade: arr(line.slice(85, 88)),
    qtde: arr(line.slice(88, 94)),
    carater: arr(line.slice(94, 96)),
    autorizacao: arr(line.slice(96, 109)),
    nomePac: line.slice(112, 142),
    dataNasc: dataParaSeq(line.slice(142, 150)),
    racaCor: line.slice(150, 152).trim(),
    etnia: line.slice(152, 156).trim(),
    nacionalidade: line.slice(156, 159).trim(),
    servico: arr(line.slice(159, 162)),
    classProc: arr(line.slice(162, 165)),
    cnpj: arr(line.slice(177, 191)),
    cep: arr(line.slice(191, 199)),
    codLog: arr(line.slice(199, 202)),
    endereco: line.slice(202, 232),
    complemento: line.slice(232, 242),
    numero: arr(line.slice(242, 247)),
    bairro: line.slice(247, 277),
    ddd: [],
    telefone: arr(line.slice(277, 288)),
    email: line.slice(288, 328),
    cpfPac: arr(line.slice(338, 349)),
    situacaoRua: line.slice(349, 350).trim(),
  };
  return { cnes: line.slice(2, 9), competencia: line.slice(9, 15), profCns: line.slice(15, 30).trim(), profCbo: line.slice(30, 36).trim(), seq };
}

const qtdDe = (a: string[]) => Number(a.join("").replace(/\D/g, "")) || 0;

export function parseArquivoMagnetico(txt: string): ResultadoMagnetico {
  const avisos: string[] = [];
  const linhas = txt.split(/\r\n|\n/).filter((l) => l.length > 0);
  if (linhas.length === 0) {
    return { cabecalho: null, fichasC: [], fichasI: [], totais: { linhas02: 0, linhas03: 0, quantidadeBpaC: 0, quantidadeBpaI: 0 }, cnes: [], competencias: [], avisos: ["Arquivo vazio."] };
  }

  const cabecalho = linhas[0].startsWith("01") ? parseHeader(linhas[0]) : null;
  if (!cabecalho) avisos.push("Sem cabeçalho (linha 01) — arquivo pode não ser um BPA Magnético.");

  // Grupos completos (antes de quebrar em blocos do tamanho da ficha).
  const mapaC = new Map<string, { cnes: string; competencia: string; rows: RowData[] }>();
  const mapaI = new Map<string, { cnes: string; competencia: string; profCns: string; profCbo: string; seqs: SeqData[] }>();
  const cnesSet = new Set<string>();
  const compSet = new Set<string>();
  let l02 = 0, l03 = 0, qC = 0, qI = 0;
  let ignoradas = 0;

  for (const line of linhas) {
    const tipo = line.slice(0, 2);
    if (tipo === "01") continue;
    if (tipo === "02") {
      if (line.length < 45) { ignoradas++; continue; }
      const { cnes, competencia, row } = parse02(line);
      const k = `${cnes}|${competencia}`;
      let f = mapaC.get(k);
      if (!f) { f = { cnes, competencia, rows: [] }; mapaC.set(k, f); }
      f.rows.push(row);
      cnesSet.add(cnes); compSet.add(competencia); l02++; qC += qtdDe(row.quantidade);
    } else if (tipo === "03") {
      if (line.length < 112) { ignoradas++; continue; }
      const { cnes, competencia, profCns, profCbo, seq } = parse03(line);
      const k = `${cnes}|${competencia}|${profCns}|${profCbo}`;
      let f = mapaI.get(k);
      if (!f) { f = { cnes, competencia, profCns, profCbo, seqs: [] }; mapaI.set(k, f); }
      f.seqs.push(seq);
      cnesSet.add(cnes); compSet.add(competencia); l03++; qI += qtdDe(seq.qtde);
    } else {
      ignoradas++;
    }
  }

  if (ignoradas > 0) avisos.push(`${ignoradas} linha(s) com tipo desconhecido/curta(s) foram ignoradas.`);
  if (l02 === 0 && l03 === 0) avisos.push("Nenhuma linha de produção (02/03) encontrada.");
  const totalLinhas = 1 + l02 + l03;
  if (cabecalho?.linhasDeclaradas != null && cabecalho.linhasDeclaradas !== totalLinhas) {
    avisos.push(`O cabeçalho declara ${cabecalho.linhasDeclaradas} linhas, mas encontrei ${totalLinhas} (com header).`);
  }
  const comps = [...compSet].sort();
  if (cabecalho?.competencia && comps.some((c) => c !== cabecalho.competencia)) {
    avisos.push(`O arquivo tem competências de atendimento diferentes da apresentação (${cabecalho.competencia}): ${comps.join(", ")}.`);
  }

  // Quebra cada grupo em fichas do tamanho do formulário (BPA-I: 3 seqs; BPA-C: 20 linhas),
  // preservando a ordem original. Uma ficha por bloco, numerada (folha 1..N de N).
  const fichasC: FichaBpaCImport[] = [...mapaC.values()].flatMap((g) => {
    const blocos = emBlocos(g.rows, ROWS_POR_FICHA_BPAC);
    return blocos.map((rows, i) => ({ cnes: g.cnes, competencia: g.competencia, rows, folha: i + 1, totalFolhas: blocos.length }));
  });
  const fichasI: FichaBpaIImport[] = [...mapaI.values()].flatMap((g) => {
    const blocos = emBlocos(g.seqs, SEQS_POR_FICHA_BPAI);
    return blocos.map((seqs, i) => ({ cnes: g.cnes, competencia: g.competencia, profCns: g.profCns, profCbo: g.profCbo, seqs, folha: i + 1, totalFolhas: blocos.length }));
  });

  return {
    cabecalho,
    fichasC,
    fichasI,
    totais: { linhas02: l02, linhas03: l03, quantidadeBpaC: qC, quantidadeBpaI: qI },
    cnes: [...cnesSet].sort(),
    competencias: comps,
    avisos,
  };
}
