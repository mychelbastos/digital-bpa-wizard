// Golden contra o .VTP OFICIAL do FPO-Mag (não fica no repositório). Aponte por env:
//   VTP_PATH="/caminho/Valores_202610.VTP" npx vitest run gerar-vtp.local
// Sem o arquivo, o teste é PULADO.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { carregarVtpBase, gerarVtp } from "./gerar-vtp";

const VTP_PATH = process.env.VTP_PATH || "/Users/mychelbastos/Downloads/FPO VTP 2026/Valores_202610.VTP";

describe("gerarVtp — golden contra o oficial (.local)", () => {
  it.runIf(existsSync(VTP_PATH))("reproduz o Valores_202610.VTP oficial byte a byte (K do arquivo)", async () => {
    const real = readFileSync(VTP_PATH, "latin1");
    const arq = gerarVtp("202610", await carregarVtpBase(), { versao: "03.07", k: 76172 });
    expect(arq.conteudo).toBe(real);
  });
});
