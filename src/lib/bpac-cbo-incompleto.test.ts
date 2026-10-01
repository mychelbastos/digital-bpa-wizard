import { describe, it, expect } from "vitest";
import { cboIncompletoNaLinha, emptyRow, type RowData } from "./bpac-layout";

const cells = (s: string, n: number) => Array.from({ length: n }, (_, i) => s[i] ?? "");
const row = (proc: string, cbo: string): RowData => ({
  procedimento: cells(proc, 10),
  cbo: cells(cbo, 6),
  idade: cells("", 3),
  quantidade: cells("1", 5),
});

describe("cboIncompletoNaLinha (BPA-C)", () => {
  it("acusa CBO com 5 dígitos (o caso reportado: procedimento completo, CBO faltando 1)", () => {
    expect(cboIncompletoNaLinha(row("0214010058", "32205"))).toBe(true);
  });

  it("acusa CBO parcial mesmo sem procedimento completo", () => {
    expect(cboIncompletoNaLinha(row("021", "322"))).toBe(true);
  });

  it("acusa procedimento completo SEM nenhum CBO", () => {
    expect(cboIncompletoNaLinha(row("0214010058", ""))).toBe(true);
  });

  it("aceita a linha completa (procedimento 10 + CBO 6)", () => {
    expect(cboIncompletoNaLinha(row("0214010074", "322205"))).toBe(false);
  });

  it("não acusa linha totalmente vazia", () => {
    expect(cboIncompletoNaLinha(emptyRow())).toBe(false);
  });

  it("não acusa procedimento incompleto quando o CBO ainda não foi tocado (digitação em andamento)", () => {
    expect(cboIncompletoNaLinha(row("021", ""))).toBe(false);
  });
});
