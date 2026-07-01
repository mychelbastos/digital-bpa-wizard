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
  await supabase?.auth.signOut();
}

// Hook: usuário autenticado atual (null se deslogado). Reage a login/logout.
export function useAuthUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUser(toAuthUser(data.session?.user)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(toAuthUser(session?.user)));
    return () => sub.subscription.unsubscribe();
  }, []);
  return user;
}
