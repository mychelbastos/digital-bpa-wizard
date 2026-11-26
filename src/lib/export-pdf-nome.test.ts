import { describe, it, expect } from "vitest";
import { nomeArquivoFicha } from "./export-pdf";

describe("nomeArquivoFicha", () => {
  it("usa o nome da ficha e troca a barra da competência", () => {
    expect(nomeArquivoFicha("2510332 · GERALDO BENSABATH · 11/2026 · folha 1")).toBe("2510332 · GERALDO BENSABATH · 11-2026 · folha 1.pdf");
  });
  it("remove caracteres proibidos e cai em 'ficha' se vazio", () => {
    expect(nomeArquivoFicha('a:b*c?"<>|')).toBe("abc.pdf");
    expect(nomeArquivoFicha("  ")).toBe("ficha.pdf");
  });
});
