import { useEffect, useState } from "react";
import type { SeqData } from "@/lib/bpai-v2-layout";
import { idadeEmMeses } from "@/lib/bpa-i-v2/validacao";
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
}

// Cruza TUDO que a sequência preenche (procedimento, quantidade, idade, sexo, serviço,
// classificação, CID) contra a tabela oficial do SIGTAP — uma única busca do
// procedimento por sequência, compartilhada entre todas as checagens derivadas.
// Não bloqueia nada; só calcula os sinais visuais (bordas) que a UI decide mostrar.
export function useValidacaoProcedimento(s: SeqData): ValidacaoProcedimento {
  const codProc = s.codProc.join("");
  const procCompleto = codProc.length === 10;

  const [proc, setProc] = useState<ProcedimentoSigtap | null>(null);
  useEffect(() => {
    if (!procCompleto) { setProc(null); return; }
    let cancel = false;
    buscarProcedimentoSigtap(codProc).then((p) => { if (!cancel) setProc(p); });
    return () => { cancel = true; };
  }, [codProc, procCompleto]);

  const procNaoEncontrado = procCompleto && proc === null;

  const qtde = Number(s.qtde.join("")) || 0;
  const idadeMeses = idadeEmMeses(s.dataNasc, s.dataAtend);

  const sexoInvalido = Boolean(proc) && sexoIncompativel(proc!.sexo, s.sexo);
  const idadeInvalida = Boolean(proc) && idadeForaDaFaixa(proc!.idadeMinimaMeses, proc!.idadeMaximaMeses, idadeMeses);
  const qtdeInvalida = Boolean(proc) && quantidadeExcedida(proc!.qtMaximaExecucao, qtde);

  const servico = s.servico.join("");
  const classProc = s.classProc.join("");
  const [servicoValido, setServicoValido] = useState<boolean | null>(null);
  useEffect(() => {
    if (!procCompleto || servico.length !== 3 || classProc.length !== 3) { setServicoValido(null); return; }
    let cancel = false;
    servicoClassificacaoValida(codProc, servico, classProc).then((v) => { if (!cancel) setServicoValido(v); });
    return () => { cancel = true; };
  }, [procCompleto, codProc, servico, classProc]);
  const servicoInvalido = servicoValido === false;

  const cid = s.cid.join("").trim();
  const [cidValido, setCidValido] = useState<boolean | null>(null);
  useEffect(() => {
    if (!procCompleto || cid.length < 3) { setCidValido(null); return; }
    let cancel = false;
    cidValidoParaProcedimento(codProc, cid).then((v) => { if (!cancel) setCidValido(v); });
    return () => { cancel = true; };
  }, [procCompleto, codProc, cid]);
  const cidInvalido = cidValido === false;

  return { proc, procCompleto, procNaoEncontrado, sexoInvalido, idadeInvalida, qtdeInvalida, servicoInvalido, cidInvalido };
}
