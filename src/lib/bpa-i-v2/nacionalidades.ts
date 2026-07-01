import type { ComboOption } from "@/lib/bpa-i-v2/racas";

// Situação de Nacionalidade — campo "Código (Situação) de Nacionalidade" do CADSUS
// (Texto, tamanho 1). O campo Nacionalidade do BPA-I é a SITUAÇÃO (3 valores), NÃO um
// país: a lista de países é o campo separado "País de Nascimento", que não existe no
// formulário BPA-I. Código de 1 dígito conforme a especificação CADSUS.
export const NACIONALIDADES: ComboOption[] = [
  { code: "1", label: "Brasileiro", search: "brasileiro brasileira" },
  { code: "2", label: "Naturalizado", search: "naturalizado naturalizada" },
  { code: "3", label: "Estrangeiro", search: "estrangeiro estrangeira" },
];

/** Padrão do formulário. */
export const NACIONALIDADE_BRASILEIRO = "1";
