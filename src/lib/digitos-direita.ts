// Ancora dígitos à direita em `n` caixinhas (estilo visor de calculadora): mantém os
// ÚLTIMOS n dígitos e preenche o começo com "". É a base do campo Quantidade (BPA-C) e
// da normalização de valores salvos no formato antigo (à esquerda). Ignora não-dígitos
// (ex.: os espaços de campos importados). Pura e idempotente.
export function ancorarDigitosDireita(digits: string, n: number): string[] {
  const d = (digits ?? "").replace(/\D/g, "").slice(-n);
  return [...Array(Math.max(0, n - d.length)).fill(""), ...d.split("")];
}
