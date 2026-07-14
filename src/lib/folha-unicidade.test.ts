import { describe, it, expect } from "vitest";
import { gerarArquivoMes } from "./fechamento-mes";
import { configVazia } from "./bpa-i-v2/config";
import { emptySeq } from "./bpai-v2-layout";
import { emptyRow } from "./bpac-layout";
import type { FichaCompleta } from "./bpa-i-v2/fichas";

// Fase 5 — chave de unicidade confirmada no PA292720.MAR: (CNES, prof/CBO, competência,
// folha, sequência). O nº de folha é REUTILIZADO a cada competência (folha 001 de fev e
// de mar coexistem no mesmo arquivo), então a competência é indispensável na chave. O
// fechamento renumera as folhas em sequência no arquivo, então a chave é única por
// construção — este teste crava esse invariante contra regressões.

const cells = (s: string, n: number) => Array.from({ length: n }, (_, i) => s[i] ?? "");
const cfg = () => ({
  ...configVazia(),
  orgaoOrigemNome: "PREF",
  sigla: "PMEX",
  cgcCpf: "12345678000199",
  orgaoDestinoNome: "SES",
  destinoTipo: "E" as const,
});

function bpaI(comp: string, folha: string): FichaCompleta {
  const seq = {
    ...emptySeq(),
    codProc: cells("0301010013", 10),
    qtde: cells("001", 3),
    dataAtend: cells(`1505${comp.slice(0, 4)}`, 8),
  };
  return {
    id: comp + folha + "i",
    tipo: "BPA-I",
    mes_producao: "202607",
    dados: {
      cnes: cells("2510332", 7),
      profCns: cells("700000000000005", 15),
      profCbo: cells("225125", 6),
      profMes: cells(comp.slice(4, 6), 2),
      profAno: cells(comp.slice(0, 4), 4),
      profFolha: cells(folha, 3),
      seqs: [seq, { ...seq }, { ...seq }],
    },
  };
}
function bpaC(comp: string, folha: string): FichaCompleta {
  const row = {
    ...emptyRow(),
    procedimento: cells("0301010013", 10),
    cbo: cells("225125", 6),
    quantidade: cells("00001", 5),
  };
  return {
    id: comp + folha + "c",
    tipo: "BPA-C",
    mes_producao: "202607",
    dados: {
      cnes: cells("2510332", 7),
      ano: cells(comp.slice(0, 4), 4),
      mes: cells(comp.slice(4, 6), 2),
      folhaBase: cells(folha, 3),
      rows: [row, { ...row }],
    },
  };
}

describe("Fase 5 — unicidade de folha (CNES, prof/CBO, competência, folha, seq)", () => {
  // Duas competências, MESMA folha-base (001) em cada — o cenário que colidia sem competência.
  const fichas = [
    bpaI("202512", "001"),
    bpaI("202601", "001"),
    bpaC("202512", "001"),
    bpaC("202601", "001"),
  ];
  const { arquivo, resumo } = gerarArquivoMes(
    fichas,
    "202607",
    cells("2026", 4),
    cells("07", 2),
    cfg(),
  );

  it("o gerador não produz chaves duplicadas", () => {
    expect(resumo.chavesDuplicadas).toBe(0);
  });

  it("todas as linhas do arquivo têm chave única (parse independente)", () => {
    const linhas = arquivo!.conteudo.split("\r\n").filter(Boolean).slice(1); // fora header
    const chaves = linhas.map((l) => {
      const tipo = l.slice(0, 2);
      const cnes = l.slice(2, 9);
      const comp = l.slice(9, 15);
      if (tipo === "02")
        return `02|${cnes}|${l.slice(15, 21)}|${comp}|${l.slice(21, 24)}|${l.slice(24, 26)}`; // cbo/folha/seq
      return `03|${cnes}|${l.slice(15, 30)}|${comp}|${l.slice(44, 47)}|${l.slice(47, 49)}`; // profCns/folha/seq
    });
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(chaves.length).toBe(resumo.totalLinhas);
  });
});
