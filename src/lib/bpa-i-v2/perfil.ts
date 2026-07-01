import { supabase } from "@/lib/supabase";
import { type ConfigOrgao, configVazia, saveConfig } from "./config";

// Perfil do usuário, guardado no user_metadata do Supabase (sincroniza entre
// dispositivos). O CNS aqui é o mesmo usado na confirmação do Responsável (v2).
// A config do estabelecimento fica no metadata E espelhada no localStorage, pois
// o gerador do arquivo magnético lê via loadConfig() (síncrono).

export interface PerfilDados {
  nome: string;
  cns: string;
  cbo: string;
  telefone: string;
  competenciaPadrao: string; // "AAAAMM" ou ""
  config: ConfigOrgao;
}

export function perfilVazio(): PerfilDados {
  return { nome: "", cns: "", cbo: "", telefone: "", competenciaPadrao: "", config: configVazia() };
}

export function perfilDeMetadata(meta: Record<string, unknown> | undefined): PerfilDados {
  const m = meta ?? {};
  const cfg = (m.config as Partial<ConfigOrgao> | undefined) ?? {};
  return {
    nome: (m.nome as string) ?? "",
    cns: (m.cns as string) ?? "",
    cbo: (m.cbo as string) ?? "",
    telefone: (m.telefone as string) ?? "",
    competenciaPadrao: (m.competenciaPadrao as string) ?? "",
    config: { ...configVazia(), ...cfg },
  };
}

export interface ContaInfo {
  email: string | null;
  criadoEm: string | null;
  id: string | null;
}

export async function carregarPerfil(): Promise<{ perfil: PerfilDados; conta: ContaInfo }> {
  if (!supabase) return { perfil: perfilVazio(), conta: { email: null, criadoEm: null, id: null } };
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  const perfil = perfilDeMetadata(u?.user_metadata as Record<string, unknown> | undefined);
  saveConfig(perfil.config); // espelha p/ o gerador do .txt
  return {
    perfil,
    conta: { email: u?.email ?? null, criadoEm: u?.created_at ?? null, id: u?.id ?? null },
  };
}

export async function salvarPerfil(p: PerfilDados): Promise<{ ok: boolean; erro?: string }> {
  if (!supabase) return { ok: false, erro: "Supabase não configurado." };
  const { error } = await supabase.auth.updateUser({
    data: {
      nome: p.nome,
      cns: p.cns,
      cbo: p.cbo,
      telefone: p.telefone,
      competenciaPadrao: p.competenciaPadrao,
      config: p.config,
    },
  });
  if (error) return { ok: false, erro: error.message };
  saveConfig(p.config);
  return { ok: true };
}

export async function trocarSenha(novaSenha: string): Promise<{ ok: boolean; erro?: string }> {
  if (!supabase) return { ok: false, erro: "Supabase não configurado." };
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  return error ? { ok: false, erro: error.message } : { ok: true };
}
