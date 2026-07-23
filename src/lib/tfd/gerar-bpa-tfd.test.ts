import { describe, it, expect } from "vitest";
import { gerarProcedimentosTfd, gerarProcedimentosTfdPorData, unidadesDeslocamentoPorViagem, COD_TFD, type LinhaBpaTfd } from "./gerar-bpa-tfd";

// Atalho: mapa código → quantidade, p/ asserts legíveis.
const mapa = (linhas: LinhaBpaTfd[]) => Object.fromEntries(linhas.map((l) => [l.codigo, l.quantidade]));

describe("unidadesDeslocamentoPorViagem — arredondamento matemático (distância só de ida)", () => {
  // Exemplos confirmados pelo Mychel (expressos como TOTAL ida+volta): 400→8, 440→9, 480→10, 60→1.
  it("bate os exemplos confirmados (ida = total/2)", () => {
    expect(unidadesDeslocamentoPorViagem(200)).toBe(8);   // 400 total /50 = 8
    expect(unidadesDeslocamentoPorViagem(220)).toBe(9);   // 440 /50 = 8,8 → 9
    expect(unidadesDeslocamentoPorViagem(240)).toBe(10);  // 480 /50 = 9,6 → 10
    expect(unidadesDeslocamentoPorViagem(30)).toBe(1);    // 60 /50 = 1,2 → 1
  });
  it("respeita ≥0,5 sobe e <0,5 desce", () => {
    expect(unidadesDeslocamentoPorViagem(12.5)).toBe(1);  // 25 /50 = 0,5 → 1 (sobe)
    expect(unidadesDeslocamentoPorViagem(12)).toBe(0);    // 24 /50 = 0,48 → 0 (desce)
    expect(unidadesDeslocamentoPorViagem(225)).toBe(9);   // 450 /50 = 9,0
    expect(unidadesDeslocamentoPorViagem(0)).toBe(0);
  });
});

describe("gerarProcedimentosTfd", () => {
  it("exemplo completo: 220 km, 3 com pernoite + 7 sem, COM acompanhante", () => {
    const linhas = gerarProcedimentosTfd({ distanciaKm: 220, qtdComPernoite: 3, qtdSemPernoite: 7, temAcompanhante: true });
    const m = mapa(linhas);
    // deslocamento/viagem = 9; total = 9 × (3+7) = 90
    expect(m[COD_TFD.DESLOC_PAC]).toBe(90);
    expect(m[COD_TFD.DESLOC_ACOMP]).toBe(90);
    expect(m[COD_TFD.ALIM_PERNOITE_PAC]).toBe(3);
    expect(m[COD_TFD.ALIM_SEM_PERNOITE_PAC]).toBe(7);
    expect(m[COD_TFD.ALIM_PERNOITE_ACOMP]).toBe(3);
    expect(m[COD_TFD.ALIM_SEM_PERNOITE_ACOMP]).toBe(7);
    expect(linhas).toHaveLength(6);
  });

  it("sem acompanhante: só as 3 linhas do paciente", () => {
    const linhas = gerarProcedimentosTfd({ distanciaKm: 200, qtdComPernoite: 2, qtdSemPernoite: 4, temAcompanhante: false });
    const m = mapa(linhas);
    expect(m[COD_TFD.DESLOC_PAC]).toBe(8 * 6); // 8/viagem × 6 viagens = 48
    expect(m[COD_TFD.ALIM_PERNOITE_PAC]).toBe(2);
    expect(m[COD_TFD.ALIM_SEM_PERNOITE_PAC]).toBe(4);
    expect(linhas.every((l) => l.para === "paciente")).toBe(true);
    expect(linhas).toHaveLength(3);
  });

  it("só viagens SEM pernoite → não gera a linha de pernoite (qtd 0 é omitida)", () => {
    const linhas = gerarProcedimentosTfd({ distanciaKm: 200, qtdComPernoite: 0, qtdSemPernoite: 5, temAcompanhante: true });
    const m = mapa(linhas);
    expect(m[COD_TFD.ALIM_SEM_PERNOITE_PAC]).toBe(5);
    expect(m[COD_TFD.ALIM_SEM_PERNOITE_ACOMP]).toBe(5);
    expect(m[COD_TFD.ALIM_PERNOITE_PAC]).toBeUndefined();
    expect(m[COD_TFD.ALIM_PERNOITE_ACOMP]).toBeUndefined();
    expect(m[COD_TFD.DESLOC_PAC]).toBe(8 * 5);
  });

  it("acompanhante recebe a MESMA quantidade de deslocamento do paciente", () => {
    const linhas = gerarProcedimentosTfd({ distanciaKm: 240, qtdComPernoite: 1, qtdSemPernoite: 1, temAcompanhante: true });
    const m = mapa(linhas);
    expect(m[COD_TFD.DESLOC_PAC]).toBe(m[COD_TFD.DESLOC_ACOMP]);
    expect(m[COD_TFD.DESLOC_PAC]).toBe(10 * 2); // 10/viagem × 2
  });

  it("as linhas de acompanhante vêm marcadas para='acompanhante'", () => {
    const linhas = gerarProcedimentosTfd({ distanciaKm: 200, qtdComPernoite: 1, qtdSemPernoite: 0, temAcompanhante: true });
    const acomp = linhas.filter((l) => l.para === "acompanhante").map((l) => l.codigo).sort();
    expect(acomp).toEqual([COD_TFD.ALIM_PERNOITE_ACOMP, COD_TFD.DESLOC_ACOMP].sort());
  });

  it("zero viagens → nenhuma linha", () => {
    expect(gerarProcedimentosTfd({ distanciaKm: 300, qtdComPernoite: 0, qtdSemPernoite: 0, temAcompanhante: true })).toEqual([]);
  });

  it("distância 0 → sem deslocamento, mas mantém a alimentação", () => {
    const linhas = gerarProcedimentosTfd({ distanciaKm: 0, qtdComPernoite: 2, qtdSemPernoite: 0, temAcompanhante: false });
    const m = mapa(linhas);
    expect(m[COD_TFD.DESLOC_PAC]).toBeUndefined();
    expect(m[COD_TFD.ALIM_PERNOITE_PAC]).toBe(2);
  });
});

describe("gerarProcedimentosTfdPorData", () => {
  it("agrupa por data; mesma data soma, datas diferentes viram grupos separados", () => {
    // 200 km → 8 unidades/viagem. Viagens: 01/06 (com), 01/06 (sem), 05/06 (com).
    const grupos = gerarProcedimentosTfdPorData(
      [{ data: "2026-06-01", pernoite: "com" }, { data: "2026-06-01", pernoite: "sem" }, { data: "2026-06-05", pernoite: "com" }],
      200, false,
    );
    expect(grupos.map((g) => g.data)).toEqual(["2026-06-01", "2026-06-05"]); // ordenadas
    const g1 = mapa(grupos[0].linhas); // 01/06: com=1, sem=1 → 2 viagens
    expect(g1[COD_TFD.DESLOC_PAC]).toBe(16); // 8 × 2
    expect(g1[COD_TFD.ALIM_PERNOITE_PAC]).toBe(1);
    expect(g1[COD_TFD.ALIM_SEM_PERNOITE_PAC]).toBe(1);
    const g2 = mapa(grupos[1].linhas); // 05/06: com=1
    expect(g2[COD_TFD.DESLOC_PAC]).toBe(8);
    expect(g2[COD_TFD.ALIM_PERNOITE_PAC]).toBe(1);
    expect(g2[COD_TFD.ALIM_SEM_PERNOITE_PAC]).toBeUndefined();
  });

  it("com acompanhante, cada grupo de data traz as linhas do acompanhante", () => {
    const grupos = gerarProcedimentosTfdPorData([{ data: "2026-06-01", pernoite: "com" }], 240, true);
    const m = mapa(grupos[0].linhas);
    expect(m[COD_TFD.DESLOC_ACOMP]).toBe(10); // 240 → 10/viagem × 1
    expect(m[COD_TFD.ALIM_PERNOITE_ACOMP]).toBe(1);
  });

  it("ignora viagens sem data e devolve [] quando não há nenhuma", () => {
    expect(gerarProcedimentosTfdPorData([{ data: "", pernoite: "com" }], 200, false)).toEqual([]);
    expect(gerarProcedimentosTfdPorData([], 200, false)).toEqual([]);
  });
});
