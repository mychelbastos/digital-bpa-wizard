import { describe, it, expect } from "vitest";
import { emptyAcao, errosAcoesRaas } from "./raas-layout";

const acao = (p: Partial<ReturnType<typeof emptyAcao>>) => ({ ...emptyAcao(), ...p });

describe("errosAcoesRaas", () => {
  it("bloqueia ficha sem nenhuma ação preenchida", () => {
    expect(errosAcoesRaas([emptyAcao()])).toEqual(["Preencha ao menos uma ação com procedimento e quantidade"]);
  });
  it("bloqueia ação sem quantidade", () => {
    expect(errosAcoesRaas([acao({ procedimento: "0101050208", cbo: "322205" })])).toEqual(["Ação 1: falta quantidade"]);
  });
  it("bloqueia ação sem procedimento e quantidade zero", () => {
    expect(errosAcoesRaas([acao({ cbo: "322205", quantidade: "0" })])).toEqual(["Ação 1: falta procedimento e quantidade"]);
  });
  it("aceita ação completa e ignora ação em branco", () => {
    expect(errosAcoesRaas([acao({ procedimento: "0101050208", quantidade: "1" }), emptyAcao()])).toEqual([]);
  });
});
