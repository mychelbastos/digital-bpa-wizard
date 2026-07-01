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
