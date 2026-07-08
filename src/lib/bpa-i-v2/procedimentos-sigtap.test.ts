import { describe, it, expect } from "vitest";
import { sexoIncompativel, quantidadeExcedida, idadeForaDaFaixa } from "./procedimentos-sigtap";

describe("sexoIncompativel", () => {
  it("acende quando o sexo do paciente diverge do exigido", () => {
    expect(sexoIncompativel("M", "F")).toBe(true);
    expect(sexoIncompativel("F", "M")).toBe(true);
  });
  it("não acende quando bate, ou procedimento é Indiferente/Não se aplica", () => {
    expect(sexoIncompativel("M", "M")).toBe(false);
    expect(sexoIncompativel("I", "F")).toBe(false);
    expect(sexoIncompativel("N", "M")).toBe(false);
  });
  it("não acende sem dado (procedimento sem sexo, ou paciente sem sexo marcado)", () => {
    expect(sexoIncompativel(null, "M")).toBe(false);
    expect(sexoIncompativel("M", "")).toBe(false);
  });
});

describe("quantidadeExcedida", () => {
  it("acende quando ultrapassa o máximo", () => {
    expect(quantidadeExcedida(2, 3)).toBe(true);
  });
  it("não acende dentro do limite, ou sem limite (9999)", () => {
    expect(quantidadeExcedida(2, 2)).toBe(false);
    expect(quantidadeExcedida(9999, 500)).toBe(false);
  });
  it("não acende sem quantidade digitada", () => {
    expect(quantidadeExcedida(2, 0)).toBe(false);
  });
});

describe("idadeForaDaFaixa", () => {
  it("acende abaixo do mínimo ou acima do máximo", () => {
    expect(idadeForaDaFaixa(12, 600, 6)).toBe(true); // 6 meses, mínimo 12
    expect(idadeForaDaFaixa(0, 216, 300)).toBe(true); // 300 meses, máximo 216 (18 anos)
  });
  it("não acende dentro da faixa", () => {
    expect(idadeForaDaFaixa(12, 600, 360)).toBe(false);
  });
  it("9999 em qualquer ponta = não se aplica", () => {
    expect(idadeForaDaFaixa(9999, 9999, 1)).toBe(false);
    expect(idadeForaDaFaixa(9999, 216, 1)).toBe(false);
  });
  it("não acende sem idade calculável", () => {
    expect(idadeForaDaFaixa(12, 600, null)).toBe(false);
  });
});
