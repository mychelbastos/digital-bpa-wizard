// Identificação do paciente no BPA-I v3 — campo "inteligente" CPF/CNS.
// O BPA 04.00 (DATASUS, abr/2024) passou a aceitar CPF OU CNS no mesmo lugar. Aqui
// detectamos qual dos dois foi digitado pelo comprimento (11 = CPF, 15 = CNS) e
// validamos com o dígito verificador correspondente. Reaproveita validarCns do v2
// (sem tocá-lo). NÃO altera nada do BPA-I v2.
import { validarCns } from "@/lib/bpa-i-v2/validacao";

// CPF — algoritmo oficial mód-11 (11 dígitos, 2 dígitos verificadores).
export function validarCpf(cpf: string): boolean {
  const c = (cpf || "").replace(/\D/g, "");
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false; // rejeita 000.., 111.., ... (todos iguais)

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(c[i]) * (10 - i);
  let dv1 = 11 - (soma % 11);
  if (dv1 >= 10) dv1 = 0;
  if (dv1 !== Number(c[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(c[i]) * (11 - i);
  let dv2 = 11 - (soma % 11);
  if (dv2 >= 10) dv2 = 0;
  return dv2 === Number(c[10]);
}

export type TipoIdent = "CPF" | "CNS" | null;

export interface IdentPaciente {
  tipo: TipoIdent;   // como o valor está sendo lido: 11 díg. = CPF, 15 díg. = CNS
  completo: boolean; // atingiu um comprimento "final" (11 ou 15 dígitos)
  valido: boolean;   // passou no dígito verificador do tipo detectado
  invalido: boolean; // completo mas reprovado no dígito verificador (acende vermelho)
}

// Interpreta o valor digitado. Comprimentos intermediários (1–10 e 12–14) são
// tratados como "ainda digitando": sugerem o tipo, mas não criticam (fiel ao espírito
// não-agressivo do v2, que só acende o CNS inválido aos 15 dígitos).
export function identificarPaciente(valor: string | string[]): IdentPaciente {
  const d = (Array.isArray(valor) ? valor.join("") : valor || "").replace(/\D/g, "");
  if (d.length === 11) {
    const valido = validarCpf(d);
    return { tipo: "CPF", completo: true, valido, invalido: !valido };
  }
  if (d.length === 15) {
    const valido = validarCns(d);
    return { tipo: "CNS", completo: true, valido, invalido: !valido };
  }
  const tipo: TipoIdent = d.length === 0 ? null : d.length < 11 ? "CPF" : "CNS";
  return { tipo, completo: false, valido: false, invalido: false };
}
