import type { ComboOption } from "@/lib/bpa-i-v2/racas";

// Nacionalidade — códigos da tabela NACIONALIDADE do BPA Magnético (3 dígitos), os MESMOS
// que o programa oficial do BPA mostra e que saem no .txt: Brasil=010, Naturalizado=020,
// Estrangeiro=030. (Antes a tela mostrava a "situação" 1/2/3 do CADSUS, o que confundia:
// o arquivo nunca usa 1/2/3.) O gerador `nacionalidadeBpa` continua aceitando valores
// legados ("1"/"2"/"3") gravados em fichas antigas — ver `nacionalidadeParaCombo`.
export const NACIONALIDADES: ComboOption[] = [
  { code: "010", label: "Brasileiro", search: "brasileiro brasileira 1" },
  { code: "020", label: "Naturalizado", search: "naturalizado naturalizada 2" },
  { code: "030", label: "Estrangeiro", search: "estrangeiro estrangeira 3" },
];

/** Padrão do formulário: Brasil (código 010 do BPA Magnético). */
export const NACIONALIDADE_BRASILEIRO = "010";

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

// Valor a ENVIAR ao combo da tela: normaliza o legado (situação "1"/"2"/"3" ou "001") para o
// código de 3 díg. do BPA (010/020/030), para a caixa mostrar o rótulo mesmo em fichas antigas.
// Diferente do gerador: campo VAZIO continua vazio (senão a tela mostraria "Brasileiro" num
// campo em branco e o crivo de obrigatório ficaria incoerente).
export function nacionalidadeParaCombo(v: string | null | undefined): string {
  return v && v.trim() ? nacionalidadeBpa(v) : "";
}
