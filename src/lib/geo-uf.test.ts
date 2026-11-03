import { describe, it, expect } from "vitest";
import { ufValida, problemaMunicipioUf } from "./geo-uf";

describe("ufValida", () => {
  it("aceita UFs reais e rejeita inexistentes", () => {
    expect(ufValida("29")).toBe(true); // BA
    expect(ufValida("35")).toBe(true); // SP
    expect(ufValida("46")).toBe(false); // não existe (o caso real)
    expect(ufValida("34")).toBe(false);
    expect(ufValida("00")).toBe(false);
    expect(ufValida("")).toBe(false);
    expect(ufValida("2")).toBe(false);
  });
});

describe("problemaMunicipioUf", () => {
  it("acusa o caso real que derrubou a importação (Valfredo: 4680000 / UF 46)", () => {
    const p = problemaMunicipioUf("4680000", "46", "29");
    expect(p).toBeTruthy();
    expect(p).toContain("46");
  });

  it("não acusa um município correto da Bahia (2927200 / UF 29, órgão 29)", () => {
    expect(problemaMunicipioUf("2927200", "29", "29")).toBeNull();
  });

  it("acusa UF de OUTRO estado válido (SIA recusa UF que não é a do estabelecimento)", () => {
    const p = problemaMunicipioUf("3550308", "35", "29"); // SP válido, mas órgão é BA
    expect(p).toBeTruthy();
    expect(p).toContain("outro estado");
  });

  it("acusa UF (coduf) que diverge do IBGE do município", () => {
    const p = problemaMunicipioUf("2927200", "35", "29"); // município BA, coduf SP
    expect(p).toBeTruthy();
  });

  it("sem dado de município/UF não acusa (completude é outra checagem)", () => {
    expect(problemaMunicipioUf("", "", "29")).toBeNull();
  });

  it("deriva a UF do município quando o coduf vem vazio", () => {
    expect(problemaMunicipioUf("2927200", "", "29")).toBeNull(); // deriva 29, OK
    expect(problemaMunicipioUf("4680000", "", "29")).toBeTruthy(); // deriva 46, inválido
  });

  it("sem ufEsperada, só valida a estrutura (não exige estado específico)", () => {
    expect(problemaMunicipioUf("3550308", "35", "")).toBeNull(); // SP válido e coerente
    expect(problemaMunicipioUf("4680000", "46", "")).toBeTruthy(); // 46 não existe
  });
});
