// Parser do arquivo NATIVO do FPO Magnético (FPO-Mag) — o ".IMP" que o programa exporta.
// Diferente do ".xls" da SESAB (ver parse-fpo.ts): aqui o arquivo é texto ISO-8859-1, de
// largura fixa, com os dígitos numéricos gravados por uma CIFRA DE SUBSTITUIÇÃO (10 símbolos
// ↔ 0-9). Um único arquivo traz VÁRIAS unidades (CNES) — a programação inteira do município.
//
// Cifra (validada: o início de toda linha decodifica p/ a competência AAAAMM):
//   * . ; / ? : > , ( )  ->  0 1 2 3 4 5 6 7 8 9
//
// Layout do registro de dado (posições 0-based, após decifrar):
//   [0:6]   competência AAAAMM
//   [6:13]  CNES (7 díg.)
//   [13:22] procedimento — 9 díg. SEM dígito verificador (resolvido p/ SIGTAP igual ao .xls)
//   [22:24] campo fixo (NÃO é dígito do código; incluir aqui "puxava" o 10º dígito errado)
//   [24:32] quantidade orçada (física)
//   [32:47] valor unitário em CENTAVOS
//   [47:62] valor total em centavos (= qtd × unit; usado só como conferência)
//
// Validado contra o arquivo real de 07/2026: 147/147 linhas satisfazem total = qtd × unit,
// os 7 CNES são estabelecimentos reais e os 9 díg. resolveram 139/139 procedimentos no SIGTAP.
// A 1ª linha é cabeçalho (contém letras — não é da cifra) e é ignorada.

import type { FpoLinhaParsed } from "./parse-fpo";

const CIFRA: Record<string, string> = {
  "*": "0", ".": "1", ";": "2", "/": "3", "?": "4", ":": "5", ">": "6", ",": "7", "(": "8", ")": "9",
};
const SIMBOLOS = new Set(Object.keys(CIFRA));

export interface FpoMagGrupo {
  cnes: string;
  competencia: string;      // AAAAMM
  linhas: FpoLinhaParsed[]; // códigoFpo com 9 díg.; descrição vazia (não vem no arquivo)
}
export interface FpoMagParsed {
  grupos: FpoMagGrupo[];
  competencia: string | null;
  avisos: string[];
}

// Uma linha é registro de dado se for TODA composta pelos símbolos da cifra e comprida o
// bastante (o cabeçalho tem letras acentuadas/algarismos crus — cai fora por isso).
function ehLinhaDado(linha: string): boolean {
  if (linha.length < 62) return false;
  for (const c of linha) if (!SIMBOLOS.has(c)) return false;
  return true;
}

// Detecta se o conteúdo é um arquivo do FPO Magnético (para o importador escolher este parser
// em vez do .xls/HTML). Barato: não é HTML e tem ao menos uma linha 100% na cifra.
export function ehFpoMagnetico(texto: string): boolean {
  if (texto.includes("<")) return false; // .xls da SESAB é HTML
  return texto.split(/\r?\n/).some(ehLinhaDado);
}

function decifrar(linha: string): string {
  let out = "";
  for (const c of linha) out += CIFRA[c] ?? "";
  return out;
}

export function parseFpoMagnetico(texto: string): FpoMagParsed {
  const avisos: string[] = [];
  const porCnes = new Map<string, FpoLinhaParsed[]>();
  let competencia: string | null = null;
  let ignoradas = 0;

  for (const bruta of texto.split(/\r?\n/)) {
    if (!ehLinhaDado(bruta)) continue;
    const d = decifrar(bruta);
    const comp = d.slice(0, 6);
    const cnes = d.slice(6, 13);
    const codigoFpo = d.slice(13, 22);           // 9 díg. sem DV
    const qtdOrcada = parseInt(d.slice(24, 32), 10) || 0;
    const valorUnitario = (parseInt(d.slice(32, 47), 10) || 0) / 100; // centavos → reais
    const total = (parseInt(d.slice(47, 62), 10) || 0) / 100;

    // Guarda-corpo: descarta o que não parece produção real (evita pegar um eventual
    // rodapé/totalizador). O invariante do arquivo é total = qtd × unit.
    if (!/^\d{6}$/.test(comp) || !/^\d{7}$/.test(cnes) || !/^\d{9}$/.test(codigoFpo)) { ignoradas++; continue; }
    if (Math.round(qtdOrcada * valorUnitario * 100) !== Math.round(total * 100)) { ignoradas++; continue; }

    if (!competencia) competencia = comp;
    if (!porCnes.has(cnes)) porCnes.set(cnes, []);
    porCnes.get(cnes)!.push({ codigoFpo, descricao: "", qtdOrcada, valorUnitario });
  }

  const grupos: FpoMagGrupo[] = [...porCnes.entries()].map(([cnes, linhas]) => ({
    cnes, competencia: competencia ?? "", linhas,
  }));
  // Ordena por nº de procedimentos (maior primeiro) só para a prévia ficar estável/legível.
  grupos.sort((a, b) => b.linhas.length - a.linhas.length);

  if (grupos.length === 0) avisos.push("Não encontrei registros de FPO neste arquivo.");
  if (ignoradas > 0) avisos.push(`${ignoradas} linha(s) ignorada(s) (cabeçalho/rodapé ou fora do padrão).`);

  return { grupos, competencia, avisos };
}
