import { describe, it, expect } from "vitest";
import { gerarPdfTabela, type ColunaPdf } from "./pdf-tabela";

const nome = (i: number) => `ATENDIMENTO FISIOTERAPEUTICO NAS ALTERACOES MOTORAS PROCEDIMENTO ${i}`;
const caso = (linhas: number, meses: number, extras: number) => {
  const colunas: ColunaPdf[] = [
    { titulo: "Procedimento", alinhar: "left" },
    ...Array.from({ length: meses }, (_, i) => ({
      titulo: `Mês ${i + 1}/2026`,
      alinhar: "right" as const,
    })),
    { titulo: "Total", alinhar: "right" },
    ...Array.from({ length: extras }, (_, i) => ({
      titulo: [
        "Valor unitário",
        "Valor total (R$)",
        "% do total",
        "Período anterior",
        "Média por atendimento",
      ][i],
      alinhar: "right" as const,
      extra: true,
    })),
  ];
  const lin = Array.from({ length: linhas }, (_, i) => [
    nome(i),
    ...Array.from({ length: meses + 1 + extras }, () => "R$ 12.345,67"),
  ]);
  return gerarPdfTabela({
    titulo: "Teste",
    infos: ["Período"],
    colunas,
    grupos: [{ linhas: lin, total: ["Total", ...lin[0].slice(1)] }],
  });
};

describe("gerarPdfTabela", () => {
  it("5 linhas sem colunas: retrato, 1 parte", () => {
    const r = caso(5, 0, 0);
    expect(r.orientacaoUsada).toBe("retrato");
    expect(r.partes).toBe(1);
  });
  it("40 linhas, 3 meses + 5 extras: cabe sem dividir e pagina", () => {
    const r = caso(40, 3, 5);
    expect(r.partes).toBe(1);
    expect(r.pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(r.fonte).toBeGreaterThanOrEqual(7);
  });
  it("12 meses + 5 extras: paisagem e dividida em partes", () => {
    const r = caso(20, 12, 5);
    expect(r.orientacaoUsada).toBe("paisagem");
    expect(r.partes).toBeGreaterThan(1);
  });
  it("retrato forçado é respeitado", () => {
    expect(
      gerarPdfTabela({
        titulo: "T",
        infos: [""],
        orientacao: "retrato",
        colunas: [
          { titulo: "A", alinhar: "left" },
          { titulo: "B", alinhar: "right" },
        ],
        grupos: [{ linhas: [["x", "1"]] }],
      }).orientacaoUsada,
    ).toBe("retrato");
  });
});
