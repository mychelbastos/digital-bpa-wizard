import { describe, it, expect } from "vitest";
import { nacionalidadeBpa } from "./nacionalidades";

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
