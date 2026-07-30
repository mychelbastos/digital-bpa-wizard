// GOLDEN de equivalência V3 ⇄ V4 (rede de segurança da refatoração do useBpaIEngine).
//
// Fotografa o `.MAR` (linhas 03) e o campo de controle gerados a partir da ficha de
// referência pelo motor ATUAL do V3. Depois de extrair o engine e de construir o V4, estes
// snapshots NÃO podem mudar: mesma ficha ⇒ mesmo dados.seqs ⇒ mesmo arquivo enviado ao SIA.
import { describe, it, expect } from "vitest";
import { FICHA_GOLDEN, linhasMarGolden } from "./equivalencia.fixture";
import { campoControle } from "@/lib/bpa-i-v2/bpa-magnetico";

describe("equivalência V3⇄V4 — golden do .MAR", () => {
  const linhas = linhasMarGolden();

  it("gera 2 linhas 03 (as 2 seqs preenchidas)", () => {
    expect(linhas).toHaveLength(2);
  });

  it("cada linha 03 tem 350 chars (competência 06/2026 < 07/2026)", () => {
    for (const l of linhas) expect(l).toHaveLength(350);
  });

  it("pacienteId nas seqs NÃO altera o .MAR (indistinguível de uma ficha V3)", () => {
    const semId = {
      ...FICHA_GOLDEN,
      seqs: FICHA_GOLDEN.seqs.map((s) => ({ ...s, pacienteId: undefined })),
    };
    expect(linhasMarGolden(semId)).toEqual(linhas);
  });

  it("linhas 03 (golden fixo)", () => {
    expect(linhas).toMatchInlineSnapshot(`
      [
        "03251033220260612345678901000022512520260610001010301010013700000000000005F292720A09003600000201             BPAMARIA DAS DORES INDIGENA      19900315050001010135003                          46800000081RUA DIREITA                             100  CENTRO                                                                                                 ",
        "03251033220260612345678901000022512520260611001020301010021700000000000013M292720    04000000102             BPAJOAO DE SOUSA                 1985120203    010                                46800000081AV BRASIL                               SN   SAO JOSE                                                                                               ",
      ]
    `);
  });

  it("campo de controle (golden fixo)", () => {
    expect(campoControle(FICHA_GOLDEN.seqs)).toMatchInlineSnapshot(`1356`);
  });
});
