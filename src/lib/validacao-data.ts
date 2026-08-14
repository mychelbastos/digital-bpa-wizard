// Valida o valor de um <input type="date"> nativo ("AAAA-MM-DD"). Sem `max`, o Chrome deixa
// digitar 5+ dígitos no ano (ex.: "19996-08-14"); com `max` ele "empurra" o dígito da
// esquerda (1999 -> 9996). A solução aqui: sem `max` e, no onChange, só aceitar quando o ANO
// tiver ATÉ 4 dígitos — assim o 5º dígito não "pega" (o campo volta ao último valor válido).
// Vazio ("") é válido (campo em branco / limpo).
export const anoAte4Digitos = (iso: string): boolean => !iso || /^\d{1,4}-\d{2}-\d{2}$/.test(iso);
