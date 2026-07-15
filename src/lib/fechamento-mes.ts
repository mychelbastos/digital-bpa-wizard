// Fechamento do mês: agrega TODAS as fichas de um mês de APRESENTAÇÃO (+ CNES) num
// único arquivo magnético combinado — header (01) + linhas BPA-C (02) + linhas BPA-I
// (03). As folhas são renumeradas em sequência no arquivo.
//
// DECISÃO (folha/seq é DERIVADA de propósito — não capturada): analisando os arquivos reais,
// a folha/seq NÃO é lida do papel por ninguém — é um ALGORITMO DE EMPACOTAMENTO do BPA
// Magnético na exportação (uma folha entrelaça vários profissionais; cada profissional tem
// seu contador de seq rolando até 99; ao estourar, abre folha nova). O digitador nunca vê
// esse número. O princípio "não derivar o que se captura" vale para o que o HUMANO lê do papel
// (competência, idade, CID, quantidade) — a folha/seq não é nada disso. Além disso, nosso .txt
// é IMPORTADO de volta no BPA Magnético, que reempacota tudo — o número que geramos é
// descartado. Por isso: derivamos, e o round-trip byte-idêntico via /fechamento NÃO é meta; a
// prova de correção é o harness por-linha (971/971 + 1250/1250, cada CAMPO byte a byte).
//
// A competência de cada linha
// (BPA-C e BPA-I) vem do CABEÇALHO DA FICHA (a competência que o digitador leu da folha
// física — profMes/profAno no BPA-I, ano/mes no BPA-C), NÃO é derivada da data de
// atendimento. Isso reproduz faturamento retroativo (atendimento fora do mês da
// competência), que é a regra. O cabeçalho 01 leva a competência de apresentação.
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
  ano: string[]; // competência de ATENDIMENTO desta ficha (cabeçalho) — vai nas linhas
  mes: string[];
  rows: RowData[];
}

export interface ResumoMes {
  totalLinhas: number;
  totalFolhas: number;
  linhasBpaI: number;
  linhasBpaC: number;
  fichasBpaI: number;
  fichasBpaC: number;
  // Chave de unicidade confirmada contra o PA292720.MAR (Fase 5): sem competência havia
  // 86 colisões BPA-I / 96 BPA-C; COM competência, 0. O DATASUS recusa a importação se
  // duas linhas colidem em (CNES, prof/CBO, competência, folha, sequência). Como as folhas
  // são renumeradas em sequência no arquivo, isto deve ser sempre 0 — é uma salvaguarda.
  chavesDuplicadas: number;
}

// Chave de unicidade de uma linha do arquivo (Fase 5). "prof" = CNS do profissional no
// BPA-I; CBO no BPA-C (consolidado, sem profissional nominal).
export function chaveLinha(
  tipo: "02" | "03",
  cnes: string,
  prof: string,
  comp: string,
  folha: number,
  seq: number,
): string {
  return `${tipo}|${cnes}|${prof}|${comp}|${folha}|${seq}`;
}

export interface FechamentoMes {
  arquivo: ArquivoBpa | null; // null quando não há nenhuma linha
  resumo: ResumoMes;
}

// compApres = AAAAMM do MÊS DE PRODUÇÃO (vai no cabeçalho 01 do arquivo). anoApres/mesApres
// = os mesmos em vetores, usados só como fallback quando uma ficha BPA-C não tem a própria
// competência no `dados`. A competência de CADA linha BPA-C é a do cabeçalho da ficha
// (atendimento); a de cada linha BPA-I é a data de atendimento da sequência.
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
  const chaves = new Set<string>();
  let chavesDuplicadas = 0;
  const registrarChave = (k: string) => {
    if (chaves.has(k)) chavesDuplicadas++;
    else chaves.add(k);
  };
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
    // Competência das linhas = cabeçalho DESTA ficha (atendimento); fallback = mês de produção.
    const anoLinha = st.ano?.length ? st.ano : anoApres;
    const mesLinha = st.mes?.length ? st.mes : mesApres;
    for (let i = 0; i < rows.length; i += 20) {
      rows.slice(i, i + 20).forEach((r, j) => {
        linhas.push(
          linhaBpaC(
            { cnes: st.cnes, ano: anoLinha, mes: mesLinha, folhaBase: [], rows: [] },
            r,
            folha,
            j + 1,
          ),
        );
        controle.push({ proc: dig(r.procedimento), qtde: dig(r.quantidade) });
        registrarChave(
          chaveLinha("02", dig(st.cnes), dig(r.cbo), dig(anoLinha) + dig(mesLinha), folha, j + 1),
        );
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
        registrarChave(
          chaveLinha(
            "03",
            dig(st.cnes),
            dig(st.profCns),
            dig(st.profAno) + dig(st.profMes),
            folha,
            j + 1,
          ),
        );
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
    chavesDuplicadas,
  };
  if (linhas.length === 0) return { arquivo: null, resumo };

  const nFolhas = folha - 1;
  const head = header(cfg, compApres, linhas.length, nFolhas, campoControleDe(controle));
  const conteudo = [head, ...linhas].join(CRLF) + CRLF;
  return {
    arquivo: { conteudo, nome: `PA${compApres}.txt`, linhas: linhas.length, folhas: nFolhas },
    resumo,
  };
}
