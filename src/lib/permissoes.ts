import { supabase } from "@/lib/supabase";

// CNES em que o usuário atual tem a permissão indicada (via RPC no banco — fonte única
// da regra de autorização). Ex.: cnesComPermissao("gerar_producao"). Nunca lança.
export async function cnesComPermissao(perm: string): Promise<string[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc("cnes_com_permissao", { _perm: perm });
    if (error || !data) return [];
    return (data as { cnes: string }[]).map((r) => r.cnes);
  } catch {
    return [];
  }
}

// Vê a página de Administração? (super-admin global OU gerenciar_vinculos em alguma unidade).
export async function souAdmin(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc("sou_admin");
    return !error && data === true;
  } catch {
    return false;
  }
}

// É super-admin do sistema (operador que administra todas as prefeituras)?
export async function souSuperAdmin(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc("is_super_admin");
    return !error && data === true;
  } catch {
    return false;
  }
}

// ---- Permissões efetivas do usuário (menu/relatórios) ----
// Cache em módulo: a lista muda raramente na sessão; recarrega sob demanda (limpar cache).
import { useEffect, useState } from "react";

let _cachePerms: Set<string> | null = null;
let _promise: Promise<Set<string>> | null = null;

export async function carregarMinhasPermissoes(force = false): Promise<Set<string>> {
  if (_cachePerms && !force) return _cachePerms;
  if (_promise && !force) return _promise;
  _promise = (async () => {
    if (!supabase) return new Set<string>();
    try {
      const { data, error } = await supabase.rpc("minhas_permissoes");
      const set = new Set<string>(error || !data ? [] : (data as string[]));
      _cachePerms = set;
      return set;
    } catch {
      return new Set<string>();
    } finally {
      _promise = null;
    }
  })();
  return _promise;
}

export function limparCachePermissoes(): void { _cachePerms = null; }

// Hook: carrega uma vez (usa o cache do módulo). Enquanto carrega, `pode()` devolve true
// (não pisca cadeados; a política padrão é "tudo liberado"). Depois de carregar, aplica a regra.
export function usePermissoes() {
  const [perms, setPerms] = useState<Set<string> | null>(_cachePerms);
  useEffect(() => {
    let vivo = true;
    carregarMinhasPermissoes().then((p) => { if (vivo) setPerms(new Set(p)); });
    return () => { vivo = false; };
  }, []);
  const carregando = perms === null;
  const pode = (codigo: string) => (perms === null ? true : perms.has(codigo));
  return { perms, carregando, pode };
}
