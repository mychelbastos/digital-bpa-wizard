// Gerador do arquivo magnético BPA-C (registro tipo 02, consolidado). Reaproveita os
// helpers e o cabeçalho (registro 01) do gerador do BPA-I. Layout: linha 02 = 48 chars.
// Fonte: "Layout da interface texto do BPA" (FEHOSP/DATASUS).
import { numF, alfaF, competencia, montar, header, campoControleDe, dig } from "@/lib/bpa-i-v2/bpa-magnetico";
import type { ConfigOrgao } from "@/lib/bpa-i-v2/config";
import type { RowData } from "@/lib/bpac-layout";

export interface DadosBpaC {
  cnes: string[];
  ano: string[]; // competência de apresentação (cabeçalho) — AAAA
  mes: string[]; // MM
  folhaBase: string[]; // folha inicial (default 1)
  rows: RowData[];
}

// Linha entra no arquivo se tiver procedimento E quantidade > 0.
export const rowPreenchida = (r: RowData) =>
  dig(r.procedimento).length > 0 && (Number(dig(r.quantidade)) || 0) > 0;

// Linha do BPA-C (registro 02) — 48 chars. A competência da linha, no consolidado,
// é a própria competência do boletim (não há data por linha).
export function linhaBpaC(d: DadosBpaC, r: RowData, folha: number, seq: number): string {
  const campos: [number, string][] = [
    [2, "02"],
    [7, numF(d.cnes, 7)],
    [6, competencia(d.ano, d.mes)],
    [6, alfaF(dig(r.cbo), 6)],
    [3, numF(String(folha), 3)],
    [2, numF(String(seq), 2)],
    [10, numF(r.procedimento, 10)],
    [3, numF(r.idade, 3)],
    [6, numF(r.quantidade, 6)],
    [3, "BPA"],
  ];
  return montar(campos, 48);
}

export interface ArquivoBpa {
  conteudo: string;
  nome: string;
  linhas: number;
  folhas: number;
}

// Gera o arquivo completo do BPA-C: header (01) + linhas (02). 20 linhas por folha
// (padrão do consolidado). Linhas sem procedimento/quantidade são ignoradas.
export function gerarArquivoBpaC(d: DadosBpaC, cfg: ConfigOrgao): ArquivoBpa {
  const preenchidas = d.rows.filter(rowPreenchida);
  const comp = competencia(d.ano, d.mes);
  const base = Number(dig(d.folhaBase)) || 1;
  const controle = campoControleDe(preenchidas.map((r) => ({ proc: dig(r.procedimento), qtde: dig(r.quantidade) })));

  const CRLF = "\r\n";
  const linhas = preenchidas.map((r, i) => linhaBpaC(d, r, base + Math.floor(i / 20), (i % 20) + 1));
  const nFolhas = Math.max(1, Math.ceil(linhas.length / 20));
  const head = header(cfg, comp, linhas.length, nFolhas, controle);

  const conteudo = [head, ...linhas].join(CRLF) + CRLF;
  return { conteudo, nome: `PAC${comp}.txt`, linhas: linhas.length, folhas: nFolhas };
}
