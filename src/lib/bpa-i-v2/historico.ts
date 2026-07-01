import { supabase } from "@/lib/supabase";

export type TabelaHistorico = "procedimento" | "cbo";

const TABELA: Record<TabelaHistorico, string> = {
  procedimento: "historico_procedimentos",
  cbo: "historico_cbo",
};
const RPC: Record<TabelaHistorico, string> = {
  procedimento: "registrar_uso_procedimento",
  cbo: "registrar_uso_cbo",
};

export interface SugestaoHistorico {
  codigo: string;
  vezes_usado: number;
}

// Sugestões por prefixo, ordenadas por mais usado. Vazio se não configurado/erro.
export async function buscarHistorico(
  tabela: TabelaHistorico,
  prefixo: string,
): Promise<SugestaoHistorico[]> {
  if (!supabase || prefixo.length < 2) return [];
  try {
    const { data, error } = await supabase
      .from(TABELA[tabela])
      .select("codigo, vezes_usado")
      .like("codigo", `${prefixo}%`)
      .order("vezes_usado", { ascending: false })
      .limit(8);
    if (error || !data) return [];
    return data as SugestaoHistorico[];
  } catch {
    return [];
  }
}

// Incrementa o contador de uso de um código (via RPC SECURITY DEFINER). Silencioso.
export async function registrarUso(tabela: TabelaHistorico, codigo: string): Promise<void> {
  if (!supabase || !codigo) return;
  try {
    await supabase.rpc(RPC[tabela], { p_codigo: codigo });
  } catch {
    /* não bloqueia o export */
  }
}
