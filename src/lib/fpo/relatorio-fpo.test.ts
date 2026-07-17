import { it, expect } from "vitest";
import { construirPdfFpo } from "./relatorio-fpo";
import type { FpoComparacaoRow } from "./fpo";

const mkRows = (n: number): FpoComparacaoRow[] =>
  Array.from({ length: n }, (_, i) => ({
    procedimento: `03010100${String(i).padStart(2, "0")}`, codigoFpo: null,
    descricao: `Procedimento ${i} com descrição bem longa para forçar truncamento na coluna do relatório`,
    resolvido: i % 10 !== 0, temTeto: i % 7 !== 0, tetoCompetencia: "202604", herdado: i % 5 === 0,
    qtdOrcada: 100 + i, valorUnitario: 4.67, produzido: i * 3, saldo: 100 + i - i * 3,
    tetoRS: (100 + i) * 4.67, produzidoRS: i * 3 * 4.67, saldoRS: (100 + i - i * 3) * 4.67,
  }));

it("52 procedimentos (CLILAB) geram múltiplas páginas — sem sobreposição", () => {
  const pdf = construirPdfFpo({ nomeUnidade: "CLILAB LABORATORIO DE ANALISES CLINICAS", cnes: "3080560", competencia: "202604", rows: mkRows(52) });
  expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
});

it("poucos procedimentos cabem em 1 página", () => {
  const pdf = construirPdfFpo({ nomeUnidade: "SECRETARIA", cnes: "2510375", competencia: "202604", rows: mkRows(6) });
  expect(pdf.getNumberOfPages()).toBe(1);
});
