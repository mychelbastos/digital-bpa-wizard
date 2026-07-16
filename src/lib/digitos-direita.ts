// Ancora CARACTERES à direita em `n` caixinhas (estilo visor de calculadora): mantém os
// ÚLTIMOS n caracteres e preenche o começo com "". Pura e idempotente. Use a variante
// específica conforme o campo (só-dígitos vs alfanumérico).
export function ancorarCharsDireita(str: string, n: number): string[] {
  const s = (str ?? "").slice(-n);
  return [...Array(Math.max(0, n - s.length)).fill(""), ...s.split("")];
}

// Variante só-dígitos: descarta não-dígitos (ex.: os espaços de campos importados) antes
// de ancorar. Base do campo Quantidade/Idade (numéricos) e da normalização ao carregar.
export function ancorarDigitosDireita(digits: string, n: number): string[] {
  return ancorarCharsDireita((digits ?? "").replace(/\D/g, ""), n);
}
