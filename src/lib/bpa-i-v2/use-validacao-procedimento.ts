import { useEffect, useState } from "react";
import type { SeqData } from "@/lib/bpai-v2-layout";
import { idadeEmMeses, competenciaDoAtendimento } from "@/lib/bpa-i-v2/validacao";
import {
  buscarProcedimentoSigtap,
  servicoClassificacaoValida,
  cidValidoParaProcedimento,
  sexoIncompativel,
  quantidadeExcedida,
  idadeForaDaFaixa,
  type ProcedimentoSigtap,
} from "@/lib/bpa-i-v2/procedimentos-sigtap";

export interface ValidacaoProcedimento {
  proc: ProcedimentoSigtap | null;
  procCompleto: boolean;
  procNaoEncontrado: boolean; // completo mas não achou no SIGTAP
  sexoInvalido: boolean;
  idadeInvalida: boolean;
  qtdeInvalida: boolean;
  servicoInvalido: boolean; // combinação Serviço+Classe não existe p/ este procedimento
  cidInvalido: boolean;
  // Motivo legível de cada checagem (undefined quando ela está ok) — vira tooltip do
  // campo em vermelho. `motivos` junta tudo p/ o resumo/bloqueio de exportar-salvar.
  procNaoEncontradoMotivo?: string;
  sexoMotivo?: string;
  idadeMotivo?: string;
  qtdeMotivo?: string;
  servicoMotivo?: string;
  cidMotivo?: string;
  motivos: string[];
  temErro: boolean;
}

// "84 meses" -> "7 anos". Usado só p/ deixar as mensagens legíveis.
function formatarMeses(meses: number): string {
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anos === 0) return `${resto} ${resto === 1 ? "mês" : "meses"}`;
  if (resto === 0) return `${anos} ${anos === 1 ? "ano" : "anos"}`;
  return `${anos}a ${resto}m`;
}

// Cruza TUDO que a sequência preenche (procedimento, quantidade, idade, sexo, serviço,
// classificação, CID) contra a tabela oficial do SIGTAP — uma única busca do
// procedimento por sequência, compartilhada entre todas as checagens derivadas.
// Não bloqueia nada; só calcula os sinais visuais (bordas) que a UI decide mostrar.
export function useValidacaoProcedimento(s: SeqData): ValidacaoProcedimento {
  const codProc = s.codProc.join("");
  const procCompleto = codProc.length === 10;

  // Competência da linha = data do atendimento (prd-cmp). Se não estiver carregada no
  // SIGTAP, o crivo cai na mais recente (ver resolverCompetencia).
  const competencia = competenciaDoAtendimento(s.dataAtend);

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

  const procNaoEncontrado = procCompleto && resolvido && proc === null;

  const qtde = Number(s.qtde.join("")) || 0;
  const idadeMeses = idadeEmMeses(s.dataNasc, s.dataAtend);

  const sexoInvalido = Boolean(proc) && sexoIncompativel(proc!.sexo, s.sexo);
  const idadeInvalida = Boolean(proc) && idadeForaDaFaixa(proc!.idadeMinimaMeses, proc!.idadeMaximaMeses, idadeMeses);
  const qtdeInvalida = Boolean(proc) && quantidadeExcedida(proc!.qtMaximaExecucao, qtde);

  // Só os dígitos: um campo importado em branco vem como "   " (3 espaços) e NÃO pode
  // ser tratado como um código de 3 caracteres (senão o crivo o considera combinação
  // inválida). Espelha o `.trim()` que o CID já faz logo abaixo.
  const servico = s.servico.join("").replace(/\D/g, "");
  const classProc = s.classProc.join("").replace(/\D/g, "");
  const [servicoValido, setServicoValido] = useState<boolean | null>(null);
  useEffect(() => {
    if (!procCompleto || servico.length !== 3 || classProc.length !== 3) { setServicoValido(null); return; }
    let cancel = false;
    servicoClassificacaoValida(codProc, servico, classProc, competencia).then((v) => { if (!cancel) setServicoValido(v); });
    return () => { cancel = true; };
  }, [procCompleto, codProc, servico, classProc, competencia]);
  const servicoInvalido = servicoValido === false;

  const cid = s.cid.join("").trim();
  const [cidValido, setCidValido] = useState<boolean | null>(null);
  useEffect(() => {
    if (!procCompleto || cid.length < 3) { setCidValido(null); return; }
    let cancel = false;
    cidValidoParaProcedimento(codProc, cid, competencia).then((v) => { if (!cancel) setCidValido(v); });
    return () => { cancel = true; };
  }, [procCompleto, codProc, cid, competencia]);
  const cidInvalido = cidValido === false;

  const procNaoEncontradoMotivo = procNaoEncontrado ? "Código não encontrado na tabela oficial do SIGTAP." : undefined;
  const sexoMotivo = sexoInvalido
    ? `Este procedimento é exclusivo para pacientes do sexo ${proc!.sexo === "M" ? "Masculino" : "Feminino"}.`
    : undefined;
  const idadeMotivo = idadeInvalida
    ? `Idade do paciente na data do atendimento (${formatarMeses(idadeMeses!)}) fora da faixa permitida para este procedimento` +
      (proc!.idadeMinimaMeses !== 9999 || proc!.idadeMaximaMeses !== 9999
        ? ` (${proc!.idadeMinimaMeses === 9999 ? "sem mínimo" : formatarMeses(proc!.idadeMinimaMeses!)} a ${proc!.idadeMaximaMeses === 9999 ? "sem máximo" : formatarMeses(proc!.idadeMaximaMeses!)}).`
        : ".")
    : undefined;
  const qtdeMotivo = qtdeInvalida
    ? `Quantidade digitada (${qtde}) maior que o máximo permitido para este procedimento (${proc!.qtMaximaExecucao}).`
    : undefined;
  const servicoMotivo = servicoInvalido
    ? `Combinação Serviço ${servico} + Classificação ${classProc} não é válida para este procedimento.`
    : undefined;
  const cidMotivo = cidInvalido ? `CID ${cid} não é aceito para este procedimento.` : undefined;

  const motivos = [procNaoEncontradoMotivo, sexoMotivo, idadeMotivo, qtdeMotivo, servicoMotivo, cidMotivo].filter(
    (m): m is string => Boolean(m),
  );

  return {
    proc, procCompleto, procNaoEncontrado, sexoInvalido, idadeInvalida, qtdeInvalida, servicoInvalido, cidInvalido,
    procNaoEncontradoMotivo, sexoMotivo, idadeMotivo, qtdeMotivo, servicoMotivo, cidMotivo,
    motivos, temErro: motivos.length > 0,
  };
}
