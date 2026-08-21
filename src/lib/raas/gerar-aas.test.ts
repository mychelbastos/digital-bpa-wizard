import { describe, it, expect } from "vitest";
import { gerarAas, controle4, type GerarAasCfg } from "./gerar-aas";
import { parseAas } from "./raas-aas";
import { emptyRaasState, emptyAcao } from "./raas-layout";

// Golden do dígito de controle: corpo REAL de um registro 16 (AA292720.MAR) e seu controle
// real (bytes altos). Prova o algoritmo em CI sem depender do arquivo. Ver memória
// `aas-controle-e-geracao`.
const R16_BODY =
  "1629202603584752470060991534746320260317030108020822350570340719387730020260317115002000001   C00000000000";
const R16_CTRL = "\xaa\xa7\xb6\xb3";

const cfg: GerarAasCfg = {
  sigla: "FMSRB",
  cnpj: "10896489000185",
  gestorNome: "SECRETARIA MUNICIPAL SAUDE DE RUY BARBOSA",
  destinoTipo: "M",
};

function fichaExemplo() {
  return {
    ...emptyRaasState(),
    cnes: "5847524",
    estabelecimentoNome: "CAPS RUY BARBOSA",
    coduf: "29",
    competencia: "202603",
    validadeInicio: "2026-03-17",
    cnsPaciente: "700500144832151",
    nomePaciente: "FULANO DE TAL",
    dataNascimento: "1990-05-10",
    sexo: "M",
    municipioIbge: "2927200",
    cidPrincipal: "F200",
    origemPaciente: "01",
    destinoPaciente: "02",
    acoes: [
      { ...emptyAcao(), procedimento: "0301080208", cbo: "223405", cnsExecutante: "700709996562571", dataExec: "2026-03-17", servico: "115", classificacao: "002", quantidade: "000001", localRealizacao: "C" },
      { ...emptyAcao(), procedimento: "0301080100", cbo: "223405", cnsExecutante: "700709996562571", dataExec: "2026-03-18", servico: "", classificacao: "", quantidade: "000002", localRealizacao: "C" },
    ],
  };
}

describe("controle4 (dígito de controle .AAS)", () => {
  it("reproduz o controle real de um registro 16", () => {
    expect(controle4(R16_BODY)).toBe(R16_CTRL);
  });
});

describe("gerarAas", () => {
  it("gera um arquivo por CNES com cabeçalho + 15 + 16", () => {
    const arqs = gerarAas([fichaExemplo()], "202603", cfg, "20260410");
    expect(arqs).toHaveLength(1);
    const a = arqs[0];
    expect(a.cnes).toBe("5847524");
    expect(a.nome).toBe("AA292720.MAR");
    expect(a.fichas).toBe(1);
    expect(a.acoes).toBe(2);
    const linhas = a.conteudo.split("\r\n").filter(Boolean);
    expect(linhas[0].startsWith("01#RAS#202603")).toBe(true);
    expect(linhas[0]).toHaveLength(144);
    expect(linhas.filter((l) => l.startsWith("15"))).toHaveLength(1);
    expect(linhas.filter((l) => l.startsWith("16"))).toHaveLength(2);
  });

  it("todo registro 15/16 tem dígito de controle válido (auto-consistente)", () => {
    const [a] = gerarAas([fichaExemplo()], "202603", cfg, "20260410");
    for (const l of a.conteudo.split("\r\n").filter(Boolean)) {
      if (l.startsWith("15")) expect(controle4(l.slice(0, 402))).toBe(l.slice(402, 406));
      if (l.startsWith("16")) expect(controle4(l.slice(0, 106))).toBe(l.slice(106, 110));
    }
  });

  it("round-trip: parseAas relê os dados gerados", () => {
    const [a] = gerarAas([fichaExemplo()], "202603", cfg, "20260410");
    const parsed = parseAas(a.conteudo);
    expect(parsed.competencia).toBe("202603");
    expect(parsed.fichas).toHaveLength(1);
    const f = parsed.fichas[0];
    expect(f.cnes).toBe("5847524");
    expect(f.cnsPaciente).toBe("700500144832151");
    expect(f.nomePaciente).toBe("FULANO DE TAL");
    expect(f.competencia).toBe("202603");
    expect(f.acoes).toHaveLength(2);
    expect(f.acoes[0].procedimento).toBe("0301080208");
    expect(f.acoes[0].quantidade).toBe("000001");
    expect(f.acoes[1].procedimento).toBe("0301080100");
  });

  it("ignora ações sem procedimento ou quantidade zero", () => {
    const ficha = fichaExemplo();
    ficha.acoes.push({ ...emptyAcao(), procedimento: "", quantidade: "" });
    ficha.acoes.push({ ...emptyAcao(), procedimento: "0301080300", quantidade: "000000" });
    const [a] = gerarAas([ficha], "202603", cfg, "20260410");
    expect(a.acoes).toBe(2);
  });
});
