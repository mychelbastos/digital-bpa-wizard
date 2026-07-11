// Descobre se um procedimento EXIGE Serviço/Classificação e/ou CID, com base na
// existência de linhas nas tabelas oficiais do SIGTAP (procedimento_servico /
// procedimento_cid). Se o procedimento tem combinações cadastradas, esses campos
// passam a ser obrigatórios; senão, não se aplicam. Usado só no BPA-I v3.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// true = a tabela tem ao menos uma linha p/ este procedimento (logo, exige o campo);
// false = não tem (não se aplica); null = não sabemos ainda (carregando/sem conexão) —
// nesse caso NÃO bloqueamos (fail-open), p/ não travar por causa de rede.
async function procedimentoTemLinhas(tabela: "procedimento_servico" | "procedimento_cid", procedimento: string): Promise<boolean | null> {
  if (!supabase || procedimento.length !== 10) return null;
  try {
    const { data, error } = await supabase.from(tabela).select("procedimento").eq("procedimento", procedimento).limit(1);
    if (error) return null;
    return Boolean(data && data.length > 0);
  } catch {
    return null;
  }
}

export const procedimentoExigeServico = (p: string) => procedimentoTemLinhas("procedimento_servico", p);
export const procedimentoExigeCid = (p: string) => procedimentoTemLinhas("procedimento_cid", p);

export interface ExigenciasSigtap {
  exigeServico: boolean | null;
  exigeCid: boolean | null;
}

// Hook: dado o código do procedimento (10 díg.), diz se Serviço/Classe e CID são
// exigidos. Enquanto null, o chamador não deve bloquear.
export function useExigenciasSigtap(codProc: string): ExigenciasSigtap {
  const completo = codProc.length === 10;
  const [exigeServico, setExigeServico] = useState<boolean | null>(null);
  const [exigeCid, setExigeCid] = useState<boolean | null>(null);
  useEffect(() => {
    if (!completo) {
      setExigeServico(null);
      setExigeCid(null);
      return;
    }
    let cancel = false;
    procedimentoExigeServico(codProc).then((v) => { if (!cancel) setExigeServico(v); });
    procedimentoExigeCid(codProc).then((v) => { if (!cancel) setExigeCid(v); });
    return () => { cancel = true; };
  }, [codProc, completo]);
  return { exigeServico, exigeCid };
}
