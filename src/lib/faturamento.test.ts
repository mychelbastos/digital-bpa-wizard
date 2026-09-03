import { describe, it, expect, beforeEach } from "vitest";
import { movimentoFaturamento, rotuloMovimento, opcoesMovimento, competenciaCalendario } from "./faturamento";

// Ambiente `node` (sem localStorage). Stub em memória para exercitar o espelho local usado
// como fallback síncrono de `movimentoFaturamento()`.
const CHAVE = "bpa-movimento-faturamento";
beforeEach(() => {
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe("faturamento — leitura síncrona", () => {
  it("default é o mês do calendário quando nada foi definido", () => {
    expect(movimentoFaturamento()).toBe(competenciaCalendario());
  });

  it("usa o espelho local quando presente (bootstrap do valor compartilhado)", () => {
    localStorage.setItem(CHAVE, "202608");
    expect(movimentoFaturamento()).toBe("202608");
  });

  it("ignora espelho fora do formato AAAAMM", () => {
    localStorage.setItem(CHAVE, "abc");
    expect(movimentoFaturamento()).toBe(competenciaCalendario());
  });
});

describe("faturamento — rótulos e opções", () => {
  it("rótulo curto amigável", () => {
    expect(rotuloMovimento("202608")).toBe("Ago/2026");
    expect(rotuloMovimento("202601")).toBe("Jan/2026");
  });

  it("opções incluem o valor atual mesmo fora da janela, desc, sem duplicatas", () => {
    const ops = opcoesMovimento("202001");
    expect(ops).toContain("202001");
    expect([...ops]).toEqual([...ops].sort((a, b) => b.localeCompare(a)));
    expect(new Set(ops).size).toBe(ops.length);
  });

  it("mês atual + 5 anteriores (6 no total) e NENHUM mês futuro", () => {
    const atual = competenciaCalendario();
    const ops = opcoesMovimento(atual);
    expect(ops.length).toBe(6);         // atual + 5
    expect(ops[0]).toBe(atual);         // mais recente = mês atual (sem futuro)
    expect(ops.every((m) => m <= atual)).toBe(true);
  });
});
