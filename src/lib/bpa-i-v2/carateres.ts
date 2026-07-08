import type { ComboOption } from "@/lib/bpa-i-v2/racas";

// Caráter de Atendimento — tabela oficial SIGTAP (tb_carater_atendimento), 6 códigos.
// A caixa no formulário é pequena (2 dígitos) → exibimos o CÓDIGO; a descrição
// completa aparece no dropdown de seleção. `curto` é a versão abreviada mostrada ao
// lado do campo (só na tela, confirma o que foi escolhido) — o espaço ali é limitado.
export const CARATERES: ComboOption[] = [
  { code: "01", label: "Eletivo", search: "eletivo", curto: "Eletivo" },
  { code: "02", label: "Urgência", search: "urgencia", curto: "Urgência" },
  { code: "03", label: "Acidente no local de trabalho ou a serviço da empresa", search: "acidente local trabalho servico empresa", curto: "Acidente de trabalho" },
  { code: "04", label: "Acidente no trajeto para o trabalho", search: "acidente trajeto trabalho", curto: "Acidente de trajeto" },
  { code: "05", label: "Outros tipos de acidente de trânsito", search: "outros acidente transito", curto: "Outro acid. trânsito" },
  { code: "06", label: "Outros tipos de lesões e envenenamentos por agentes químicos ou físicos", search: "outros lesoes envenenamentos agentes quimicos fisicos", curto: "Outras lesões/envenen." },
];
