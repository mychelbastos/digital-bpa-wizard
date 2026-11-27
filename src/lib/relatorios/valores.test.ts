import { describe, it, expect } from "vitest";
import { indexarTetos, valorVigente, resumirValor } from "./valores";

const idx = indexarTetos([
  { cnes: "2510332", procedimento: "0301010072", competencia: "202601", valor_unitario: 10 },
  { cnes: "2510332", procedimento: "0301010072", competencia: "202607", valor_unitario: 12 },
  { cnes: "5847524", procedimento: "0301010072", competencia: "202605", valor_unitario: 20 },
]);

describe("valorVigente", () => {
  it("usa a maior competência ≤ ao mês (vigência)", () => {
    expect(valorVigente(idx, "2510332", "0301010072", "202606")).toBe(10);
    expect(valorVigente(idx, "2510332", "0301010072", "202607")).toBe(12);
    expect(valorVigente(idx, "2510332", "0301010072", "202612")).toBe(12);
  });
  it("sem teto vigente (antes do primeiro teto, ou unidade sem teto) → null", () => {
    expect(valorVigente(idx, "2510332", "0301010072", "202512")).toBeNull();
    expect(valorVigente(idx, "7782926", "0301010072", "202607")).toBeNull();
  });
});

describe("resumirValor", () => {
  it("soma linha a linha por unidade/mês e deixa sem teto fora do total", () => {
    const r = resumirValor(
      [
        { cnes: "2510332", procedimento: "0301010072", mes: "202606", quantidade: 3 }, // 3 × 10
        { cnes: "2510332", procedimento: "0301010072", mes: "202608", quantidade: 2 }, // 2 × 12
        { cnes: "5847524", procedimento: "0301010072", mes: "202608", quantidade: 1 }, // 1 × 20
        { cnes: "7782926", procedimento: "0301010072", mes: "202608", quantidade: 4 }, // sem teto
      ],
      idx,
    );
    expect(r.valorTotal).toBe(74);
    expect(r.qtdComValor).toBe(6);
    expect(r.qtdSemValor).toBe(4);
    expect(r.unitarioMedio).toBeCloseTo(74 / 6); // média ponderada, não (10+12+20)/3
    expect(r.varia).toBe(true);
  });
  it("valor constante não marca variação; nenhuma linha com valor → unitário null", () => {
    expect(
      resumirValor(
        [{ cnes: "2510332", procedimento: "0301010072", mes: "202608", quantidade: 5 }],
        idx,
      ).varia,
    ).toBe(false);
    const vazio = resumirValor(
      [{ cnes: "7782926", procedimento: "0301010072", mes: "202608", quantidade: 5 }],
      idx,
    );
    expect(vazio.unitarioMedio).toBeNull();
    expect(vazio.valorTotal).toBe(0);
  });
});
