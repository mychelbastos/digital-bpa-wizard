import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// Login mínimo (Supabase Auth, e-mail+senha) só para o BPA-I v2: viabiliza a
// "confirmação eletrônica do Responsável". O perfil guarda nome + CNS (em
// user_metadata) — o CNS é usado para validar o vínculo no CNES (Fase C).
export interface AuthUser {
  id: string;
  email: string | null;
  nome: string;
  cns: string;
}

function toAuthUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null;
  const m = (u.user_metadata ?? {}) as { nome?: string; cns?: string };
  return { id: u.id, email: u.email ?? null, nome: m.nome ?? u.email ?? "", cns: m.cns ?? "" };
}

// --- Rascunhos locais dos formulários (localStorage) ---
// Os formulários guardam o preenchimento em localStorage. Como isso é por NAVEGADOR (não por
// usuário), ao trocar de conta no mesmo navegador o novo usuário via o rascunho do anterior.
// Solução: quando o dono da sessão muda, apagamos os rascunhos. NÃO apagamos a calibração dos
// campos (chaves "*-rects"), que é do sistema e não contém dado de ninguém.
const DRAFT_OWNER_KEY = "bpa:draft-owner";
const OVERLAY_DRAFT_KEYS = ["apac"]; // chaves de CONTEÚDO dos forms overlay (sem "-rects")

export function limparRascunhosLocais(): void {
  try {
    const remover: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (/-state-v\d+$/.test(k) || OVERLAY_DRAFT_KEYS.includes(k)) remover.push(k);
    }
    remover.forEach((k) => localStorage.removeItem(k));
  } catch { /* ambiente sem localStorage */ }
}

// Se o dono da sessão mudou (login de outra conta, ou logout), limpa os rascunhos locais.
function sincronizarDonoRascunhos(userId: string | null): void {
  try {
    const atual = localStorage.getItem(DRAFT_OWNER_KEY);
    const novo = userId ?? "";
    if (atual === novo) return;
    limparRascunhosLocais();
    if (userId) localStorage.setItem(DRAFT_OWNER_KEY, userId);
    else localStorage.removeItem(DRAFT_OWNER_KEY);
  } catch { /* ambiente sem localStorage */ }
}

function traduzErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "E-mail ainda não confirmado.";
  return msg;
}

export async function signIn(email: string, password: string): Promise<{ ok: boolean; erro?: string }> {
  if (!supabase) return { ok: false, erro: "Login indisponível (Supabase não configurado)." };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { ok: false, erro: traduzErro(error.message) } : { ok: true };
}

export async function signOut(): Promise<void> {
  limparRascunhosLocais(); // não deixa rascunho para o próximo usuário do navegador
  await supabase?.auth.signOut();
}

// Hook: usuário autenticado atual (null se deslogado). Reage a login/logout.
export function useAuthUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      sincronizarDonoRascunhos(data.session?.user?.id ?? null);
      setUser(toAuthUser(data.session?.user));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      sincronizarDonoRascunhos(session?.user?.id ?? null);
      setUser(toAuthUser(session?.user));
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return user;
}

// Estado de auth com "loading" — p/ o guard não piscar a tela de login antes de a
// sessão resolver. Se o Supabase não estiver configurado, encerra o loading (user null).
export function useAuthState(): { user: AuthUser | null; loading: boolean } {
  const [s, setS] = useState<{ user: AuthUser | null; loading: boolean }>({ user: null, loading: true });
  useEffect(() => {
    if (!supabase) { setS({ user: null, loading: false }); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      sincronizarDonoRascunhos(data.session?.user?.id ?? null); // limpa antes de renderizar as rotas
      if (alive) setS({ user: toAuthUser(data.session?.user), loading: false });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      sincronizarDonoRascunhos(session?.user?.id ?? null);
      setS({ user: toAuthUser(session?.user), loading: false });
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);
  return s;
}
