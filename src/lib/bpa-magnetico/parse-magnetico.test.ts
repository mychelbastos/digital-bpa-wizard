import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArquivoMagnetico } from "./parse-magnetico";

// Fixture anonimizado versionado (mesmo do harness byte-a-byte) — BPA-C + BPA-I, comp 202603.
const FIXTURE = fileURLToPath(new URL("../__fixtures__/bpa-mar-anon.txt", import.meta.url));

describe("parseArquivoMagnetico (fixture anonimizado)", () => {
  const raw = existsSync(FIXTURE) ? readFileSync(FIXTURE, "latin1") : "";
  const r = parseArquivoMagnetico(raw);

  it("lê o cabeçalho (competência de apresentação)", () => {
    expect(r.cabecalho?.competencia).toBe("202603");
    expect(r.cabecalho?.orgaoOrigem).toBeTruthy();
  });

  it("conta as linhas 02 (BPA-C) e 03 (BPA-I)", () => {
    expect(r.totais.linhas02).toBe(415);
    expect(r.totais.linhas03).toBe(556);
  });

  it("agrupa em fichas sem perder linhas", () => {
    const rows = r.fichasC.reduce((a, f) => a + f.rows.length, 0);
    const seqs = r.fichasI.reduce((a, f) => a + f.seqs.length, 0);
    expect(rows).toBe(415);
    expect(seqs).toBe(556);
    expect(r.fichasC.length).toBeGreaterThan(0);
    expect(r.fichasI.length).toBeGreaterThan(0);
    // Agrupou de fato (menos fichas que linhas).
    expect(r.fichasC.length).toBeLessThan(415);
  });

  it("extrai campos com o shape correto", () => {
    for (const f of r.fichasC) {
      expect(f.cnes).toMatch(/^\d{7}$/);
      expect(f.competencia).toMatch(/^\d{6}$/);
      expect(f.rows[0].procedimento).toHaveLength(10);
    }
    for (const f of r.fichasI) {
      expect(f.cnes).toMatch(/^\d{7}$/);
      expect(f.competencia).toMatch(/^\d{6}$/);
      expect(f.seqs[0].codProc).toHaveLength(10);
      expect(f.seqs[0].cnsPac).toHaveLength(15);
    }
    expect(r.totais.quantidadeBpaC).toBeGreaterThan(0);
    expect(r.totais.quantidadeBpaI).toBeGreaterThan(0);
  });

  it("não gera avisos de estrutura no arquivo bem formado", () => {
    // Pode haver aviso de competência de atendimento ≠ apresentação (legítimo); estrutura, não.
    expect(r.avisos.some((a) => /desconhecido|vazio|cabeçalho/i.test(a))).toBe(false);
  });
});

describe("parseArquivoMagnetico (vazio / inválido)", () => {
  it("não quebra em entrada vazia", () => {
    const r = parseArquivoMagnetico("");
    expect(r.fichasC).toEqual([]);
    expect(r.fichasI).toEqual([]);
    expect(r.avisos.length).toBeGreaterThan(0);
  });
});
