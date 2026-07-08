import { describe, it, expect } from "vitest";
import { validarCns, cnsInvalido, dataValida, dataFuturaOuInvalida, atendimentoAntigo, atendimentoForaDaCompetencia, idadeEmMeses } from "./validacao";

describe("validarCns", () => {
  it("aceita CNS provisório válido (início 7)", () => {
    expect(validarCns("700000000000005")).toBe(true);
  });
  it("aceita CNS definitivo válido (início 1 e 2)", () => {
    expect(validarCns("123456789010000")).toBe(true);
    expect(validarCns("200000000000003")).toBe(true);
  });
  it("rejeita comprimento errado", () => {
    expect(validarCns("1234567890")).toBe(false);
    expect(validarCns("1234567890100000")).toBe(false);
  });
  it("rejeita dígito adulterado", () => {
    expect(validarCns("700000000000006")).toBe(false);
    expect(validarCns("123456789010001")).toBe(false);
  });
  it("rejeita início inválido (0,3,4,5,6)", () => {
    expect(validarCns("000000000000000")).toBe(false);
    expect(validarCns("300000000000000")).toBe(false);
  });
  it("cnsInvalido só acende quando completo (15) e inválido", () => {
    expect(cnsInvalido("70000000000000")).toBe(false); // incompleto
    expect(cnsInvalido("700000000000006")).toBe(true); // completo e inválido
    expect(cnsInvalido("700000000000005")).toBe(false); // válido
  });
});

const digs = (s: string) => s.split("");

describe("dataValida", () => {
  it("aceita datas de calendário reais", () => {
    expect(dataValida(digs("29022020"))).toBe(true); // bissexto
    expect(dataValida(digs("15031990"))).toBe(true);
  });
  it("rejeita datas impossíveis", () => {
    expect(dataValida(digs("31022020"))).toBe(false); // 31/fev
    expect(dataValida(digs("00012020"))).toBe(false); // dia 0
    expect(dataValida(digs("15132020"))).toBe(false); // mês 13
    expect(dataValida(digs("29022021"))).toBe(false); // não-bissexto
  });
  it("rejeita incompleto", () => {
    expect(dataValida(digs("1503"))).toBe(false);
  });
});

describe("dataFuturaOuInvalida", () => {
  it("não acende para incompleto", () => {
    expect(dataFuturaOuInvalida(digs("1503"))).toBe(false);
  });
  it("acende para inválida de calendário", () => {
    expect(dataFuturaOuInvalida(digs("31022020"))).toBe(true);
  });
  it("acende para data no futuro", () => {
    expect(dataFuturaOuInvalida(digs("01012099"))).toBe(true);
  });
  it("não acende para data passada válida", () => {
    expect(dataFuturaOuInvalida(digs("15031990"))).toBe(false);
  });
});

describe("atendimentoAntigo", () => {
  const diasAtras = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return digs(`${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`);
  };
  it("não acende para incompleto", () => {
    expect(atendimentoAntigo(digs("1503"))).toBe(false);
  });
  it("não acende dentro de 120 dias", () => {
    expect(atendimentoAntigo(diasAtras(119))).toBe(false);
    expect(atendimentoAntigo(diasAtras(120))).toBe(false);
  });
  it("acende acima de 120 dias", () => {
    expect(atendimentoAntigo(diasAtras(121))).toBe(true);
  });
  it("não acende para data futura ou inválida (já tem alerta próprio)", () => {
    expect(atendimentoAntigo(digs("01012099"))).toBe(false);
    expect(atendimentoAntigo(digs("31022020"))).toBe(false);
  });
});

describe("atendimentoForaDaCompetencia", () => {
  // Usa uma data passada (não-futura) recente p/ não colidir com dataFuturaOuInvalida.
  const passada = () => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const aaaa = String(d.getFullYear());
    return { data: digs(`${dd}${mm}${aaaa}`), mes: digs(mm), ano: digs(aaaa) };
  };
  it("não acende quando a data cai no mês/ano da competência", () => {
    const p = passada();
    expect(atendimentoForaDaCompetencia(p.data, p.mes, p.ano)).toBe(false);
  });
  it("acende quando o mês difere da competência", () => {
    const p = passada();
    const outroMes = p.mes.join("") === "12" ? "11" : String(Number(p.mes.join("")) + 1).padStart(2, "0");
    expect(atendimentoForaDaCompetencia(p.data, digs(outroMes), p.ano)).toBe(true);
  });
  it("acende quando o ano difere da competência", () => {
    const p = passada();
    const outroAno = String(Number(p.ano.join("")) - 1);
    expect(atendimentoForaDaCompetencia(p.data, p.mes, digs(outroAno))).toBe(true);
  });
  it("não acende com competência incompleta (evita falso alarme enquanto digita)", () => {
    const p = passada();
    expect(atendimentoForaDaCompetencia(p.data, digs("0"), p.ano)).toBe(false);
    expect(atendimentoForaDaCompetencia(p.data, p.mes, digs("202"))).toBe(false);
  });
  it("não acende com data incompleta, inválida ou futura", () => {
    const p = passada();
    expect(atendimentoForaDaCompetencia(digs("1507"), p.mes, p.ano)).toBe(false);
    expect(atendimentoForaDaCompetencia(digs("31022020"), digs("02"), digs("2020"))).toBe(false);
    expect(atendimentoForaDaCompetencia(digs("01012099"), digs("01"), digs("2099"))).toBe(false);
  });
});

describe("idadeEmMeses", () => {
  it("calcula meses completos entre nascimento e atendimento", () => {
    expect(idadeEmMeses(digs("15031990"), digs("15032020"))).toBe(360); // 30 anos exatos
    expect(idadeEmMeses(digs("15031990"), digs("14032020"))).toBe(359); // 1 dia antes de completar
    expect(idadeEmMeses(digs("01012020"), digs("01022020"))).toBe(1);
  });
  it("null se alguma data é inválida ou incompleta", () => {
    expect(idadeEmMeses(digs("1503"), digs("15032020"))).toBe(null);
    expect(idadeEmMeses(digs("31022020"), digs("15032020"))).toBe(null);
  });
  it("null se atendimento é antes do nascimento", () => {
    expect(idadeEmMeses(digs("15032020"), digs("15031990"))).toBe(null);
  });
});
