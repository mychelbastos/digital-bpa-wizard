// Gerador do Valores_AAAAMM.VTP (tabela de valores do FPO-Mag) que o SIA exige JUNTO com o
// MACIO<MM>.IMP — o SIA não aceita o .IMP sozinho. Layout e código de controle decifrados por
// nós (19/11/2026): reproduz byte a byte os .VTP oficiais de 03, 05, 07 e 10/2026
// (24.167/24.167 linhas) e o par .IMP+.VTP gerado pelo SPA foi ACEITO no SIA 06.08.
//
// Texto ISO-8859-1, CRLF, 71 chars por linha:
//   Cabeçalho: competência(6) + versão FPO-Mag(4, "0307") + 46 zeros + código(15)
//   Linha:     [0:6]   competência
//              [6:16]  procedimento (10, com DV)
//              [16:22] IBGE do município (6)
//              [22:24] tipo: "02" = toda a SIGTAP; "01" = linha extra das eletivas (FAEC 040080),
//                      logo DEPOIS da "02" do mesmo procedimento
//              [24:48] valores/complementos (zeros quando não há; 8 procedimentos têm uma marcação)
//              [48:50] financiamento SIGTAP   [50:56] rubrica SIGTAP (espaços se vazia)
//              [56:71] código de controle
//   Código: S = Σ (i+1)·(charCode−48) sobre [0:56] (espaço conta −16); V = (S + K) mod 100000;
//           os 5 dígitos de V entram nas posições 3,5,7,9,11 do modelo escolhido por V mod 9.
//   K é uma constante do arquivo inteiro (o FPO-Mag usa uma diferente a cada exportação; o SIA
//   aceitou a nossa, VTP_K_PADRAO).

import { FPO_MAG_VERSAO } from "./gerar-fpo-magnetico";

const MODELOS = [
  "h54#5#2#-#p#*!5", "n58#&#[#ç#*#@3c", "b51#2#~#(#!#3db", "g55#]#p#y#5#cb@", "l5o#k#m#j#h#nbg",
  "o5m#h#b#7#4#815", "k5h#g#4#%#5#&2]", "m5b#4#1#9#2#[~p", "j57#%#9#3#-#ç(y",
];
const POS = [3, 5, 7, 9, 11];

export const VTP_K_PADRAO = 41357; // validado no SIA em 19/11/2026
export const IBGE6_PADRAO = "292720"; // Ruy Barbosa-BA

export function somaVtp(s: string): number {
  let t = 0;
  for (let i = 0; i < s.length; i++) t += (i + 1) * (s.charCodeAt(i) - 48);
  return t;
}

export function codigoVtp(miolo56: string, k: number): string {
  const v = (((somaVtp(miolo56) + k) % 100000) + 100000) % 100000;
  const d = String(v).padStart(5, "0");
  const out = MODELOS[v % 9].split("");
  POS.forEach((p, i) => { out[p] = d[i]; });
  return out.join("");
}

export interface VtpBase {
  procedimentos: string; // "PPPPPPPPPPFFRRRRRR" separados por \n
  eletivas: string;      // códigos de 10 concatenados
  marcados: string;      // códigos de 10 concatenados
  marcacao: string;      // 24 chars
}

export interface VtpArquivo { conteudo: string; nome: string; linhas: number }

const blocos = (s: string) => s.match(/\d{10}/g) ?? [];

export function gerarVtp(
  competencia: string, base: VtpBase,
  opts: { ibge6?: string; versao?: string; k?: number } = {},
): VtpArquivo {
  const comp = competencia.replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(comp)) throw new Error(`Competência inválida: ${competencia}`);
  const ibge = (opts.ibge6 ?? IBGE6_PADRAO).replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(ibge)) throw new Error(`IBGE inválido: ${opts.ibge6}`);
  const versao = (opts.versao ?? FPO_MAG_VERSAO).replace(".", "");
  const k = opts.k ?? VTP_K_PADRAO;
  const elet = new Set(blocos(base.eletivas));
  const marc = new Set(blocos(base.marcados));
  const zeros = "0".repeat(24);

  const miolos: string[] = [comp + versao + "0".repeat(46)];
  const procs = base.procedimentos.split("\n").filter((l) => l.length >= 12).sort();
  for (const l of procs) {
    const cod = l.slice(0, 10), fin = l.slice(10, 12), rub = l.slice(12).padEnd(6, " ").slice(0, 6);
    miolos.push(comp + cod + ibge + "02" + (marc.has(cod) ? base.marcacao : zeros) + fin + rub);
    if (elet.has(cod)) miolos.push(comp + cod + ibge + "01" + zeros + "04040080");
  }
  const conteudo = miolos.map((m) => {
    if (m.length !== 56) throw new Error(`Linha do VTP com tamanho ${m.length}: ${m}`);
    return m + codigoVtp(m, k) + "\r\n";
  }).join("");
  return { conteudo, nome: `Valores_${comp}.VTP`, linhas: miolos.length };
}

// Carrega a base embutida (lazy: ~90 KB, só quando exporta).
export async function carregarVtpBase(): Promise<VtpBase> {
  const m = await import("./vtp-base");
  return { procedimentos: m.VTP_PROCEDIMENTOS, eletivas: m.VTP_ELETIVAS, marcados: m.VTP_MARCADOS, marcacao: m.VTP_MARCACAO };
}
