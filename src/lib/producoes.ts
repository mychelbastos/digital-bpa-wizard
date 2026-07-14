import { supabase } from "@/lib/supabase";

// Produção como entidade + ciclo de vida (Fase 3). Fonte da verdade das regras é o banco
// (RPCs security definer + triggers); aqui só o wiring cliente. Tudo null-safe.

export interface Producao {
  id: string;
  mes_producao: string;
  status: "aberta" | "exportada" | "transmitida";
  gerado_em: string | null;
  arquivo_nome: string | null;
}

export interface ResultadoExport {
  producao_id: string;
  fichas_congeladas: number;
  mes: string;
}

// Fecha a produção do mês (cria/obtém a produção, liga as fichas vigentes do mês e marca
// 'exportada' numa transação no banco). A partir daí as fichas ficam congeladas.
// Lança em erro (com a mensagem do banco) p/ a tela tratar.
export async function exportarProducao(mes: string, arquivoNome: string): Promise<ResultadoExport> {
  if (!supabase) throw new Error("Sem conexão.");
  const { data, error } = await supabase.rpc("exportar_producao", {
    _mes: mes,
    _arquivo_nome: arquivoNome,
  });
  if (error) throw new Error(error.message);
  return data as ResultadoExport;
}

// Reabre uma produção exportada (volta a 'aberta', descongela as fichas). Motivo obrigatório.
export async function reabrirProducao(producaoId: string, motivo: string): Promise<void> {
  if (!supabase) throw new Error("Sem conexão.");
  const { error } = await supabase.rpc("reabrir_producao", {
    _producao_id: producaoId,
    _motivo: motivo,
  });
  if (error) throw new Error(error.message);
}

// Retifica uma ficha (exportada): cria uma nova versão na produção corrente e marca a
// original como substituída. Retorna o id da nova versão (p/ abrir e editar).
export async function retificarFicha(fichaId: string): Promise<string> {
  if (!supabase) throw new Error("Sem conexão.");
  const { data, error } = await supabase.rpc("retificar_ficha", { _ficha_id: fichaId });
  if (error) throw new Error(error.message);
  return data as string;
}

// Produções visíveis ao usuário (RLS: sua organização), mais recentes primeiro.
export async function listarProducoes(): Promise<Producao[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("producoes")
      .select("id, mes_producao, status, gerado_em, arquivo_nome")
      .order("mes_producao", { ascending: false })
      .limit(60);
    return error || !data ? [] : (data as Producao[]);
  } catch {
    return [];
  }
}

export interface FichaStatus {
  congelada: boolean;
  substituida_por: string | null;
  numero_versao: number;
}

// Situação de ciclo de vida de uma ficha: congelada (produção exportada/transmitida) e/ou
// já substituída por uma versão mais nova. Null se não deu p/ consultar.
export async function statusDaFicha(id: string): Promise<FichaStatus | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("fichas")
      .select("substituida_por, numero_versao, producoes(status)")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as {
      substituida_por: string | null;
      numero_versao: number;
      producoes: { status: string } | { status: string }[] | null;
    };
    const prod = Array.isArray(row.producoes) ? row.producoes[0] : row.producoes;
    const st = prod?.status;
    return {
      congelada: st === "exportada" || st === "transmitida",
      substituida_por: row.substituida_por,
      numero_versao: row.numero_versao ?? 1,
    };
  } catch {
    return null;
  }
}
