import { supabase } from "@/lib/supabase";

// Logo/timbre da organização do usuário (data URI base64 PNG), para o cabeçalho dos
// relatórios. Cache em memória: muda raramente (config de admin). null = não configurada.
let cache: string | null | undefined;

export async function carregarLogoOrg(): Promise<string | null> {
  if (cache !== undefined) return cache;
  if (!supabase) { cache = null; return null; }
  try {
    const { data, error } = await supabase.rpc("org_logo_do_usuario");
    cache = error ? null : ((data as string | null) ?? null);
  } catch {
    cache = null;
  }
  return cache;
}

export function limparCacheLogoOrg(): void {
  cache = undefined;
}

// Cor de destaque dos relatórios (hex "#RRGGBB") da organização do usuário. null = verde padrão.
let cacheCor: string | null | undefined;

export async function carregarCorOrg(): Promise<string | null> {
  if (cacheCor !== undefined) return cacheCor;
  if (!supabase) { cacheCor = null; return null; }
  try {
    const { data, error } = await supabase.rpc("org_cor_do_usuario");
    cacheCor = error ? null : ((data as string | null) ?? null);
  } catch {
    cacheCor = null;
  }
  return cacheCor;
}

export function limparCacheCorOrg(): void {
  cacheCor = undefined;
}
