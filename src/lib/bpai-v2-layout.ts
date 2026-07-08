// BPA-I layout. Coordinates are % of the 1653x2339 background PNG.
// Auto-calibrated against the form image (field boxes detected by pixel analysis,
// each box split into its cell count). Each "sequência" repeats at a vertical offset.

const digitBoxes = (lefts: number[], width: number) =>
  lefts.map((left) => ({ left, width }));

// ---------- HEADER ----------
export const NOME_ESTAB = { top: 10.67, left: 5.44, width: 70.91, height: 1.9 };
export const CNES_TOP = 10.67;
export const CNES_BOXES = digitBoxes([77.25, 79.71, 82.18, 84.64, 87.1, 89.56, 92.03], 2.46);

// ---------- IDENTIFICAÇÃO DO PROFISSIONAL ----------
export const PROF_CNS_TOP = 15.37;
export const PROF_CNS_BOXES = digitBoxes([5.2, 8.18, 11.16, 14.14, 17.12, 20.1, 23.08, 26.06, 29.05, 32.03, 35.01, 37.99, 40.97, 43.95, 46.93], 2.98);
export const PROF_NOME = { top: 15.37, left: 50.7, width: 43.79, height: 1.9 };

export const PROF_ROW2_TOP = 18.02;
export const PROF_CBO_BOXES = digitBoxes([4.9, 10.0, 15.1, 20.2, 25.31, 30.41], 5.1);
export const PROF_MES_BOXES = digitBoxes([36.84, 38.77], 1.93);
export const PROF_ANO_BOXES = digitBoxes([41.4, 43.0, 44.59, 46.19], 1.6);
export const PROF_EQUIPE = { top: 18.02, left: 48.94, width: 36.66, height: 1.9 };
export const PROF_FOLHA_BOXES = digitBoxes([86.93, 89.57, 92.22], 2.64);

// ---------- SEQUÊNCIA TEMPLATE ----------
export const SEQ_TOPS = [24.71, 48.61, 71.36];

export const REL = {
  cnsPac: 0.61,
  cnsPacBoxes: digitBoxes([5.44, 8.44, 11.43, 14.43, 17.43, 20.42, 23.42, 26.42, 29.41, 32.41, 35.41, 38.4, 41.4, 44.4, 47.39], 3.0),
  nomePac: { left: 50.39, width: 44.1 },

  row2: 3.26,
  // Sexo checkboxes — boxes sized to the printed squares; the "X" is centered (align="center").
  sexoM: { left: 8.65, width: 2.06 },
  sexoF: { left: 13.67, width: 2.06 },
  // Data de Nascimento DD / MM / AAAA — cells sit between the two printed slashes (≈21.7% / ≈25.5%).
  dataNascDia: digitBoxes([17.5, 19.2], 1.7),
  dataNascMes: digitBoxes([22.0, 23.6], 1.6),
  dataNascAno: digitBoxes([25.8, 27.2, 28.6, 30.0], 1.4),
  // Plain boxes with no printed cell ticks → free text (variable length on the official form).
  nacionalidade: { left: 32.3, width: 9.3 },
  racaCor: { left: 42.3, width: 7.5 },
  etnia: { left: 50.5, width: 12.3 },
  cep: digitBoxes([62.8, 64.82, 66.84, 68.86, 70.88, 72.89, 74.91, 76.93], 2.02),
  ibge: digitBoxes([79.31, 81.48, 83.65, 85.82, 87.98, 90.15, 92.32], 2.17),

  row3: 5.95,
  codLog: digitBoxes([5.38, 9.37, 13.37], 3.99),
  endereco: { left: 18.09, width: 38.5 },
  numero: digitBoxes([57.41, 58.96, 60.51, 62.06], 1.55),
  complemento: { left: 63.7, width: 30.7 },

  row4: 8.65,
  bairro: { left: 5.32, width: 25.6 },
  ddd: digitBoxes([31.7, 34.36], 2.66),
  // Nº do Telefone — official BPA-I has 8 cells (no slot for the modern leading "9").
  telefone: digitBoxes([37.02, 39.67, 42.32, 44.96, 47.61, 50.26, 52.91, 55.55], 2.65),
  email: { left: 58.92, width: 36.0 },

  procRow1: 13.78,
  // Data do Atendimento DD / MM / AAAA — cells sit between the two printed slashes (≈9.95% / ≈13.8%).
  dataAtendDia: digitBoxes([5.6, 7.4], 1.8),
  dataAtendMes: digitBoxes([10.3, 11.9], 1.6),
  dataAtendAno: digitBoxes([14.1, 15.5, 16.9, 18.3], 1.4),
  codProc: digitBoxes([19.72, 22.58, 25.44, 28.31, 31.17, 34.03, 36.89, 39.75, 42.62, 45.48], 2.86),
  // Quantidade: limitada a 3 dígitos, justificada à direita (usa as 3 células finais
  // do campo impresso, alinhadas à borda direita ~54.69%). Mesmo span total do campo
  // impresso (51.52 a 54.69), só redistribuído com pequenas folgas entre os dígitos
  // p/ não ficarem colados — não muda onde o campo termina (não invade o CNPJ).
  qtde: digitBoxes([51.52, 52.62, 53.72], 0.97),
  cnpj: digitBoxes([54.69, 57.55, 60.4, 63.26, 66.12, 68.97, 71.83, 74.69, 77.54, 80.4, 83.25, 86.11, 88.97, 91.82], 2.86),

  procRow2: 16.9,
  servico: digitBoxes([4.72, 7.44, 10.17], 2.72),
  classProc: digitBoxes([12.89, 15.61, 18.33], 2.72),
  cid: digitBoxes([21.05, 23.38, 25.71, 28.04], 2.33),
  carater: digitBoxes([31.5, 34.3], 2.6),
  autorizacao: digitBoxes([54.63, 57.71, 60.79, 63.87, 66.95, 70.03, 73.11, 76.2, 79.28, 82.36, 85.44, 88.52, 91.6], 3.08),
};

export const DIGIT_H = 2.0;
export const HEADER_DIGIT_H = 1.9;

// ---------- Footer (responsável / gestor / data) ----------
// Responsável: substituído pela CONFIRMAÇÃO ELETRÔNICA (login + botão + auditoria).
// Ocupa a área de carimbo/rubrica (acima da linha DATA).
// No ESPAÇO VAZIO abaixo dos rótulos CARIMBO/RUBRICA (~93.2%) e acima do DATA (~95%).
export const RESP_CONFIRM = { top: 93.35, left: 6.0, width: 39.0, height: 1.6 };
export const GEST_CARIMBO = { top: 93.4, left: 51.0, width: 20.0, height: 1.8 };
export const GEST_RUBRICA = { top: 93.4, left: 79.5, width: 13.0, height: 1.8 };

// Campo DATA do rodapé (Formalização) — DD/MM/AAAA entre as duas barras impressas,
// calibrado por pixel (barras: RESP ~10.8%/14.5%, GEST ~56.5%/59.8%). Área compacta.
export const DATA_TOP = 94.95;
export const DATA_H = 1.25;
// Barras impressas: RESP ~10.9%/14.4% ("DATA" termina ~8.3%); GEST ~56.5%/59.9% (~45.5% offset).
export const RESP_DATA_DIA = digitBoxes([8.9, 9.9], 1.0);
export const RESP_DATA_MES = digitBoxes([11.4, 12.6], 1.2);
export const RESP_DATA_ANO = digitBoxes([14.8, 15.8, 16.8, 17.8], 1.0);
export const GEST_DATA_DIA = digitBoxes([54.4, 55.4], 1.0);
export const GEST_DATA_MES = digitBoxes([56.9, 58.1], 1.2);
export const GEST_DATA_ANO = digitBoxes([60.3, 61.3, 62.3, 63.3], 1.0);

export interface SeqData {
  cnsPac: string[];
  nomePac: string;
  sexo: "M" | "F" | "";
  dataNasc: string[]; // 8 digits
  nacionalidade: string; // free text (no printed cells)
  racaCor: string; // free text
  etnia: string; // free text
  cep: string[];
  ibge: string[];
  codLog: string[];
  endereco: string;
  numero: string[]; // 4 dígitos
  complemento: string;
  bairro: string;
  ddd: string[];
  telefone: string[];
  email: string;
  dataAtend: string[]; // 8 digits
  dataAtendConfirmada: boolean; // true = pessoa confirmou o aviso de >120 dias p/ esta data
  codProc: string[];
  qtde: string[];
  cnpj: string[];
  servico: string[];
  classProc: string[];
  cid: string[];
  carater: string[];
  autorizacao: string[];
}

export const emptySeq = (): SeqData => ({
  cnsPac: Array(15).fill(""),
  nomePac: "",
  sexo: "",
  dataNasc: Array(8).fill(""),
  nacionalidade: "1", // v2: padrão Brasileiro (situação de nacionalidade, código CADSUS)
  racaCor: "",
  etnia: "", // v2: só preenchido quando Raça/Cor = Indígena (Portaria 508, Art. 2º)
  cep: "46800000".split(""), // padrão da unidade (CEP)
  ibge: "2927200".split(""), // padrão da unidade (Cód. IBGE do município)
  codLog: Array(3).fill(""),
  endereco: "",
  numero: Array(4).fill(""),
  complemento: "",
  bairro: "",
  ddd: Array(2).fill(""),
  telefone: Array(8).fill(""),
  email: "",
  dataAtend: Array(8).fill(""),
  dataAtendConfirmada: false,
  codProc: Array(10).fill(""),
  qtde: Array(3).fill(""),
  cnpj: Array(14).fill(""),
  servico: Array(3).fill(""),
  classProc: Array(3).fill(""),
  cid: Array(4).fill(""),
  carater: Array(2).fill(""),
  autorizacao: Array(13).fill(""),
});
