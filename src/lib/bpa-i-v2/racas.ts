// Tabela oficial de Raça/Cor do BPA/SIA-SUS (origem CNS/CADSUS/e-SUS).
// Fonte: Nota Técnica do arquivo BPA-I (SISAB/MS) e wiki DATASUS.
// Atenção: NÃO confundir com a ordem do SINASC/SIM (lá 3=Amarela, 4=Parda — invertido).
// O código "99 - Sem informação" foi OMITIDO: rejeitado pelo BPA/SIA desde a competência abril/2023.
export interface ComboOption {
  code: string;
  label: string;
  /** Texto extra para busca (ex.: sinônimos da etnia), normalizado em tokens. */
  search?: string;
}

export const RACAS: ComboOption[] = [
  { code: "01", label: "Branca" },
  { code: "02", label: "Preta" },
  { code: "03", label: "Parda" },
  { code: "04", label: "Amarela" },
  { code: "05", label: "Indígena" },
];

/** Código da Raça/Cor "Indígena" — habilita o campo Etnia. */
export const RACA_INDIGENA = "05";
