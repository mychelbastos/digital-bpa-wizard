import { describe, it, expect } from "vitest";
import { emptyRow, ordenarRowsPorIdade, type RowData } from "./bpac-layout";

const cells = (s: string, n: number) => Array.from({ length: n }, (_, i) => s[i] ?? "");

// Cria uma linha com procedimento/idade/quantidade/CBO — o CBO serve de "carimbo" (6 letras)
// para provar que a LINHA INTEIRA se move junto (não só a coluna de idade).
function row(idade: string, marca: string): RowData {
  return {
    procedimento: cells("0301010015", 10),
    cbo: cells(marca, 6),
    idade: cells(idade, 3),
    quantidade: cells("1", 5),
  };
}

const idadesDe = (rows: RowData[]) => rows.map((r) => r.idade.join(""));
const marcasDe = (rows: RowData[]) => rows.map((r) => r.cbo.join(""));

describe("ordenarRowsPorIdade (BPA-C)", () => {
  it("ordena as sequências por idade crescente movendo a linha inteira junto", () => {
    const out = ordenarRowsPorIdade([row("40", "AAAAAA"), row("5", "BBBBBB"), row("18", "CCCCCC")]);
    expect(idadesDe(out)).toEqual(["5", "18", "40"]);
    // O CBO (carimbo) acompanha a idade: 5->BBBBBB, 18->CCCCCC, 40->AAAAAA.
    expect(marcasDe(out)).toEqual(["BBBBBB", "CCCCCC", "AAAAAA"]);
  });

  it("empurra as linhas vazias para o fim e preserva o total de linhas", () => {
    const out = ordenarRowsPorIdade([emptyRow(), row("30", "AAAAAA"), emptyRow(), row("10", "BBBBBB")]);
    expect(out).toHaveLength(4);
    expect(marcasDe(out.slice(0, 2))).toEqual(["BBBBBB", "AAAAAA"]);
    expect(out.slice(2).every((r) => r.procedimento.join("") === "")).toBe(true);
  });

  it("coloca linhas preenchidas SEM idade depois das que têm idade, antes das vazias", () => {
    const out = ordenarRowsPorIdade([row("", "SEMIDA"), row("60", "IDADE6"), emptyRow()]);
    expect(marcasDe(out)).toEqual(["IDADE6", "SEMIDA", ""]);
  });

  it("empate de idade mantém a ordem original (estável)", () => {
    const out = ordenarRowsPorIdade([row("20", "PRIME1"), row("20", "SEGUN2"), row("20", "TERCE3")]);
    expect(marcasDe(out)).toEqual(["PRIME1", "SEGUN2", "TERCE3"]);
  });
});
