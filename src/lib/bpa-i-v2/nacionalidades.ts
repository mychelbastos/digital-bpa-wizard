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

/** Padrão do formulário (situação CADSUS). */
export const NACIONALIDADE_BRASILEIRO = "1";

// Converte a nacionalidade guardada para o código da tabela NACIONALIDADE do BPA Magnético
// (o arquivo NÃO usa a situação 1/2/3 — usa Brasil = 010, e códigos de país p/ estrangeiros).
// Regra do gestor: em BRANCO assume 010 (Brasil). Confirmado byte a byte: as linhas importadas
// de .MAR reais do DATASUS trazem 010 p/ brasileiro; a situação "1" que o app guardava saía
// como "001" e o BPA Magnético RECUSAVA a importação. Mapeia no momento de gerar o .txt (mesmo
// padrão do RAAS `situacaoParaNacionalidadeRaas`), sem precisar migrar dado gravado.
export function nacionalidadeBpa(v: string | null | undefined): string {
  const t = (v || "").replace(/\s/g, "");
  if (t === "" || t === "1" || t === "001" || t === "10" || t === "010") return "010"; // Brasileiro / Brasil
  if (t === "2" || t === "20" || t === "020") return "020"; // Naturalizado brasileiro
  if (t === "3" || t === "30" || t === "030") return "030"; // Estrangeiro (genérico)
  if (/^\d{3}$/.test(t)) return t; // já é código de 3 díg. (ex.: país específico vindo do .MAR)
  return "010"; // fallback seguro (população atendida é brasileira)
}
