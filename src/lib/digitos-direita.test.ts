import { describe, it, expect } from "vitest";
import { ancorarDigitosDireita, ancorarCharsDireita } from "./digitos-direita";

describe("ancorarDigitosDireita (Quantidade estilo calculadora)", () => {
  it("digitar 1,2,3,1,2 em 5 caixas cresce da direita para a esquerda", () => {
    expect(ancorarDigitosDireita("1", 5)).toEqual(["", "", "", "", "1"]);
    expect(ancorarDigitosDireita("12", 5)).toEqual(["", "", "", "1", "2"]);
    expect(ancorarDigitosDireita("123", 5)).toEqual(["", "", "1", "2", "3"]);
    expect(ancorarDigitosDireita("1231", 5)).toEqual(["", "1", "2", "3", "1"]);
    expect(ancorarDigitosDireita("12312", 5)).toEqual(["1", "2", "3", "1", "2"]);
  });

  it("estoura à esquerda quando passa de n dígitos (descarta o mais à esquerda)", () => {
    expect(ancorarDigitosDireita("123126", 5)).toEqual(["2", "3", "1", "2", "6"]);
  });

  it("normaliza um valor salvo à esquerda para a direita", () => {
    expect(ancorarDigitosDireita("3", 5)).toEqual(["", "", "", "", "3"]);
  });

  it("ignora não-dígitos (espaços de campos importados)", () => {
    expect(ancorarDigitosDireita("  1 2 ", 5)).toEqual(["", "", "", "1", "2"]);
  });

  it("vazio devolve todas as caixas vazias", () => {
    expect(ancorarDigitosDireita("", 5)).toEqual(["", "", "", "", ""]);
  });
});

describe("ancorarCharsDireita (alfanumérico, ex.: Número do endereço)", () => {
  it("ancora à direita mantendo letras (S/N)", () => {
    expect(ancorarCharsDireita("SN", 4)).toEqual(["", "", "S", "N"]);
    expect(ancorarCharsDireita("234", 4)).toEqual(["", "2", "3", "4"]);
  });

  it("mantém os últimos n caracteres quando estoura", () => {
    expect(ancorarCharsDireita("12345", 4)).toEqual(["2", "3", "4", "5"]);
  });
});
