import { describe, it, expect } from "vitest";
import { emptySeq } from "@/lib/bpai-v2-layout";
import { motivosObrigatoriosSeq, motivosCabecalho, identificacaoIncompleta, parcialIncompleto } from "./obrigatorios";

const semExig = { exigeServico: null, exigeCid: null } as const;

// Sequência completa e válida (CPF válido de 11 díg. + demais obrigatórios preenchidos).
function seqCompleta() {
  const s = emptySeq();
  s.cnsPac = ["1", "1", "1", "4", "4", "4", "7", "7", "7", "3", "5", "", "", "", ""];
  s.nomePac = "FULANO DE TAL";
  s.sexo = "M";
  s.dataNasc = "01011990".split("");
  s.racaCor = "01";
  s.codLog = "081".split("");
  s.endereco = "RUA DAS FLORES";
  s.numero = "100".split("").concat([""]);
  s.bairro = "CENTRO";
  s.dataAtend = "01072026".split("");
  s.qtde = "001".split("");
  s.carater = "01".split("");
  return s;
}

describe("motivosObrigatoriosSeq", () => {
  it("sequência completa não gera nenhum motivo", () => {
    expect(motivosObrigatoriosSeq(seqCompleta(), semExig)).toEqual([]);
  });

  it("sequência vazia cobra os campos obrigatórios (CEP/IBGE/Nacionalidade já vêm com padrão)", () => {
    const m = motivosObrigatoriosSeq(emptySeq(), semExig);
    expect(m).toContain("Identificação do paciente (CPF ou CNS) é obrigatória.");
    expect(m).toContain("Nome do paciente é obrigatório.");
    expect(m).toContain("Sexo é obrigatório.");
    expect(m).toContain("Data de nascimento é obrigatória.");
    expect(m).toContain("Raça/Cor é obrigatória.");
    expect(m).toContain("Endereço é obrigatório.");
    expect(m).toContain("Bairro é obrigatório.");
    expect(m).toContain("Data do atendimento é obrigatória.");
    expect(m).toContain("Quantidade é obrigatória.");
    // Opcionais NÃO devem ser cobrados:
    expect(m.join("|")).not.toMatch(/Complemento|Telefone|DDD|E-mail|CNPJ|Autoriza/i);
  });

  it("identificação incompleta (faltam caracteres) é cobrada", () => {
    const s = seqCompleta();
    s.cnsPac = ["1", "2", "3", "4", "5", "", "", "", "", "", "", "", "", "", ""]; // 5 díg.
    const m = motivosObrigatoriosSeq(s, semExig);
    expect(m).toContain("Identificação do paciente incompleta — CPF tem 11 e CNS tem 15 dígitos.");
  });

  it("data de nascimento incompleta é cobrada", () => {
    const s = seqCompleta();
    s.dataNasc = "0101".split("").concat(["", "", "", ""]); // 4 díg.
    expect(motivosObrigatoriosSeq(s, semExig)).toContain("Data de nascimento incompleta (faltam dígitos).");
  });

  it("Serviço/Classe e CID são cobrados só quando o SIGTAP exige", () => {
    const s = seqCompleta(); // sem serviço/classe/cid
    expect(motivosObrigatoriosSeq(s, { exigeServico: true, exigeCid: true })).toEqual([
      "Serviço e Classificação são obrigatórios para este procedimento (SIGTAP).",
      "CID é obrigatório para este procedimento (SIGTAP).",
    ]);
    // exig desconhecido (null) não bloqueia:
    expect(motivosObrigatoriosSeq(s, semExig)).toEqual([]);
  });
});

describe("parcialIncompleto", () => {
  it("vazio não é parcial (é 'obrigatório', não 'incompleto')", () => {
    expect(parcialIncompleto(Array(8).fill(""), 8)).toBe(false);
  });
  it("data 20/03/202 (7 de 8 díg.) é parcial/incompleta", () => {
    expect(parcialIncompleto("20032025".slice(0, 7).split("").concat([""]), 8)).toBe(true);
  });
  it("completo (8 díg.) não é parcial", () => {
    expect(parcialIncompleto("20032025".split(""), 8)).toBe(false);
  });
});

describe("identificacaoIncompleta", () => {
  it("vazia = incompleta", () => {
    expect(identificacaoIncompleta(Array(15).fill(""))).toBe(true);
  });
  it("CPF de 11 díg. = completa", () => {
    expect(identificacaoIncompleta(["1", "1", "1", "4", "4", "4", "7", "7", "7", "3", "5", "", "", "", ""])).toBe(false);
  });
  it("parcial (12 díg.) = incompleta", () => {
    expect(identificacaoIncompleta("123456789012".split("").concat(["", "", ""]))).toBe(true);
  });
});

describe("motivosCabecalho", () => {
  const cabCompleto = () => ({
    nomeEstab: "UBS CENTRO",
    cnes: "1234567".split(""),
    profCns: "700000000000000".split(""),
    profNome: "DR FULANO",
    profCbo: "225125".split(""),
    profMes: "07".split(""),
    profAno: "2026".split(""),
    profFolha: "001".split(""),
  });

  it("cabeçalho completo não gera motivo", () => {
    expect(motivosCabecalho(cabCompleto())).toEqual([]);
  });

  it("cabeçalho vazio cobra os campos", () => {
    const m = motivosCabecalho({
      nomeEstab: "", cnes: [], profCns: [], profNome: "", profCbo: [], profMes: [], profAno: [], profFolha: [],
    });
    expect(m).toContain("Nome do estabelecimento é obrigatório.");
    expect(m).toContain("CNES é obrigatório.");
    expect(m).toContain("CNS do profissional é obrigatório.");
    expect(m).toContain("CBO é obrigatório.");
    expect(m).toContain("Folha é obrigatória.");
  });

  it("CNES incompleto (menos de 7 díg.) é cobrado", () => {
    const c = cabCompleto();
    c.cnes = "123".split("");
    expect(motivosCabecalho(c)).toContain("CNES incompleto (7 dígitos).");
  });
});
