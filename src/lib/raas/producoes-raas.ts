import { supabase } from "@/lib/supabase";

// Produção RAAS (.AAS) — histórico das gerações do arquivo .AAS por mês. SEPARADO do BPA e,
// por decisão de produto, "só registro": não congela fichas (ver migration producoes_raas).
// O backend (RPC security definer + RLS) é a fonte da verdade das regras; aqui só o wiring.

export interface ProducaoRaas {
  id: string;
  mes_producao: string;
  gerado_em: string | null;
  qtd_unidades: number;
  qtd_fichas: number;
  qtd_acoes: number;
}

// Produções RAAS visíveis ao usuário (RLS: sua organização), mais recentes primeiro.
export async function listarProducoesRaas(): Promise<ProducaoRaas[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("producoes_raas")
      .select("id, mes_producao, gerado_em, qtd_unidades, qtd_fichas, qtd_acoes")
      .order("mes_producao", { ascending: false })
      .limit(60);
    return error || !data ? [] : (data as ProducaoRaas[]);
  } catch {
    return [];
  }
}

// Registra (upsert) a geração do .AAS do mês. Deriva a organização do vínculo no banco.
// Lança em erro (mensagem do banco) p/ a tela decidir — mas o chamador trata como best-effort
// (não deve impedir o download do arquivo).
export async function registrarProducaoRaas(
  mes: string,
  qts: { unidades: number; fichas: number; acoes: number },
): Promise<void> {
  if (!supabase) throw new Error("Sem conexão.");
  const { error } = await supabase.rpc("registrar_producao_raas", {
    _mes: mes,
    _unidades: qts.unidades,
    _fichas: qts.fichas,
    _acoes: qts.acoes,
  });
  if (error) throw new Error(error.message);
}
