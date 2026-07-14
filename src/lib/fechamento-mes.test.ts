import { describe, it, expect } from "vitest";
import { gerarArquivoMes } from "./fechamento-mes";
import { configVazia } from "./bpa-i-v2/config";
import { emptySeq } from "./bpai-v2-layout";
import type { FichaCompleta } from "./bpa-i-v2/fichas";

const cells = (s: string, n: number) => Array.from({ length: n }, (_, i) => s[i] ?? "");
const cfg = () => ({ ...configVazia(), orgaoOrigemNome: "PREF EXEMPLO", sigla: "PMEX", cgcCpf: "12345678000199", orgaoDestinoNome: "SES", destinoTipo: "E" as const });

// Monta uma ficha BPA-I (1 sequência preenchida) com idade/competência controladas.
function fichaBpaI(over: Partial<ReturnType<typeof emptySeq>>, profAno = "2026", profMes = "06"): FichaCompleta {
  const seq = { ...emptySeq(), codProc: cells("0301010013", 10), qtde: cells("002", 3), dataNasc: cells("15031990", 8), dataAtend: cells("10062026", 8), ...over };
  return {
    id: "x", tipo: "BPA-I", mes_producao: "202606",
    dados: { cnes: cells("2510332", 7), profCns: cells("123456789010000", 15), profCbo: cells("225125", 6), profMes: cells(profMes, 2), profAno: cells(profAno, 4), profFolha: cells("001", 3), seqs: [seq] },
  };
}

// Extrai a 1ª linha 03 (BPA-I) do arquivo gerado.
function linha03(fichas: FichaCompleta[]): string {
  const { arquivo } = gerarArquivoMes(fichas, "202606", cells("2026", 4), cells("06", 2), cfg());
  return arquivo!.conteudo.split("\r\n").find((l) => l.startsWith("03"))!;
}

describe("geração pelo caminho real do app (competência da ficha; idade derivada)", () => {
  // Idade NÃO é capturada na UI do BPA-I (o papel não tem o campo). É derivada na geração.
  // SeqData.idade existe só como OVERRIDE OPCIONAL do modelo (o harness de regressão o usa
  // p/ reproduzir o arquivo real byte a byte). Estes dois casos travam esse contrato.
  it("override opcional de idade (modelo) sai fiel no .txt quando presente", () => {
    const l = linha03([fichaBpaI({ idade: cells("070", 3) })]);
    expect(l.slice(85, 88)).toBe("070"); // o override, não o cálculo "036"
  });

  it("sem override, a idade é DERIVADA (anos completos na data de atendimento) — 036", () => {
    const l = linha03([fichaBpaI({ idade: [] })]);
    expect(l.slice(85, 88)).toBe("036");
  });

  it("competência da linha vem da FICHA, não da data de atendimento (faturamento retroativo)", () => {
    // Competência 202601, atendimento em 07/11/2025 (fora do mês) — deve sair 202601.
    const l = linha03([fichaBpaI({ dataAtend: cells("07112025", 8) }, "2026", "01")]);
    expect(l.slice(9, 15)).toBe("202601");
    expect(l.slice(36, 44)).toBe("20251107"); // a data de atendimento real preservada
  });
});
