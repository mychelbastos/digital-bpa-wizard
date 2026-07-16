import { useEffect, useState } from "react";
import {
  buscarProcedimentoSigtap,
  quantidadeExcedida,
  idadeForaDaFaixa,
  cboValidoParaProcedimento,
  type ProcedimentoSigtap,
} from "@/lib/bpa-i-v2/procedimentos-sigtap";
import type { RowData } from "@/lib/bpac-layout";

export interface ValidacaoLinhaBpaC {
  proc: ProcedimentoSigtap | null;
  procNome: string | null;
  naoEncontrado: boolean; // completo mas não achou no SIGTAP
  idadeInvalida: boolean;
  idadeMotivo?: string;
  qtdeInvalida: boolean;
  qtdeMotivo?: string;
  cboInvalido: boolean;
  cboMotivo?: string;
  motivos: string[];
}

// "84 meses" -> "7 anos" (mensagens legíveis).
function formatarMeses(meses: number): string {
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anos === 0) return `${resto} ${resto === 1 ? "mês" : "meses"}`;
  if (resto === 0) return `${anos} ${anos === 1 ? "ano" : "anos"}`;
  return `${anos}a ${resto}m`;
}

// Crivo de uma linha do BPA-C contra a tabela SIGTAP da competência do boletim:
// procedimento existe? idade na faixa? quantidade dentro do máximo? CBO compatível?
// No BPA-C consolidado não há data por linha — a competência da linha é a própria
// competência do boletim (AAAAMM, do cabeçalho). Se ela não estiver carregada, o crivo
// cai na competência mais recente (fail-open, ver resolverCompetencia).
// Uma busca do procedimento por linha (hook), compartilhada entre as checagens.
export function useValidacaoLinhaBpaC(row: RowData, competencia: string | null): ValidacaoLinhaBpaC {
  const codProc = row.procedimento.join("");
  const procCompleto = codProc.length === 10;

  // Guarda o resultado JUNTO do código que o gerou. Assim distinguimos "ainda buscando"
  // (sem resultado p/ o código atual) de "buscou e não achou" — senão o aviso de
  // "não encontrado" pisca durante o meio-segundo da busca assíncrona.
  const [resultado, setResultado] = useState<{ cod: string; proc: ProcedimentoSigtap | null } | null>(null);
  useEffect(() => {
    if (!procCompleto) { setResultado(null); return; }
    let cancel = false;
    buscarProcedimentoSigtap(codProc, competencia).then((p) => { if (!cancel) setResultado({ cod: codProc, proc: p }); });
    return () => { cancel = true; };
  }, [codProc, procCompleto, competencia]);
  const resolvido = resultado?.cod === codProc; // a busca terminou para o código atual?
  const proc = resolvido ? resultado!.proc : null;
  const naoEncontrado = procCompleto && resolvido && proc === null;

  // BPA-C guarda a idade em ANOS; o SIGTAP compara em meses (aprox.: anos × 12).
  const idadeAnos = Number(row.idade.join("")) || 0;
  const idadeMeses = row.idade.some(Boolean) ? idadeAnos * 12 : null;
  const qtde = Number(row.quantidade.join("")) || 0;

  const idadeInvalida = Boolean(proc) && idadeForaDaFaixa(proc!.idadeMinimaMeses, proc!.idadeMaximaMeses, idadeMeses);
  const qtdeInvalida = Boolean(proc) && quantidadeExcedida(proc!.qtMaximaExecucao, qtde);

  const cbo = row.cbo.join("");
  const [cboValido, setCboValido] = useState<boolean | null>(null);
  useEffect(() => {
    if (!procCompleto || cbo.length !== 6) { setCboValido(null); return; }
    let cancel = false;
    cboValidoParaProcedimento(codProc, cbo, competencia).then((v) => { if (!cancel) setCboValido(v); });
    return () => { cancel = true; };
  }, [procCompleto, codProc, cbo, competencia]);
  const cboInvalido = cboValido === false;

  const idadeMotivo = idadeInvalida
    ? `Idade (${idadeAnos} ${idadeAnos === 1 ? "ano" : "anos"}) fora da faixa permitida para este procedimento` +
      (proc!.idadeMinimaMeses !== 9999 || proc!.idadeMaximaMeses !== 9999
        ? ` (${proc!.idadeMinimaMeses === 9999 ? "sem mínimo" : formatarMeses(proc!.idadeMinimaMeses!)} a ${proc!.idadeMaximaMeses === 9999 ? "sem máximo" : formatarMeses(proc!.idadeMaximaMeses!)}).`
        : ".")
    : undefined;
  const qtdeMotivo = qtdeInvalida
    ? `Quantidade (${qtde}) maior que o máximo permitido para este procedimento (${proc!.qtMaximaExecucao}).`
    : undefined;
  const cboMotivo = cboInvalido ? `CBO ${cbo} não é compatível com este procedimento (SIGTAP).` : undefined;
  const naoEncontradoMotivo = naoEncontrado ? "Código não encontrado na tabela oficial do SIGTAP." : undefined;

  const motivos = [naoEncontradoMotivo, idadeMotivo, qtdeMotivo, cboMotivo].filter((m): m is string => Boolean(m));

  return {
    proc,
    procNome: proc?.nome ?? null,
    naoEncontrado,
    idadeInvalida,
    idadeMotivo,
    qtdeInvalida,
    qtdeMotivo,
    cboInvalido,
    cboMotivo,
    motivos,
  };
}
