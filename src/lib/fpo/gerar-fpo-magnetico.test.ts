import { describe, it, expect } from "vitest";
import { gerarFpoMagnetico, type FpoMagItem } from "./gerar-fpo-magnetico";

const DECIFRA: Record<string, string> = {
  "*": "0", ".": "1", ";": "2", "/": "3", "?": "4", ":": "5", ">": "6", ",": "7", "(": "8", ")": "9",
};
const dec = (s: string) => [...s].map((c) => DECIFRA[c] ?? "·").join("");

// Item real da 1ª linha do MACIO07.IMP de Ruy Barbosa (controle conhecido = 1181).
const item: FpoMagItem = {
  cnes: "2510332", codigoFpo: "020501001", codApuracao: "21", qtdOrcada: 100, valorUnitario: 165.0,
};

describe("gerarFpoMagnetico", () => {
  it("gera cabeçalho e linha com 142 chars e CRLF final", () => {
    const { conteudo, nome, linhas } = gerarFpoMagnetico("202607", [item]);
    const partes = conteudo.split("\r\n");
    expect(conteudo.endsWith("\r\n")).toBe(true);
    expect(partes[0]).toHaveLength(142);
    expect(partes[0].startsWith("ÃÇF")).toBe(true);
    expect(partes[1]).toHaveLength(142);
    expect(nome).toBe("MACIO07.IMP");
    expect(linhas).toBe(1);
  });

  it("decifra de volta com os campos certos e o DÍGITO DE CONTROLE real (1181)", () => {
    const linha = gerarFpoMagnetico("202607", [item]).conteudo.split("\r\n")[1];
    const d = dec(linha);
    expect(d.slice(0, 6)).toBe("202607");      // competência
    expect(d.slice(6, 13)).toBe("2510332");    // CNES
    expect(d.slice(13, 22)).toBe("020501001"); // procedimento (9)
    expect(d.slice(22, 24)).toBe("21");        // financiamento+apuração
    expect(parseInt(d.slice(24, 32), 10)).toBe(100);         // qtd
    expect(parseInt(d.slice(32, 47), 10)).toBe(16500);       // unit centavos
    expect(parseInt(d.slice(47, 62), 10)).toBe(1650000);     // total = qtd × unit
    expect(d.slice(62, 138)).toBe("0".repeat(76));           // incremento zerado
    expect(d.slice(138, 142)).toBe("1181");                  // controle (valor do arquivo real)
  });

  it("ordena por CNES e procedimento crescentes", () => {
    const itens: FpoMagItem[] = [
      { ...item, cnes: "2510375", codigoFpo: "030101007" },
      { ...item, cnes: "2510332", codigoFpo: "020502004" },
      { ...item, cnes: "2510332", codigoFpo: "020501001" },
    ];
    const linhas = gerarFpoMagnetico("202607", itens).conteudo.split("\r\n").slice(1).filter(Boolean);
    const chaves = linhas.map((l) => { const d = dec(l); return d.slice(6, 13) + d.slice(13, 22); });
    expect(chaves).toEqual([...chaves].sort());
  });

  it("usa o código de apuração padrão quando inválido/vazio", () => {
    const linha = gerarFpoMagnetico("202607", [{ ...item, codApuracao: "" }]).conteudo.split("\r\n")[1];
    expect(dec(linha).slice(22, 24)).toBe("24");
  });
});
