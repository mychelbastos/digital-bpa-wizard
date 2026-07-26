import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Client Supabase do BPA v2. Lê de variáveis de ambiente (.env), nunca hardcoded.
// É null-safe: se o .env não estiver configurado, o app continua funcionando
// (os campos inteligentes que dependem do banco simplesmente ficam inativos).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url as string, anonKey as string, {
      // Sessão persistida (login do Responsável sobrevive ao reload); sem magic-link na URL.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

// Busca TODAS as linhas de uma consulta, contornando o teto de linhas do PostgREST
// (o Supabase corta em 1.000 por resposta, mesmo com .limit() maior). Recebe uma função
// que monta a query para o intervalo [de, ate] (via .range) e itera páginas até esgotar.
// IMPORTANTE: a query montada DEVE ter um .order() estável, senão a paginação pode
// repetir/pular linhas entre as páginas. Nunca lança: em erro, devolve o que já juntou.
export async function buscarTodasPaginado<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  tamanhoPagina = 1000,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += tamanhoPagina) {
    const { data, error } = await montar(de, de + tamanhoPagina - 1);
    if (error || !data) break;
    todas.push(...data);
    if (data.length < tamanhoPagina) break;
  }
  return todas;
}
