// Crivos leves de contato (telefone e CEP brasileiros). Não-bloqueantes: só sinalizam os
// erros comuns de digitação. Recebem o valor com ou sem máscara (consideram só dígitos).
const soDig = (s: string) => s.replace(/\D/g, "");

// Telefone BR: 10 dígitos (fixo: DDD + 8) ou 11 (celular: DDD + 9). DDD válido a partir de
// 11 (não existe DDD < 11 no Brasil). Em celular (11 díg.) o 1º dígito após o DDD é 9.
export function telefoneValido(tel: string): boolean {
  const d = soDig(tel);
  if (d.length !== 10 && d.length !== 11) return false;
  if (Number(d.slice(0, 2)) < 11) return false;
  if (d.length === 11 && d[2] !== "9") return false;
  return true;
}

// CEP BR: exatamente 8 dígitos.
export function cepValido(cep: string): boolean {
  return soDig(cep).length === 8;
}
