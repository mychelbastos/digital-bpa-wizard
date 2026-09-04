import { describe, it, expect } from "vitest";
import { ehFpoMagnetico, parseFpoMagnetico } from "./parse-fpo-magnetico";

// Cifra inversa (dígito → símbolo) só para montar linhas de teste sintéticas.
const INV: Record<string, string> = { "0": "*", "1": ".", "2": ";", "3": "/", "4": "?", "5": ":", "6": ">", "7": ",", "8": "(", "9": ")" };
const enc = (digs: string) => [...digs].map((d) => INV[d]).join("");

// Monta um registro (62 díg.): comp + cnes + proc9 + fixo(2) + qtd(8) + unit(15) + total(15).
function registro(comp: string, cnes: string, proc9: string, qtd: number, unitCent: number) {
  const totalCent = qtd * unitCent;
  const digs =
    comp + cnes + proc9 + "21" +
    String(qtd).padStart(8, "0") +
    String(unitCent).padStart(15, "0") +
    String(totalCent).padStart(15, "0");
  return enc(digs);
}

describe("parseFpoMagnetico", () => {
  const arquivo = [
    "ÃÇF;*;>*,*/0*.EEEEEE",                              // cabeçalho (tem letras) — ignorado
    registro("202607", "2510332", "020501001", 100, 16500), // 100 × R$165,00
    registro("202607", "2510332", "030101004", 30, 3960),   // 30 × R$39,60
    registro("202607", "3080560", "020201007", 4, 1000),    // outra unidade: 4 × R$10,00
  ].join("\r\n");

  it("detecta o formato do FPO Magnético", () => {
    expect(ehFpoMagnetico(arquivo)).toBe(true);
    expect(ehFpoMagnetico("<html><table><tr><td>Unidade</td></tr></table></html>")).toBe(false);
  });

  it("decifra, agrupa por CNES e lê competência/código(9)/qtd/valor", () => {
    const r = parseFpoMagnetico(arquivo);
    expect(r.competencia).toBe("202607");
    expect(r.grupos).toHaveLength(2);

    const g1 = r.grupos.find((g) => g.cnes === "2510332")!;
    expect(g1.linhas).toHaveLength(2);
    expect(g1.linhas[0]).toEqual({ codigoFpo: "020501001", descricao: "", qtdOrcada: 100, valorUnitario: 165 });
    expect(g1.linhas[1].valorUnitario).toBeCloseTo(39.6, 2);

    const g2 = r.grupos.find((g) => g.cnes === "3080560")!;
    expect(g2.linhas).toHaveLength(1);
    expect(g2.linhas[0].qtdOrcada).toBe(4);
  });

  it("descarta linha cujo total ≠ qtd × unit (rodapé/lixo)", () => {
    // total adulterado: usa enc manual com total errado.
    const comp = "202607", cnes = "2510332", proc = "020501001";
    const ruim = enc(comp + cnes + proc + "21" + "00000100" + "000000000016500" + "000000000000001");
    const r = parseFpoMagnetico(ruim);
    expect(r.grupos).toHaveLength(0);
    expect(r.avisos.some((a) => a.includes("ignorada"))).toBe(true);
  });
});
