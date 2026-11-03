import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gerarAas, controle4, folhaEntraNoArquivo, problemaOrigemRaas, type GerarAasCfg } from "./gerar-aas";
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
    // campos que estavam deslocados/trocados antes da correção de nov/2026
    expect(f.origemPaciente).toBe("01");
    expect(f.destinoPaciente).toBe("02");
    expect(f.carater).toBe("01");
  });

  // Posições do registro 15 travadas contra o layout oficial (Layout_Exportacao_RAAS.pdf) e o
  // .AGO gerado pelo RAAS-PAD — o bug real: origem saía "00" na posição errada e o SIA recusava
  // TODAS as folhas com "ORIGEM DO USUARIO INVALIDO".
  it("registro 15 segue as posições do layout oficial", () => {
    const f = {
      ...fichaExemplo(),
      origemPaciente: "02", destinoPaciente: "", carater: "",
      nacionalidade: "", cpfPaciente: "12345678901", nomeResponsavel: "",
      logradouro: "RUA A", bairro: "CENTRO", telefone: "", celular: "75999990000",
    };
    const [a] = gerarAas([f], "202603", cfg, "20260410");
    const r = a.conteudo.split("\r\n").find((l) => l.startsWith("15"))!;
    expect(r.slice(278, 280)).toBe("01"); // caráter (RAAS-PAD grava 01)
    expect(r.slice(280, 282)).toBe("02"); // origem do paciente
    expect(r.slice(290, 295)).toBe("00002"); // total de ações = 2 registros 16
    expect(r.slice(295, 297)).toBe("00"); // destino vazio = 00 Permanência
    expect(r.slice(118, 148).trim()).toBe("RUA A"); // logradouro
    expect(r.slice(318, 348).trim()).toBe("CENTRO"); // bairro
    expect(r.slice(219, 222)).toBe("010"); // nacionalidade vazia → Brasil
    expect(r.slice(391, 402)).toBe("00000000000"); // tem CNS → CPF zerado
    expect(r.slice(189, 219).trim()).toBe("FULANO DE TAL"); // adulto sem responsável → o próprio
    // telefone/celular como digitados; sem fixo o telefone fica EM BRANCO (igual ao RAAS-PAD)
    expect(r.slice(226, 237)).toBe(" ".repeat(11));
    expect(r.slice(237, 248)).toBe("75999990000");
    const r16 = a.conteudo.split("\r\n").find((l) => l.startsWith("16"))!;
    expect(r16.slice(95, 106)).toBe("00000000000");
  });

  it("telefone digitado com espaço sai como digitado (ex.: '75 32521778')", () => {
    const f = { ...fichaExemplo(), telefone: "75 32521778", celular: "75999990000" };
    const [a] = gerarAas([f], "202603", cfg, "20260410");
    const r = a.conteudo.split("\r\n").find((l) => l.startsWith("15"))!;
    expect(r.slice(226, 248)).toBe("75 3252177875999990000");
    expect(parseAas(a.conteudo).fichas[0].telefone).toBe("75 32521778");
  });

  it("menor de idade sem responsável → nome da mãe; sem CNS → CPF vai no arquivo", () => {
    const f = {
      ...fichaExemplo(),
      dataNascimento: "2015-01-01", nomeMae: "MARIA DE TAL", nomeResponsavel: "",
      cnsPaciente: "", cpfPaciente: "12345678901",
    };
    const [a] = gerarAas([f], "202603", cfg, "20260410");
    const r = a.conteudo.split("\r\n").find((l) => l.startsWith("15"))!;
    expect(r.slice(189, 219).trim()).toBe("MARIA DE TAL");
    expect(r.slice(17, 32)).toBe("0".repeat(15));
    expect(r.slice(391, 402)).toBe("12345678901");
  });

  it("origem obrigatória (01–06) e só folhas com ação válida entram no arquivo", () => {
    expect(problemaOrigemRaas("02")).toBeNull();
    expect(problemaOrigemRaas("")).toMatch(/não preenchida/);
    expect(problemaOrigemRaas("00")).toMatch(/inválida/);
    expect(problemaOrigemRaas("07")).toMatch(/inválida/);
    expect(folhaEntraNoArquivo(fichaExemplo())).toBe(true);
    expect(folhaEntraNoArquivo({ ...fichaExemplo(), acoes: [{ ...emptyAcao(), procedimento: "", quantidade: "" }] })).toBe(false);
  });

  it("ignora ações sem procedimento ou quantidade zero", () => {
    const ficha = fichaExemplo();
    ficha.acoes.push({ ...emptyAcao(), procedimento: "", quantidade: "" });
    ficha.acoes.push({ ...emptyAcao(), procedimento: "0301080300", quantidade: "000000" });
    const [a] = gerarAas([ficha], "202603", cfg, "20260410");
    expect(a.acoes).toBe(2);
  });
});

// ESTRUTURA GRAVADA (nov/2026): fixture = 19 folhas / 50 ações REAIS do AA292720.AGO gerado pelo
// RAAS-PAD (importado limpo no SIA), com todo dado pessoal trocado por fictício mantendo posição e
// formato, e dígito de controle recalculado (anonimizador: scratchpad anon_aas.py). Cobre origem
// 01/02/04, telefone com espaço/em branco, ESF S/N, droga S com tipos, local C/T, 1–5 ações.
// Importar + gerar tem de reproduzir CADA registro 15/16 byte a byte. Se este teste quebrar, o
// .AAS deixou de sair igual ao programa oficial — não "ajuste o esperado" sem conferir no SIA.
describe("estrutura do .AAS = RAAS-PAD (golden byte a byte)", () => {
  const FIXTURE = fileURLToPath(new URL("../__fixtures__/aas-raaspad-anon.txt", import.meta.url));

  it("importar + gerar reproduz todos os registros 15/16 do arquivo oficial", () => {
    const txt = readFileSync(FIXTURE, "latin1");
    const orig = txt.split("\r\n").filter(Boolean);
    const h = orig[0];
    const imp = parseAas(txt);
    expect(imp.avisos).toEqual([]);
    const [g] = gerarAas(
      imp.fichas,
      imp.competencia,
      { sigla: h.slice(53, 59).trim(), cnpj: h.slice(59, 73), gestorNome: h.slice(73, 113).trim(), destinoTipo: h[113] === "E" ? "E" : "M" },
      h.slice(114, 122),
    );
    const ger = g.conteudo.split("\r\n").filter(Boolean);
    expect(ger.length).toBe(orig.length);
    for (let i = 1; i < orig.length; i++) expect(ger[i], `linha ${i + 1}`).toBe(orig[i]);
    // Cabeçalho idêntico, exceto [13,23) — nº de remessa interno do SIA (não deriva do conteúdo).
    expect(ger[0].slice(0, 13) + ger[0].slice(23)).toBe(h.slice(0, 13) + h.slice(23));
  });
});
