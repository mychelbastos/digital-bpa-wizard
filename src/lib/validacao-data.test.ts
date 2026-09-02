import { describe, it, expect } from "vitest";
import { anoAte4Digitos, nascimentoValido } from "./validacao-data";

describe("nascimentoValido — crivo DD/MM/AAAA", () => {
  it("aceita data completa e coerente", () => {
    expect(nascimentoValido("1980-10-16")).toBe(true);
    expect(nascimentoValido("2000-02-29")).toBe(true); // ano bissexto
  });

  it("REPROVA ano com menos de 4 dígitos (26 -> 0026)", () => {
    expect(nascimentoValido("0026-10-16")).toBe(false);
    expect(nascimentoValido("26-10-16")).toBe(false);
    expect(nascimentoValido("026-10-16")).toBe(false);
  });

  it("reprova vazio/ausente", () => {
    expect(nascimentoValido("")).toBe(false);
    expect(nascimentoValido(null)).toBe(false);
    expect(nascimentoValido(undefined)).toBe(false);
  });

  it("reprova data impossível (31/02) e mês/dia inválidos", () => {
    expect(nascimentoValido("2001-02-29")).toBe(false); // não bissexto
    expect(nascimentoValido("1990-13-01")).toBe(false);
    expect(nascimentoValido("1990-00-10")).toBe(false);
  });

  it("reprova data no futuro e ano antes de 1900", () => {
    const proxAno = new Date().getFullYear() + 1;
    expect(nascimentoValido(`${proxAno}-01-01`)).toBe(false);
    expect(nascimentoValido("1899-12-31")).toBe(false);
  });
});

describe("anoAte4Digitos (guard de digitação)", () => {
  it("aceita até 4 dígitos no ano e vazio", () => {
    expect(anoAte4Digitos("")).toBe(true);
    expect(anoAte4Digitos("1999-08-14")).toBe(true);
    expect(anoAte4Digitos("26-08-14")).toBe(true); // durante a digitação
  });
  it("recusa 5+ dígitos no ano", () => {
    expect(anoAte4Digitos("19996-08-14")).toBe(false);
  });
});
