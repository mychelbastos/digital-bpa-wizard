import type { ComboOption } from "@/lib/bpa-i-v2/racas";

// Caráter de Atendimento — tabela oficial SIGTAP (tb_carater_atendimento), 6 códigos.
// A caixa no formulário é pequena (2 dígitos) → exibimos o CÓDIGO; a descrição
// completa aparece no dropdown de seleção.
export const CARATERES: ComboOption[] = [
  { code: "01", label: "Eletivo", search: "eletivo" },
  { code: "02", label: "Urgência", search: "urgencia" },
  { code: "03", label: "Acidente no local de trabalho ou a serviço da empresa", search: "acidente local trabalho servico empresa" },
  { code: "04", label: "Acidente no trajeto para o trabalho", search: "acidente trajeto trabalho" },
  { code: "05", label: "Outros tipos de acidente de trânsito", search: "outros acidente transito" },
  { code: "06", label: "Outros tipos de lesões e envenenamentos por agentes químicos ou físicos", search: "outros lesoes envenenamentos agentes quimicos fisicos" },
];
