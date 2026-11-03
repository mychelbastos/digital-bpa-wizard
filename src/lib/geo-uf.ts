// Validação de UF / código IBGE de município — o SIA RECUSA o lote inteiro se achar uma
// UF que não exista ou que seja de outro estado (ex.: o caso real "UF 46" num arquivo de BA).
// Usado pela trava preventiva (relatório de consistência + geração do .AAS).

// UFs válidas do IBGE (código de 2 dígitos). 34, 36–40, 44–49, 54+ e 30/20 NÃO existem.
export const UF_VALIDAS = new Set([
  "11", "12", "13", "14", "15", "16", "17", // Norte
  "21", "22", "23", "24", "25", "26", "27", "28", "29", // Nordeste
  "31", "32", "33", "35", // Sudeste
  "41", "42", "43", // Sul
  "50", "51", "52", "53", // Centro-Oeste
]);

export function ufValida(coduf: string | null | undefined): boolean {
  const d = (coduf ?? "").replace(/\D/g, "");
  return d.length === 2 && UF_VALIDAS.has(d);
}

// Descreve o problema de município/UF de um registro, ou null se estiver OK.
// `municipioIbge` = código IBGE (7 díg., com DV). `coduf` = UF de 2 díg. (quando gravada à parte).
// `ufEsperada` = UF do estabelecimento/órgão (2 díg.); quando conhecida, exige que bata — o SIA
// recusa UF de outro estado mesmo que o município seja válido.
export function problemaMunicipioUf(
  municipioIbge: string | null | undefined,
  coduf: string | null | undefined,
  ufEsperada?: string | null,
): string | null {
  const mun = (municipioIbge ?? "").replace(/\D/g, "");
  const uf = (coduf ?? "").replace(/\D/g, "");
  const ufMun = mun.slice(0, 2);
  const ufEfetiva = uf || ufMun; // prioriza a UF gravada; senão deriva do município

  if (!ufEfetiva) return null; // sem dado de UF/município — completude é outra checagem

  if (!UF_VALIDAS.has(ufEfetiva)) {
    return `UF ${ufEfetiva} não existe no Brasil (município IBGE: ${mun || "vazio"}). O SIA recusa o lote inteiro.`;
  }
  if (uf && ufMun && uf !== ufMun) {
    return `UF (${uf}) não corresponde ao IBGE do município (${mun}, que é UF ${ufMun}).`;
  }
  if (mun && mun.length !== 7) {
    return `Código IBGE do município deve ter 7 dígitos (está com ${mun.length}: "${mun}").`;
  }
  const ufRef = (ufEsperada ?? "").replace(/\D/g, "");
  if (ufRef && UF_VALIDAS.has(ufRef) && ufEfetiva !== ufRef) {
    return `Paciente em UF ${ufEfetiva}, mas o estabelecimento é UF ${ufRef} — o SIA recusa UF de outro estado.`;
  }
  return null;
}
