// Golden byte-a-byte do gerador do FPO Magnético (.IMP) contra um arquivo REAL.
// O .IMP não fica no repositório (dado do município). Aponte o caminho por env:
//   MACIO_PATH="/caminho/MACIO07.IMP" npx vitest run gerar-fpo-magnetico.local
// Sem o arquivo, o teste é PULADO (não quebra o CI). Prova que o gerador reproduz 100%.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { gerarFpoMagnetico, type FpoMagItem } from "./gerar-fpo-magnetico";

const MACIO_PATH =
  process.env.MACIO_PATH || "/Users/mychelbastos/Downloads/BPA FORMS - LOVABLE/FPO/MACIO07.IMP";

// decifra uma linha (símbolo -> dígito), p/ extrair os campos do arquivo real.
const DECIFRA: Record<string, string> = {
  "*": "0", ".": "1", ";": "2", "/": "3", "?": "4", ":": "5", ">": "6", ",": "7", "(": "8", ")": "9",
};
const SIM = new Set(Object.keys(DECIFRA));
const dec = (s: string) => [...s].map((c) => DECIFRA[c] ?? "·").join("");

describe("gerarFpoMagnetico — golden byte a byte (.local)", () => {
  const existe = existsSync(MACIO_PATH);
  it.runIf(existe)("reproduz o MACIO<MM>.IMP real byte a byte", () => {
    const real = readFileSync(MACIO_PATH, "latin1");
    const linhas = real.split(/\r?\n/).filter((l) => l.length > 0);
    const dados = linhas.slice(1).filter((l) => l.length >= 62 && [...l].every((c) => SIM.has(c)));
    const comp = dec(linhas[0].slice(3, 9));
    const itens: FpoMagItem[] = dados.map((l) => {
      const d = dec(l);
      return {
        cnes: d.slice(6, 13),
        codigoFpo: d.slice(13, 22),
        codApuracao: d.slice(22, 24),
        qtdOrcada: parseInt(d.slice(24, 32), 10),
        valorUnitario: parseInt(d.slice(32, 47), 10) / 100,
      };
    });
    const { conteudo } = gerarFpoMagnetico(comp, itens);
    expect(conteudo).toBe(real.endsWith("\r\n") ? real : real + "\r\n");
  });

  if (!existe) it("arquivo real ausente — golden pulado (defina MACIO_PATH)", () => { expect(true).toBe(true); });
});
