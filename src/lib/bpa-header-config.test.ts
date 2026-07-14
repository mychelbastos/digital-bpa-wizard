import { describe, it, expect } from "vitest";
import { header } from "@/lib/bpa-i-v2/bpa-magnetico";
import { configVazia, type ConfigOrgao } from "@/lib/bpa-i-v2/config";

// Prioridade 3: o harness 971/971 testa o GERADOR, não a CONFIG — por isso sigla errada,
// CNPJ vazio e destino errado passaram apesar do byte-a-byte. Este teste monta o header A
// PARTIR DA CONFIG e compara com o header REAL (registro 01, sem PII de paciente) de DOIS
// arquivos aceitos pelo DATASUS. Cobre duas competências e DUAS versões de layout (D04.11 e
// D04.14) — se alguém deixar a versão/destino desatualizados, o teste quebra.
//
// Os valores de qtd de linhas/folhas/controle vêm dos próprios arquivos:
//   mar/2026: 971 linhas de dados (header 000972), 29 folhas, controle 1608
//   jun/2026: 1250 linhas de dados (header 001251), 23 folhas, controle 1633

const cfgFMSRB = (over: Partial<ConfigOrgao>): ConfigOrgao => ({
  ...configVazia(),
  orgaoOrigemNome: "FUNDO MUNICIPAL DE SAUDE",
  sigla: "FMSRB",
  cgcCpf: "10896489000185",
  destinoTipo: "M",
  ...over,
});

describe("header a partir da config (byte a byte contra arquivos reais)", () => {
  it("março/2026 — versão D04.11, destino Secretaria do Estado", () => {
    const cfg = cfgFMSRB({
      orgaoDestinoNome: "SECRETARIA DA SAUDE DO ESTADO DA BAHIA",
      versao: "D04.11",
    });
    const esperado =
      "01#BPA#2026030009720000291608FUNDO MUNICIPAL DE SAUDE      FMSRB 10896489000185SECRETARIA DA SAUDE DO ESTADO DA BAHIA  MD04.11";
    const gerado = header(cfg, "202603", 971, 29, 1608);
    expect(gerado).toHaveLength(126);
    expect(gerado).toBe(esperado);
  });

  it("junho/2026 — versão D04.14, destino Ministério da Saúde", () => {
    const cfg = cfgFMSRB({ orgaoDestinoNome: "MINISTERIO DA SAUDE", versao: "D04.14" });
    const esperado =
      "01#BPA#2026060012510000231633FUNDO MUNICIPAL DE SAUDE      FMSRB 10896489000185MINISTERIO DA SAUDE                     MD04.14";
    const gerado = header(cfg, "202606", 1250, 23, 1633);
    expect(gerado).toHaveLength(126);
    expect(gerado).toBe(esperado);
  });

  it("uma config divergente (sigla/CNPJ/versão) NÃO passa — é o que faltava pegar", () => {
    const ruim = cfgFMSRB({
      sigla: "SMSRB", // errado
      cgcCpf: "", // vazio
      orgaoDestinoNome: "SMS", // errado
      versao: "DIGBPA1.0", // errado
    });
    const esperadoJun =
      "01#BPA#2026060012510000231633FUNDO MUNICIPAL DE SAUDE      FMSRB 10896489000185MINISTERIO DA SAUDE                     MD04.14";
    expect(header(ruim, "202606", 1250, 23, 1633)).not.toBe(esperadoJun);
  });
});
