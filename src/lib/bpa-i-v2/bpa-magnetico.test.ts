import { describe, it, expect } from "vitest";
import { gerarArquivoBpa, linhaBpaI, header, campoControle, idadeAnos, type DadosBpa } from "./bpa-magnetico";
import { configVazia } from "./config";
import { emptySeq, type SeqData } from "@/lib/bpai-v2-layout";

const cells = (s: string, n: number) => Array.from({ length: n }, (_, i) => s[i] ?? "");

function seqExemplo(): SeqData {
  return {
    ...emptySeq(),
    cnsPac: cells("700000000000005", 15),
    nomePac: "José da Silva Ção",
    sexo: "M",
    dataNasc: cells("15031990", 8),
    racaCor: "03",
    cep: cells("40010000", 8),
    ibge: cells("292740", 6),
    dataAtend: cells("10062026", 8),
    codProc: cells("0301010013", 10),
    qtde: cells("002", 3),
    cid: cells("A090", 4),
  };
}

const dados = (): DadosBpa => ({
  cnes: cells("2510332", 7),
  profCns: cells("123456789010000", 15),
  profCbo: cells("225125", 6),
  profMes: cells("06", 2),
  profAno: cells("2026", 4),
  profFolha: cells("001", 3),
  seqs: [seqExemplo(), emptySeq(), emptySeq()],
});

const cfg = () => ({ ...configVazia(), orgaoOrigemNome: "PREF MUN EXEMPLO", sigla: "PMEX", cgcCpf: "12345678000199", orgaoDestinoNome: "SES BAHIA", destinoTipo: "E" as const });

describe("linhaBpaI", () => {
  const l = linhaBpaI(dados(), seqExemplo(), 1, 1);
  it("tem 350 caracteres (v04.11)", () => expect(l.length).toBe(350));
  it("começa com 03 + CNES + competência", () => {
    expect(l.slice(0, 2)).toBe("03");
    expect(l.slice(2, 9)).toBe("2510332"); // CNES pos 3-9
    expect(l.slice(9, 15)).toBe("202606"); // competência pos 10-15 (aaaamm)
  });
  it("CNS profissional, CBO, data atend (aaaammdd)", () => {
    expect(l.slice(15, 30)).toBe("123456789010000");
    expect(l.slice(30, 36)).toBe("225125");
    expect(l.slice(36, 44)).toBe("20260610"); // 10/06/2026 -> 20260610
  });
  it("folha, seq, procedimento", () => {
    expect(l.slice(44, 47)).toBe("001");
    expect(l.slice(47, 49)).toBe("01");
    expect(l.slice(49, 59)).toBe("0301010013");
  });
  it("CNS paciente, sexo, quantidade (zeros à esq)", () => {
    expect(l.slice(59, 74)).toBe("700000000000005");
    expect(l.slice(74, 75)).toBe("M");
    expect(l.slice(88, 94)).toBe("000002"); // qt pos 89-94
  });
  it("origem BPA e nome do paciente sem acento, à esquerda", () => {
    expect(l.slice(109, 112)).toBe("BPA");
    expect(l.slice(112, 142)).toBe("JOSE DA SILVA CAO".padEnd(30, " "));
  });
  it("idade calculada (36 anos em 2026 p/ nasc 1990)", () => {
    expect(l.slice(85, 88)).toBe("036"); // idade pos 86-88
  });
  it("município: IBGE de 6 díg. sai inalterado", () => {
    expect(l.slice(75, 81)).toBe("292740"); // seqExemplo usa 292740
  });
  it("município: IBGE completo (7 díg.) vira os 6 PRIMEIROS, sem o dígito verificador", () => {
    // 3550308 (São Paulo/SP) -> 355030, nunca 550308.
    const seq7 = { ...seqExemplo(), ibge: cells("3550308", 7) };
    const l7 = linhaBpaI(dados(), seq7, 1, 1);
    expect(l7.slice(75, 81)).toBe("355030");
  });
});

describe("header e arquivo", () => {
  it("header tem 126 chars e começa com 01#BPA#", () => {
    const h = header(cfg(), "202606", 1, 1, 1234);
    expect(h.length).toBe(126);
    expect(h.slice(0, 7)).toBe("01#BPA#");
    expect(h.slice(7, 13)).toBe("202606");
    expect(h.slice(13, 19)).toBe("000002"); // nº linhas = dados(1) + header(1)
    expect(h.slice(119, 120)).toBe("E"); // destino M/E
    expect(h.slice(120, 126)).toBe("D04.14"); // versão default atual (muda ~mês a mês)
  });
  it("campo de controle no intervalo [1111..2221]", () => {
    const c = campoControle(dados().seqs);
    expect(c).toBeGreaterThanOrEqual(1111);
    expect(c).toBeLessThanOrEqual(2221);
  });
  it("gera arquivo: 1 header (126) + 1 linha (350), termina com CRLF", () => {
    const arq = gerarArquivoBpa(dados(), cfg());
    expect(arq.nome).toBe("PA202606.txt");
    expect(arq.linhas).toBe(1);
    const linhas = arq.conteudo.split("\r\n").filter(Boolean);
    expect(linhas.length).toBe(2); // header + 1 BPA-I
    expect(linhas[0].length).toBe(126);
    expect(linhas[1].length).toBe(350);
    expect(arq.conteudo.endsWith("\r\n")).toBe(true);
  });
});

describe("capturar, não derivar (regra do layout real)", () => {
  it("competência da linha vem da FICHA (profAno/profMes), não da data de atendimento", () => {
    // Atendimento em 202511, mas a folha é competência 202601 (faturamento retroativo).
    const d = { ...dados(), profMes: cells("01", 2), profAno: cells("2026", 4) };
    const seq = { ...seqExemplo(), dataAtend: cells("07112025", 8) }; // 07/11/2025
    const l = linhaBpaI(d, seq, 1, 1);
    expect(l.slice(9, 15)).toBe("202601"); // da ficha, NÃO 202511 do atendimento
  });
  it("idade CAPTURADA sobrepõe o cálculo; vazia cai no cálculo", () => {
    const capt = linhaBpaI(dados(), { ...seqExemplo(), idade: cells("070", 3) }, 1, 1);
    expect(capt.slice(85, 88)).toBe("070"); // fiel ao papel (mesmo divergindo do cálculo=36)
    const calc = linhaBpaI(dados(), { ...seqExemplo(), idade: [] }, 1, 1);
    expect(calc.slice(85, 88)).toBe("036"); // sem captura, calcula
  });
  it("situação de rua (cauda v04.11) passa fiel; default em branco", () => {
    const comN = linhaBpaI(dados(), { ...seqExemplo(), situacaoRua: "N" }, 1, 1);
    expect(comN.slice(349, 350)).toBe("N");
    expect(linhaBpaI(dados(), seqExemplo(), 1, 1).slice(349, 350)).toBe(" ");
  });
});

describe("idadeAnos", () => {
  it("calcula idade e retorna 0 quando falta dado", () => {
    expect(idadeAnos(cells("15031990", 8), cells("10062026", 8))).toBe(36);
    expect(idadeAnos(cells("15122000", 8), cells("10062026", 8))).toBe(25); // aniversário não feito
    expect(idadeAnos(cells("1503", 4), cells("10062026", 8))).toBe(0);
  });
});
