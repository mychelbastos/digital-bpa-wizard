import { supabase } from "@/lib/supabase";
import { buscarCbosVinculo } from "./profissionais";
import type { AuthUser } from "./auth";

// Confirmação eletrônica do Responsável pelo Estabelecimento (BPA-I v2).
// Em vez de imagem de assinatura, registramos: login + ação explícita + auditoria.

export interface Confirmacao {
  nome: string;
  cns: string;
  em: string; // ISO timestamp
  validado: boolean; // passou na validação do CNES?
}

// Valida o Responsável: a pessoa (CNS) tem vínculo ATIVO no CNES do formulário?
// Reusa a integração de vínculos do CNES (≥1 vínculo/CBO ali = ativa no estabelecimento).
// HOMOLOGAÇÃO: a base pode estar incompleta/instável e a API pode falhar — nesse caso
// retorna false e a UI oferece "confirmar mesmo assim" (fallback gracioso).
// Em PRODUÇÃO (após credenciamento) essa validação tende a ficar precisa/estável.
export async function validarResponsavelNoCnes(cns: string, cnes: string): Promise<boolean> {
  if (!/^[0-9]{15}$/.test(cns) || !/^[0-9]{7}$/.test(cnes)) return false;
  try {
    const cbos = await buscarCbosVinculo(cns, cnes);
    return cbos.length > 0;
  } catch {
    return false;
  }
}

async function hashFicha(obj: unknown): Promise<string> {
  try {
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

// Grava o registro de auditoria (imutável) no Supabase. Best-effort: se falhar (rede),
// não bloqueia a confirmação visual — a pessoa já agiu de forma explícita e autenticada.
export async function registrarConfirmacao(args: {
  user: AuthUser;
  cnes: string;
  validado: boolean;
  snapshot: unknown;
}): Promise<{ ok: boolean; em: string }> {
  const em = new Date().toISOString();
  if (!supabase) return { ok: false, em };
  try {
    const ficha_hash = await hashFicha(args.snapshot);
    const { error } = await supabase.from("confirmacoes_responsavel").insert({
      user_id: args.user.id,
      nome: args.user.nome,
      cns: args.user.cns || null,
      cnes: args.cnes || null,
      validado_cnes: args.validado,
      confirmado_em: em,
      ficha_hash,
      ficha_snapshot: args.snapshot as object,
    });
    return { ok: !error, em };
  } catch {
    return { ok: false, em };
  }
}

// "Confirmado eletronicamente em DD/MM/AAAA HH:MM"
export function formatarConfirmadoEm(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
