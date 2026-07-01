import { describe, it, expect } from "vitest";
import { validarCns, cnsInvalido, dataValida, dataFuturaOuInvalida } from "./validacao";

describe("validarCns", () => {
  it("aceita CNS provisório válido (início 7)", () => {
    expect(validarCns("700000000000005")).toBe(true);
  });
  it("aceita CNS definitivo válido (início 1 e 2)", () => {
    expect(validarCns("123456789010000")).toBe(true);
    expect(validarCns("200000000000003")).toBe(true);
  });
  it("rejeita comprimento errado", () => {
    expect(validarCns("1234567890")).toBe(false);
    expect(validarCns("1234567890100000")).toBe(false);
  });
  it("rejeita dígito adulterado", () => {
    expect(validarCns("700000000000006")).toBe(false);
    expect(validarCns("123456789010001")).toBe(false);
  });
  it("rejeita início inválido (0,3,4,5,6)", () => {
    expect(validarCns("000000000000000")).toBe(false);
    expect(validarCns("300000000000000")).toBe(false);
  });
  it("cnsInvalido só acende quando completo (15) e inválido", () => {
    expect(cnsInvalido("70000000000000")).toBe(false); // incompleto
    expect(cnsInvalido("700000000000006")).toBe(true); // completo e inválido
    expect(cnsInvalido("700000000000005")).toBe(false); // válido
  });
});

const digs = (s: string) => s.split("");

describe("dataValida", () => {
  it("aceita datas de calendário reais", () => {
    expect(dataValida(digs("29022020"))).toBe(true); // bissexto
    expect(dataValida(digs("15031990"))).toBe(true);
  });
  it("rejeita datas impossíveis", () => {
    expect(dataValida(digs("31022020"))).toBe(false); // 31/fev
    expect(dataValida(digs("00012020"))).toBe(false); // dia 0
    expect(dataValida(digs("15132020"))).toBe(false); // mês 13
    expect(dataValida(digs("29022021"))).toBe(false); // não-bissexto
  });
  it("rejeita incompleto", () => {
    expect(dataValida(digs("1503"))).toBe(false);
  });
});

describe("dataFuturaOuInvalida", () => {
  it("não acende para incompleto", () => {
    expect(dataFuturaOuInvalida(digs("1503"))).toBe(false);
  });
  it("acende para inválida de calendário", () => {
    expect(dataFuturaOuInvalida(digs("31022020"))).toBe(true);
  });
  it("acende para data no futuro", () => {
    expect(dataFuturaOuInvalida(digs("01012099"))).toBe(true);
  });
  it("não acende para data passada válida", () => {
    expect(dataFuturaOuInvalida(digs("15031990"))).toBe(false);
  });
});
