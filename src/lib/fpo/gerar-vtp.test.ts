import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { carregarVtpBase, codigoVtp, gerarVtp, VTP_K_PADRAO } from "./gerar-vtp";

// SHA-256 do Valores_202610.VTP gerado pelo SPA e ACEITO no SIA 06.08 (junto com o MACIO10.IMP
// 03.07) em 19/11/2026. Se este teste quebrar, o .VTP mudou — reteste no SIA antes de publicar.
const SHA_ACEITO_SIA = "d202079347ea4b0fb5b48f7ba48ed33bfc9745dbf76b5280b0ecfaced8e2578c";
const sha = (s: string) => createHash("sha256").update(Buffer.from(s, "latin1")).digest("hex");

describe("gerarVtp", () => {
  it("código de controle bate com linhas do .VTP oficial (K=76172, FPO-Mag 03.07)", () => {
    const K = 76172;
    expect(codigoVtp("20261003070000000000000000000000000000000000000000000000", K)).toBe("n587&6[3ç0*3@3c");
    expect(codigoVtp("20261001010100102927200200000000000000000000000001      ", K)).toBe("n587&1[6ç3*2@3c");
    expect(codigoVtp("20261001010100282927200200000000000000000000000006      ", K)).toBe("m5b742109225[~p");
    expect(codigoVtp("20261009090100642927200200000000000000000000000004040086", K)).toBe("b51728~1(8!53db");
    expect(codigoVtp("20261004060109002927200100000000000000000000000004040080", K)).toBe("g557]7p7y257cb@");
  });

  it("reproduz byte a byte o .VTP 202610 aceito no SIA", async () => {
    const arq = gerarVtp("202610", await carregarVtpBase(), { versao: "03.07", k: VTP_K_PADRAO });
    expect(arq.nome).toBe("Valores_202610.VTP");
    expect(arq.linhas).toBe(6318);
    expect(sha(arq.conteudo)).toBe(SHA_ACEITO_SIA);
  });

  it("outra competência troca só a competência (e o código)", async () => {
    const arq = gerarVtp("202611", await carregarVtpBase());
    const l = arq.conteudo.split("\r\n").filter(Boolean);
    expect(l[0].slice(0, 10)).toBe("2026110307");
    expect(l.every((x) => x.length === 71 && x.startsWith("202611"))).toBe(true);
  });
});
