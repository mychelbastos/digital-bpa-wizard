// Referência do layout do arquivo magnético (registro 01) aceita pelo DATASUS. Atualize
// quando sair uma versão nova — a tela de Administração compara o cabeçalho de cada
// prefeitura com esta referência ("em dia" / "revisar versão").
export const LAYOUT_REFERENCIA = {
  versao: "D04.14",
  destino: "MINISTERIO DA SAUDE",
  competencia: "jun/2026",
};

export const HISTORICO_REFERENCIA = [
  { competencia: "jun/2026", destino: "MINISTERIO DA SAUDE", versao: "D04.14" },
  { competencia: "mar/2026", destino: "SECRETARIA DO ESTADO", versao: "D04.11" },
];

export const layoutEmDia = (versao?: string | null) =>
  (versao ?? "").trim().toUpperCase() === LAYOUT_REFERENCIA.versao;
