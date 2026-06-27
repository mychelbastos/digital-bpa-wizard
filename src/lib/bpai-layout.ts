// BPA-I layout. Coordinates are % of the 1653×2339 background PNG.
// Each "sequência" repeats with the same internal structure at a vertical offset.

const CELL_W = 1.85; // typical digit cell width %

const digitBoxes = (lefts: number[], width = CELL_W) =>
  lefts.map((left) => ({ left, width }));

// ---------- HEADER ----------
// Nome do Estabelecimento (text) + CNES (7 digits) on the right
export const NOME_ESTAB = { top: 11.4, left: 4.5, width: 70, height: 1.5 };
export const CNES_TOP = 11.4;
export const CNES_BOXES = digitBoxes([76.5, 79.0, 81.5, 84.0, 86.5, 89.0, 91.5]);

// ---------- IDENTIFICAÇÃO DO PROFISSIONAL ----------
export const PROF_CNS_TOP = 16.4;
export const PROF_CNS_BOXES = digitBoxes(
  [5.0, 7.0, 9.0, 11.0, 14.0, 16.0, 18.0, 20.0, 23.0, 25.0, 27.0, 29.0, 32.0, 34.0, 36.0],
);
export const PROF_NOME = { top: 16.4, left: 49.5, width: 47.5, height: 1.5 };

export const PROF_ROW2_TOP = 20.7;
export const PROF_CBO_BOXES = digitBoxes([5.0, 7.0, 9.0, 11.0, 13.0, 15.0]);
export const PROF_MES_BOXES = digitBoxes([34.5, 36.5]);
export const PROF_ANO_BOXES = digitBoxes([39.5, 41.5, 43.5, 45.5]);
export const PROF_EQUIPE = { top: 20.7, left: 50.0, width: 40.0, height: 1.5 };
export const PROF_FOLHA_BOXES = digitBoxes([91.0, 93.0, 95.0]);

// ---------- SEQUÊNCIA TEMPLATE ----------
// All fields are relative to the top of a sequência block.
// Seq base tops: Seq1=24.5%, Seq2=46.5%, Seq3=68.5%  (diff ≈ 22%)
export const SEQ_TOPS = [24.5, 46.5, 68.5];

// Within-sequence relative offsets (% of page, ADDED to SEQ_TOP)
export const REL = {
  // Identificação do Paciente
  cnsPac: 2.8,        // row top
  cnsPacBoxes: digitBoxes([5.0, 7.0, 9.0, 11.0, 14.0, 16.0, 18.0, 20.0, 23.0, 25.0, 27.0, 29.0, 32.0, 34.0, 36.0]),
  nomePac: { left: 49.5, width: 47.5 },

  row2: 7.7,          // Sexo / DataNasc / Nacion / RaçaCor / Etnia / CEP / IBGE
  sexoM: { left: 6.5, width: 2.0 },
  sexoF: { left: 12.5, width: 2.0 },
  dataNascDia: digitBoxes([20.0, 22.0]),
  dataNascMes: digitBoxes([25.5, 27.5]),
  dataNascAno: digitBoxes([31.0, 33.0, 35.0, 37.0]),
  nacionalidade: digitBoxes([40.5, 42.5, 44.5]),
  racaCor: digitBoxes([48.5, 50.5]),
  etnia: digitBoxes([55.0, 57.0, 59.0, 61.0]),
  cep: digitBoxes([67.0, 69.0, 71.0, 73.0, 75.0, 77.0, 79.0, 81.0]),
  ibge: digitBoxes([86.5, 88.5, 90.5, 92.5, 94.5]),

  row3: 11.5,         // CodLogradouro / Endereço / Número / Complemento
  codLog: digitBoxes([5.0, 7.0, 9.0]),
  endereco: { left: 16.0, width: 48.0 },
  numero: { left: 67.5, width: 8.0 },
  complemento: { left: 78.0, width: 18.0 },

  row4: 14.6,         // Bairro / DDD / Telefone / Email
  bairro: { left: 5.0, width: 30.0 },
  ddd: digitBoxes([37.5, 39.5]),
  telefone: digitBoxes([43.5, 45.5, 47.5, 49.5, 51.5, 53.5, 55.5, 57.5, 59.5]),
  email: { left: 64.0, width: 32.0 },

  // Procedimento Realizado
  procRow1: 19.6,     // Data atend / Código proc / Qtde / CNPJ
  dataAtendDia: digitBoxes([5.0, 7.0]),
  dataAtendMes: digitBoxes([10.5, 12.5]),
  dataAtendAno: digitBoxes([16.0, 18.0, 20.0, 22.0]),
  codProc: digitBoxes([27.5, 29.5, 31.5, 33.5, 35.5, 37.5, 39.5, 41.5, 43.5, 45.5]),
  qtde: digitBoxes([50.5, 52.5, 54.5, 56.5, 58.5, 60.5]),
  cnpj: digitBoxes([66.0, 68.0, 70.0, 72.0, 74.0, 76.0, 78.0, 80.0, 82.0, 84.0, 86.0, 88.0, 90.0, 92.0]),

  procRow2: 23.0,     // Serviço / Class / CID / Caráter / Nº autorização
  servico: digitBoxes([5.0, 7.0, 9.0]),
  classProc: digitBoxes([12.5, 14.5, 16.5]),
  cid: digitBoxes([20.0, 22.0, 24.0, 26.0]),
  carater: digitBoxes([34.0, 36.0]),
  autorizacao: digitBoxes([41.0, 43.0, 45.0, 47.0, 49.0, 51.0, 53.0, 55.0, 57.0, 59.0, 61.0, 63.0, 65.0]),
};

export const DIGIT_H = 1.6;        // height for normal digit cells
export const HEADER_DIGIT_H = 1.6;

// ---------- Footer (responsável / gestor / data) ----------
// Free-text — keeping minimal for v1
export const RESP_CARIMBO = { top: 91.3, left: 5.0, width: 25.0, height: 1.5 };
export const RESP_RUBRICA = { top: 91.3, left: 32.0, width: 17.5, height: 1.5 };
export const RESP_DATA = { top: 95.3, left: 9.0, width: 15.0, height: 1.5 };
export const GEST_CARIMBO = { top: 91.3, left: 52.0, width: 24.0, height: 1.5 };
export const GEST_RUBRICA = { top: 91.3, left: 78.0, width: 17.5, height: 1.5 };
export const GEST_DATA = { top: 95.3, left: 56.0, width: 15.0, height: 1.5 };

export interface SeqData {
  cnsPac: string[];
  nomePac: string;
  sexo: "M" | "F" | "";
  dataNasc: string[]; // 8 digits
  nacionalidade: string[];
  racaCor: string[];
  etnia: string[];
  cep: string[];
  ibge: string[];
  codLog: string[];
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  ddd: string[];
  telefone: string[];
  email: string;
  dataAtend: string[]; // 8 digits
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
  nacionalidade: Array(3).fill(""),
  racaCor: Array(2).fill(""),
  etnia: Array(4).fill(""),
  cep: Array(8).fill(""),
  ibge: Array(5).fill(""),
  codLog: Array(3).fill(""),
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  ddd: Array(2).fill(""),
  telefone: Array(9).fill(""),
  email: "",
  dataAtend: Array(8).fill(""),
  codProc: Array(10).fill(""),
  qtde: Array(6).fill(""),
  cnpj: Array(14).fill(""),
  servico: Array(3).fill(""),
  classProc: Array(3).fill(""),
  cid: Array(4).fill(""),
  carater: Array(2).fill(""),
  autorizacao: Array(13).fill(""),
});
