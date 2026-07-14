import { describe, it, expect } from "vitest";
import { linhaBpaC, gerarArquivoBpaC, rowPreenchida, type DadosBpaC } from "./bpa-magnetico";
import { configVazia } from "@/lib/bpa-i-v2/config";
import { emptyRow, type RowData } from "@/lib/bpac-layout";

const cells = (s: string, n: number) => Array.from({ length: n }, (_, i) => s[i] ?? "");

function rowEx(): RowData {
  return {
    ...emptyRow(),
    procedimento: cells("0301010013", 10),
    cbo: cells("225125", 6),
    idade: cells("036", 3),
    quantidade: cells("00002", 5),
  };
}

const dados = (): DadosBpaC => ({
  cnes: cells("2510332", 7),
  ano: cells("2026", 4),
  mes: cells("06", 2),
  folhaBase: cells("001", 3),
  rows: [rowEx(), emptyRow()],
});

const cfg = () => ({ ...configVazia(), orgaoOrigemNome: "PREF EXEMPLO", sigla: "PMEX", cgcCpf: "12345678000199", orgaoDestinoNome: "SES", destinoTipo: "E" as const });

describe("linhaBpaC (registro 02)", () => {
  const l = linhaBpaC(dados(), rowEx(), 1, 1);
  it("tem 48 caracteres", () => expect(l.length).toBe(48));
  it("02 + CNES + competência + CBO", () => {
    expect(l.slice(0, 2)).toBe("02");
    expect(l.slice(2, 9)).toBe("2510332");
    expect(l.slice(9, 15)).toBe("202606");
    expect(l.slice(15, 21)).toBe("225125");
  });
  it("folha, seq, procedimento, idade, quantidade, BPA", () => {
    expect(l.slice(21, 24)).toBe("001");
    expect(l.slice(24, 26)).toBe("01");
    expect(l.slice(26, 36)).toBe("0301010013");
    expect(l.slice(36, 39)).toBe("036");
    expect(l.slice(39, 45)).toBe("000002");
    expect(l.slice(45, 48)).toBe("BPA");
  });
});

describe("gerarArquivoBpaC", () => {
  it("header 126 (v04.11) + 1 linha 48, nome PAC<comp>.txt, termina com CRLF", () => {
    const arq = gerarArquivoBpaC(dados(), cfg());
    expect(arq.nome).toBe("PAC202606.txt");
    expect(arq.linhas).toBe(1);
    const linhas = arq.conteudo.split("\r\n").filter(Boolean);
    expect(linhas.length).toBe(2);
    expect(linhas[0].length).toBe(126);
    expect(linhas[1].length).toBe(48);
    expect(arq.conteudo.endsWith("\r\n")).toBe(true);
  });
  it("rowPreenchida exige procedimento E quantidade > 0", () => {
    expect(rowPreenchida(rowEx())).toBe(true);
    expect(rowPreenchida(emptyRow())).toBe(false);
    expect(rowPreenchida({ ...emptyRow(), procedimento: cells("0301010013", 10) })).toBe(false); // sem qtde
  });
});
