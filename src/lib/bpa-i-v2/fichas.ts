import { supabase, buscarTodasPaginado } from "@/lib/supabase";

// Persistência das fichas do BPA-I v2 no Supabase (tabela `fichas`, RLS dono-apenas).
// Tudo null-safe: sem config/login/erro, degrada p/ localStorage sem quebrar o form.

export interface FichaResumo {
  id: string;
  titulo: string;
  competencia: string | null;
  mes_producao: string | null;
  updated_at: string;
  tipo: "BPA-I" | "BPA-C";
  // Campos p/ o rótulo padronizado da lista (CNES · nome/CNS · comp · folha). Vêm de
  // subcampos do jsonb `dados`; profNome/profCns só existem no BPA-I.
  origem?: string | null;
  cnes?: string | null;
  profNome?: string | null;
  profCns?: string | null;
  // Ciclo de vida (Fase 3): congelada = produção do mês exportada/transmitida; substituída
  // = existe versão mais nova (retificação).
  congelada?: boolean;
  substituida?: boolean;
}

// Ficha com o `dados` completo — usada no Fechamento do mês e na dashboard p/ reconstruir
// as linhas. `mes_producao` = mês em que foi criada (agrupamento da produção).
export interface FichaCompleta {
  id: string;
  tipo: "BPA-I" | "BPA-C";
  mes_producao: string | null;
  dados: unknown;
}

// Mês de produção (AAAAMM) = mês local atual — carimbado no 1º save da ficha.
function mesProducaoAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface FichaMetadados {
  tipo?: "BPA-C" | "BPA-I";
  cnes?: string | null;
  profissionalCns?: string | null;
  profissionalNome?: string | null;
  // AUDITORIA (adoção): tela que salvou (ex.: 'v4'). NÃO entra no .MAR e nenhuma lógica
  // ramifica por ela. Só é gravada quando informada (V3 deixa undefined).
  origemUi?: string | null;
}

// Cria (id null) ou atualiza uma ficha. Retorna o id (ou null em falha).
export async function salvarFicha(
  id: string | null,
  titulo: string,
  competencia: string,
  dados: unknown,
  meta: FichaMetadados = {},
): Promise<string | null> {
  if (!supabase) return null;
  const payload = {
    titulo,
    competencia,
    dados,
    tipo: meta.tipo ?? "BPA-I",
    cnes: meta.cnes || null,
    profissional_cns: meta.profissionalCns || null,
    profissional_nome: meta.profissionalNome || null,
    // Só carimba quando informado (V3 = undefined → coluna não é tocada).
    ...(meta.origemUi !== undefined ? { origem_ui: meta.origemUi } : {}),
  };
  try {
    if (id) {
      // Update NÃO mexe em mes_producao: o mês de produção é fixado na criação da ficha.
      const { error } = await supabase
        .from("fichas")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", id);
      return error ? null : id;
    }
    const { data, error } = await supabase
      .from("fichas")
      .insert({ ...payload, mes_producao: mesProducaoAtual() })
      .select("id")
      .single();
    return error || !data ? null : (data as { id: string }).id;
  } catch {
    return null;
  }
}

// Renomeia uma ficha (só o título). Retorna true em sucesso.
export async function renomearFicha(id: string, titulo: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("fichas")
      .update({ titulo, updated_at: new Date().toISOString() })
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

// Lista as fichas do usuário. `tipo` opcional filtra por BPA-C/BPA-I (omitido = todas —
// mantém o comportamento atual de quem não passa o filtro).
export async function listarFichas(tipo?: "BPA-C" | "BPA-I"): Promise<FichaResumo[]> {
  if (!supabase) return [];
  try {
    // Pagina TODAS as fichas: antes havia um .limit(200) por updated_at desc, então uma
    // importação grande (ex.: complemento de junho, 369 fichas) empurrava os meses antigos
    // para fora da lista ("jan–maio sumiram"). A tela agrupa por mês no cliente, então
    // precisamos de todas. Ordena por updated_at desc como chave estável da paginação.
    const data = await buscarTodasPaginado<Record<string, unknown>>((de, ate) => {
      let req = supabase!
        .from("fichas")
        // Subcampos do jsonb `dados` (CNES/nome/CNS) alimentam o rótulo padronizado da lista.
        // São leves (não trazem o `dados` inteiro nem PII de paciente).
        .select("id, titulo, competencia, mes_producao, updated_at, tipo, origem, substituida_por, cnesArr:dados->cnes, profNomeV:dados->profNome, profCnsArr:dados->profCns, producoes(status)")
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(de, ate);
      if (tipo) req = req.eq("tipo", tipo);
      return req;
    });
    const juntar = (v: unknown) => (Array.isArray(v) ? v.join("") : "");
    return data.map((r) => {
      const prod = Array.isArray(r.producoes) ? r.producoes[0] : r.producoes;
      const st = (prod as { status?: string } | null | undefined)?.status;
      return {
        id: r.id as string,
        titulo: r.titulo as string,
        competencia: (r.competencia as string) ?? null,
        mes_producao: (r.mes_producao as string) ?? null,
        updated_at: r.updated_at as string,
        tipo: r.tipo as "BPA-I" | "BPA-C",
        origem: (r.origem as string) ?? null,
        cnes: juntar(r.cnesArr),
        // `dados->profNome` (seta `->`, igual a cnes/profCns) — o alias com `->>` retornava
        // vazio no PostgREST. Valor é uma string JSON; string vazia/ausente vira "".
        profNome: typeof r.profNomeV === "string" ? r.profNomeV : "",
        profCns: juntar(r.profCnsArr),
        congelada: st === "exportada" || st === "transmitida",
        substituida: Boolean(r.substituida_por),
      };
    });
  } catch {
    return [];
  }
}

// Todas as fichas de um MÊS DE PRODUÇÃO (mês em que foram criadas) + CNES, com o `dados`
// completo — base do Fechamento do mês (arquivo combinado 01+02+03) e da dashboard. A
// produção de um mês pode conter fichas de competências de atendimento diferentes (até 4
// meses de retroatividade); o agrupamento é por mês de produção, não por competência.
export async function fichasDoMes(mesProducao: string, cnes?: string): Promise<FichaCompleta[]> {
  if (!supabase) return [];
  try {
    // Pagina TODAS as fichas do mês: isto alimenta o Fechamento/exportação do .txt, então
    // truncar (havia .limit(500)) geraria arquivo INCOMPLETO para o SIA quando o mês passa
    // de 500/1.000 fichas. Ordena por id (estável) para a paginação.
    return await buscarTodasPaginado<FichaCompleta>((de, ate) => {
      let req = supabase!
        .from("fichas")
        .select("id, tipo, mes_producao, dados")
        .eq("mes_producao", mesProducao)
        .order("id", { ascending: true })
        .range(de, ate);
      if (cnes) req = req.eq("cnes", cnes);
      return req;
    });
  } catch {
    return [];
  }
}

export async function carregarFicha(id: string): Promise<{ dados: unknown; titulo: string } | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("fichas").select("dados, titulo").eq("id", id).maybeSingle();
    if (error || !data) return null;
    const d = data as { dados: unknown; titulo: string };
    return { dados: d.dados, titulo: d.titulo };
  } catch {
    return null;
  }
}

// Exclusão de ficha foi removida de propósito: produção nunca é apagada (doc de
// arquitetura, seção 8). Correção pós-export = reabrir produção ou nova versão.
