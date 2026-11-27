import { describe, it, expect } from "vitest";
import { montarPivo, faixaEtaria, periodoAnterior } from "./pivo";
import type { ProducaoBpaRow } from "@/lib/dashboard-producao";

const r = (p: Partial<ProducaoBpaRow>): ProducaoBpaRow =>
  ({
    id: Math.random().toString(),
    ficha_id: "f",
    tipo: "BPA-I",
    competencia: "202609",
    mes_producao: "202609",
    cnes: "2510332",
    estabelecimento_nome: null,
    profissional_cns: "1",
    profissional_nome: null,
    cbo: null,
    procedimento: "0301010072",
    quantidade: 1,
    servico: null,
    classificacao: null,
    cid: null,
    carater: null,
    idade: 30,
    ...p,
  }) as ProducaoBpaRow;

const soma = (c: string, n: number) => {
  let a = Number(c.slice(0, 4)),
    m = Number(c.slice(4, 6)) + n;
  a += Math.floor((m - 1) / 12);
  m = ((((m - 1) % 12) + 12) % 12) + 1;
  return `${a}${String(m).padStart(2, "0")}`;
};

describe("montarPivo", () => {
  const rows = [
    r({ procedimento: "A", quantidade: 5, mes_producao: "202608" }),
    r({ procedimento: "A", quantidade: 2, mes_producao: "202609" }),
    r({ procedimento: "B", quantidade: 9, mes_producao: "202609", tipo: "BPA-C" }),
  ];
  it("soma procedimentos, ordena do maior e fecha o total com as colunas", () => {
    const p = montarPivo(rows, "procedimento", "mes", "proc");
    expect(p.linhas.map((l) => l.key)).toEqual(["B", "A"]);
    expect(p.colunas).toEqual(["202608", "202609"]);
    expect(p.linhas[1].celulas).toEqual({ "202608": 5, "202609": 2 });
    expect(p.total).toBe(16);
    expect(p.totalPorColuna["202609"]).toBe(11);
  });
  it("conta atendimentos (linhas) quando a medida é atendimento", () => {
    const p = montarPivo(rows, "procedimento", "nada", "atend");
    expect(p.linhas.find((l) => l.key === "A")?.total).toBe(2);
    expect(p.total).toBe(3);
  });
});

describe("faixas e período anterior", () => {
  it("faixa etária", () => {
    expect([
      faixaEtaria(0),
      faixaEtaria(11),
      faixaEtaria(12),
      faixaEtaria(59),
      faixaEtaria(60),
      faixaEtaria(null),
    ]).toEqual([
      "0–11 anos",
      "0–11 anos",
      "12–17 anos",
      "18–59 anos",
      "60 anos ou mais",
      "Sem idade",
    ]);
  });
  it("período anterior do mesmo tamanho", () => {
    expect(periodoAnterior("202608", "202610", soma)).toEqual(["202605", "202607"]);
    expect(periodoAnterior("202601", "202601", soma)).toEqual(["202512", "202512"]);
  });
});
