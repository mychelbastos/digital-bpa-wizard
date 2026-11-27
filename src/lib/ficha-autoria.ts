// Autoria da ficha (quem criou / quem editou por último) — SÓ VISUALIZAÇÃO no SPA.
// Não entra em exportação, impressão nem PDF. Fonte: RPC ficha_autoria (respeita quem pode
// ver a ficha). O último editor é gravado pelo banco (trigger) quando dados/título mudam.
import { supabase } from "@/lib/supabase";

export interface AutoriaFicha {
  criado_por: string | null;
  criado_em: string | null;
  editado_por: string | null;
  editado_em: string | null;
}

// Disparado após salvar uma ficha, para a linha de autoria se atualizar na hora.
export const EVENTO_FICHA_SALVA = "spa:ficha-salva";
export function avisarFichaSalva(id: string) {
  try { window.dispatchEvent(new CustomEvent(EVENTO_FICHA_SALVA, { detail: id })); } catch { /* noop */ }
}

export async function buscarAutoriaFicha(id: string): Promise<AutoriaFicha | null> {
  if (!supabase || !id) return null;
  try {
    const { data, error } = await supabase.rpc("ficha_autoria" as never, { _ficha_id: id } as never);
    const row = Array.isArray(data) ? (data[0] as AutoriaFicha | undefined) : undefined;
    return error || !row ? null : row;
  } catch {
    return null;
  }
}

export const dataHoraBr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
