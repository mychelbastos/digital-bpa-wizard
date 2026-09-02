import { describe, it, expect, beforeEach } from "vitest";
import { movimentoFaturamento, setMovimentoFaturamento, rotuloMovimento, opcoesMovimento, competenciaCalendario } from "./faturamento";

// O ambiente de teste é `node` (sem localStorage/window). Stub mínimo em memória para
// exercitar a persistência do módulo.
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
  (globalThis as unknown as { window: { dispatchEvent: () => boolean } }).window = { dispatchEvent: () => true };
});

describe("faturamento — movimento", () => {

  it("default é o mês do calendário quando nada foi escolhido", () => {
    expect(movimentoFaturamento()).toBe(competenciaCalendario());
  });

  it("persiste o movimento escolhido", () => {
    setMovimentoFaturamento("202608");
    expect(movimentoFaturamento()).toBe("202608");
  });

  it("ignora valor fora do formato AAAAMM", () => {
    setMovimentoFaturamento("202608");
    setMovimentoFaturamento("abc");
    expect(movimentoFaturamento()).toBe("202608");
  });

  it("rótulo curto amigável", () => {
    expect(rotuloMovimento("202608")).toBe("Ago/2026");
    expect(rotuloMovimento("202601")).toBe("Jan/2026");
  });

  it("opções incluem o valor atual mesmo fora da janela, mais recente primeiro", () => {
    const ops = opcoesMovimento("202001"); // bem antigo
    expect(ops).toContain("202001");
    // ordenado desc
    expect([...ops]).toEqual([...ops].sort((a, b) => b.localeCompare(a)));
    // sem duplicatas
    expect(new Set(ops).size).toBe(ops.length);
  });
});
