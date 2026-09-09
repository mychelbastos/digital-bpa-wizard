import { describe, it, expect } from "vitest";
import { nacionalidadeBpa, nacionalidadeParaCombo, NACIONALIDADES } from "./nacionalidades";

describe("nacionalidadeBpa — código do BPA Magnético (Brasil = 010)", () => {
  it("branco/null vira 010 (regra do gestor)", () => {
    expect(nacionalidadeBpa("")).toBe("010");
    expect(nacionalidadeBpa("   ")).toBe("010");
    expect(nacionalidadeBpa(null)).toBe("010");
    expect(nacionalidadeBpa(undefined)).toBe("010");
  });
  it("situação 1 (Brasileiro) e o antigo 001 viram 010", () => {
    expect(nacionalidadeBpa("1")).toBe("010");
    expect(nacionalidadeBpa("001")).toBe("010");
    expect(nacionalidadeBpa("010")).toBe("010");
  });
  it("naturalizado -> 020, estrangeiro -> 030", () => {
    expect(nacionalidadeBpa("2")).toBe("020");
    expect(nacionalidadeBpa("020")).toBe("020");
    expect(nacionalidadeBpa("3")).toBe("030");
  });
  it("mantém código de 3 dígitos já válido (país importado)", () => {
    expect(nacionalidadeBpa("040")).toBe("040");
    expect(nacionalidadeBpa("245")).toBe("245");
  });
});

describe("nacionalidadeParaCombo — exibição na tela (códigos do BPA)", () => {
  it("as opções do combo usam os códigos do BPA (010/020/030)", () => {
    expect(NACIONALIDADES.map((o) => o.code)).toEqual(["010", "020", "030"]);
  });
  it("normaliza valor legado 1/2/3 para 010/020/030", () => {
    expect(nacionalidadeParaCombo("1")).toBe("010");
    expect(nacionalidadeParaCombo("2")).toBe("020");
    expect(nacionalidadeParaCombo("3")).toBe("030");
    expect(nacionalidadeParaCombo("010")).toBe("010");
  });
  it("vazio continua vazio (não força Brasileiro num campo em branco)", () => {
    expect(nacionalidadeParaCombo("")).toBe("");
    expect(nacionalidadeParaCombo(null)).toBe("");
    expect(nacionalidadeParaCombo("   ")).toBe("");
  });
});
