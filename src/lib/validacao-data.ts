// Valida o valor de um <input type="date"> nativo ("AAAA-MM-DD"). Sem `max`, o Chrome deixa
// digitar 5+ dígitos no ano (ex.: "19996-08-14"); com `max` ele "empurra" o dígito da
// esquerda (1999 -> 9996). A solução aqui: sem `max` e, no onChange, só aceitar quando o ANO
// tiver ATÉ 4 dígitos — assim o 5º dígito não "pega" (o campo volta ao último valor válido).
// Vazio ("") é válido (campo em branco / limpo).
export const anoAte4Digitos = (iso: string): boolean => !iso || /^\d{1,4}-\d{2}-\d{2}$/.test(iso);

// Crivo da DATA DE NASCIMENTO (DD/MM/AAAA): o <input type="date"> entrega "AAAA-MM-DD".
// Exige ANO com EXATAMENTE 4 dígitos e coerente (1900..ano atual) — assim "26" (que o campo
// guarda como "0026") é REPROVADO — mês/dia reais (rejeita 31/02) e a data não no futuro.
// Vazio é tratado como "ausente" (a obrigatoriedade é cobrada à parte); aqui só valida formato.
export function nascimentoValido(iso: string | null | undefined): boolean {
  if (!iso) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = iso.split("-").map(Number);
  const anoAtual = new Date().getFullYear();
  if (a < 1900 || a > anoAtual) return false;
  if (m < 1 || m > 12) return false;
  const dt = new Date(`${iso}T00:00:00`);
  if (dt.getFullYear() !== a || dt.getMonth() + 1 !== m || dt.getDate() !== d) return false; // ex.: 31/02
  if (dt.getTime() > Date.now()) return false; // sem datas futuras
  return true;
}
