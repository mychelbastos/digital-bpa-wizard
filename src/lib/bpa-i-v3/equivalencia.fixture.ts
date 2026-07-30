// GOLDEN de equivalência V3 ⇄ V4.
//
// Uma ficha BPA-I realista fixada como referência: o V4 é só uma cara nova sobre o MESMO
// motor do V3, então ambos DEVEM produzir exatamente este `dados.seqs` e, a partir dele, o
// MESMO `.MAR`. Este fixture é a "prova viva" — é usado por:
//   - equivalencia.golden.test.ts (fotografa as linhas .MAR geradas pelo motor atual);
//   - (após a Etapa 1) o teste do useBpaIEngine, que reconstrói este State via ações do
//     hook e deve bater IGUAL a este fixture (mesmo dados.seqs) e gerar o mesmo .MAR.
//
// Observação de projeto: as seqs trazem `pacienteId` de propósito — ele NÃO pode alterar o
// .MAR (o gerador o ignora). Isso comprova que uma ficha do V4 (com vínculo de paciente) é
// indistinguível de uma do V3 no arquivo enviado ao SIA/SUS.
import { emptySeq, type SeqData } from "@/lib/bpai-v2-layout";
import { linhaBpaI, seqPreenchida, type DadosBpa } from "@/lib/bpa-i-v2/bpa-magnetico";

const cells = (s: string, n: number) => Array.from({ length: n }, (_, i) => s[i] ?? "");

// Seq 1 — paciente vinculado, Raça/Cor Indígena (etnia habilitada), procedimento com CID
// e Serviço/Classificação, caráter Eletivo.
function seq1(): SeqData {
  return {
    ...emptySeq(),
    pacienteId: "11111111-1111-1111-1111-111111111111",
    cnsPac: cells("700000000000005", 15),
    nomePac: "MARIA DAS DORES INDÍGENA",
    sexo: "F",
    dataNasc: cells("15031990", 8),
    nacionalidade: "010",
    racaCor: "05", // Indígena → etnia obrigatória
    etnia: "0001",
    cep: cells("46800000", 8),
    ibge: cells("2927200", 7),
    codLog: cells("081", 3),
    endereco: "RUA DIREITA",
    numero: cells("100", 4),
    bairro: "CENTRO",
    dataAtend: cells("10062026", 8),
    codProc: cells("0301010013", 10),
    qtde: cells("002", 3),
    servico: cells("135", 3),
    classProc: cells("003", 3),
    cid: cells("A090", 4),
    carater: cells("01", 2),
  };
}

// Seq 2 — mesmo paciente NÃO; outro paciente vinculado, Parda, sem CID, urgência.
function seq2(): SeqData {
  return {
    ...emptySeq(),
    pacienteId: "22222222-2222-2222-2222-222222222222",
    cnsPac: cells("700000000000013", 15),
    nomePac: "JOÃO DE SOUSA",
    sexo: "M",
    dataNasc: cells("02121985", 8),
    nacionalidade: "010",
    racaCor: "03",
    cep: cells("46800000", 8),
    ibge: cells("2927200", 7),
    codLog: cells("081", 3),
    endereco: "AV BRASIL",
    numero: cells("SN", 4),
    bairro: "SAO JOSE",
    dataAtend: cells("11062026", 8),
    codProc: cells("0301010021", 10),
    qtde: cells("001", 3),
    carater: cells("02", 2),
  };
}

// A ficha de referência (cabeçalho + 3 seqs, 2 preenchidas).
export const FICHA_GOLDEN: DadosBpa = {
  cnes: cells("2510332", 7),
  profCns: cells("123456789010000", 15),
  profCbo: cells("225125", 6),
  profMes: cells("06", 2),
  profAno: cells("2026", 4),
  profFolha: cells("001", 3),
  seqs: [seq1(), seq2(), emptySeq()],
};

// Gera as linhas 03 (BPA-I) do .MAR para as seqs preenchidas — a folha 1, seq numerada 1..n.
export function linhasMarGolden(d: DadosBpa = FICHA_GOLDEN, folha = 1): string[] {
  const preenchidas = d.seqs.filter(seqPreenchida);
  return preenchidas.map((s, i) => linhaBpaI(d, s, folha, i + 1));
}
