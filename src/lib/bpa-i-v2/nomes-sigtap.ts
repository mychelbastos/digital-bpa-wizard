import { supabase } from "@/lib/supabase";

// Nome do Serviço + Classificação (tabelas oficiais do SIGTAP). null = não configurado,
// não encontrado, ou incompleto — nunca lança (só alimenta um popover informativo).
export async function buscarNomeServicoClasse(servico: string, classificacao: string): Promise<string | null> {
  if (!supabase || servico.length !== 3 || classificacao.length !== 3) return null;
  try {
    const [{ data: srv }, { data: cls }] = await Promise.all([
      supabase.from("servicos_sigtap").select("nome").eq("codigo", servico).maybeSingle(),
      supabase.from("servico_classificacao_sigtap").select("nome").eq("servico", servico).eq("classificacao", classificacao).maybeSingle(),
    ]);
    const nomeSrv = (srv as { nome: string } | null)?.nome;
    const nomeCls = (cls as { nome: string } | null)?.nome;
    if (!nomeSrv && !nomeCls) return null;
    if (nomeSrv && nomeCls) return `${nomeSrv} — ${nomeCls}`;
    return nomeSrv ?? nomeCls ?? null;
  } catch {
    return null;
  }
}

// Nome/descrição de um CID — só retorna algo se o código existir na tabela oficial
// do SIGTAP que importamos (mesma competência usada p/ validar o Código do Procedimento).
export async function buscarNomeCid(cid: string): Promise<string | null> {
  if (!supabase || cid.length < 3) return null;
  try {
    const { data } = await supabase.from("cid_sigtap").select("nome").eq("codigo", cid).maybeSingle();
    return (data as { nome: string } | null)?.nome ?? null;
  } catch {
    return null;
  }
}
