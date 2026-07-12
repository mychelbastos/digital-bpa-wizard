// Fechamento do mês: agrega TODAS as fichas de um mês de APRESENTAÇÃO (+ CNES) num
// único arquivo magnético combinado — header (01) + linhas BPA-C (02) + linhas BPA-I
// (03). As folhas são renumeradas em sequência no arquivo. A competência de cada linha
// BPA-I vem da sua data de atendimento (produção retroativa); o cabeçalho leva a
// competência de apresentação escolhida.
import {
  linhaBpaI,
  seqPreenchida,
  header,
  campoControleDe,
  dig,
  type DadosBpa,
  type ArquivoBpa,
} from "@/lib/bpa-i-v2/bpa-magnetico";
import { linhaBpaC, rowPreenchida } from "@/lib/bpa-c-v2/bpa-magnetico";
import type { ConfigOrgao } from "@/lib/bpa-i-v2/config";
import type { FichaCompleta } from "@/lib/bpa-i-v2/fichas";
import type { SeqData } from "@/lib/bpai-v2-layout";
import type { RowData } from "@/lib/bpac-layout";

interface BpaIState {
  cnes: string[];
  profCns: string[];
  profCbo: string[];
  profMes: string[];
  profAno: string[];
  profFolha: string[];
  seqs: SeqData[];
}
interface BpaCState {
  cnes: string[];
  rows: RowData[];
}

export interface ResumoMes {
  totalLinhas: number;
  totalFolhas: number;
  linhasBpaI: number;
  linhasBpaC: number;
  fichasBpaI: number;
  fichasBpaC: number;
}

export interface FechamentoMes {
  arquivo: ArquivoBpa | null; // null quando não há nenhuma linha
  resumo: ResumoMes;
}

// compApres = AAAAMM de apresentação; anoApres/mesApres = os mesmos, em vetores (p/ os
// campos das linhas BPA-C, cuja competência = a de apresentação do consolidado).
export function gerarArquivoMes(
  fichas: FichaCompleta[],
  compApres: string,
  anoApres: string[],
  mesApres: string[],
  cfg: ConfigOrgao,
): FechamentoMes {
  const CRLF = "\r\n";
  const linhas: string[] = [];
  const controle: { proc: string; qtde: string }[] = [];
  let folha = 1;
  let linhasBpaC = 0;
  let linhasBpaI = 0;
  let fichasBpaC = 0;
  let fichasBpaI = 0;

  // BPA-C (registro 02) — 20 linhas por folha.
  for (const f of fichas.filter((x) => x.tipo === "BPA-C")) {
    const st = f.dados as BpaCState;
    const rows = (st?.rows ?? []).filter(rowPreenchida);
    if (rows.length === 0) continue;
    fichasBpaC++;
    for (let i = 0; i < rows.length; i += 20) {
      rows.slice(i, i + 20).forEach((r, j) => {
        linhas.push(linhaBpaC({ cnes: st.cnes, ano: anoApres, mes: mesApres, folhaBase: [], rows: [] }, r, folha, j + 1));
        controle.push({ proc: dig(r.procedimento), qtde: dig(r.quantidade) });
        linhasBpaC++;
      });
      folha++;
    }
  }

  // BPA-I (registro 03) — 3 linhas por folha.
  for (const f of fichas.filter((x) => x.tipo === "BPA-I")) {
    const st = f.dados as BpaIState;
    const seqs = (st?.seqs ?? []).filter(seqPreenchida);
    if (seqs.length === 0) continue;
    fichasBpaI++;
    const dados: DadosBpa = {
      cnes: st.cnes,
      profCns: st.profCns,
      profCbo: st.profCbo,
      profMes: st.profMes,
      profAno: st.profAno,
      profFolha: st.profFolha,
      seqs,
    };
    for (let i = 0; i < seqs.length; i += 3) {
      seqs.slice(i, i + 3).forEach((s, j) => {
        linhas.push(linhaBpaI(dados, s, folha, j + 1));
        controle.push({ proc: dig(s.codProc), qtde: dig(s.qtde) });
        linhasBpaI++;
      });
      folha++;
    }
  }

  const resumo: ResumoMes = {
    totalLinhas: linhas.length,
    totalFolhas: Math.max(0, folha - 1),
    linhasBpaI,
    linhasBpaC,
    fichasBpaI,
    fichasBpaC,
  };
  if (linhas.length === 0) return { arquivo: null, resumo };

  const nFolhas = folha - 1;
  const head = header(cfg, compApres, linhas.length, nFolhas, campoControleDe(controle));
  const conteudo = [head, ...linhas].join(CRLF) + CRLF;
  return { arquivo: { conteudo, nome: `PA${compApres}.txt`, linhas: linhas.length, folhas: nFolhas }, resumo };
}
