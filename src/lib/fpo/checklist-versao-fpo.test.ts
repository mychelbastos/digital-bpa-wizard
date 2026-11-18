import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FPO_MAG_VERSAO } from "./gerar-fpo-magnetico";

// O checklist mensal (edge function) mostra "nosso: NN.NN" do FPO Magnético. Tem que ser a
// mesma versão que o gerador grava no cabeçalho do .IMP — senão o checklist mente.
describe("checklist mensal × gerador do .IMP", () => {
  it("versão do FPO no checklist = FPO_MAG_VERSAO", () => {
    const src = readFileSync(resolve(__dirname, "../../../supabase/functions/checklist-mensal/index.ts"), "utf8");
    const m = /item: "FPO Magnético", nosso: "(\d{2}\.\d{2})"/.exec(src);
    expect(m?.[1]).toBe(FPO_MAG_VERSAO);
  });
});
