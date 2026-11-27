// Modelos salvos do "Montar relatório" — guardados NA CONTA de quem criou (tabela
// `relatorio_modelos`, RLS: cada um só vê os seus), então aparecem em qualquer computador.
// Enquanto a tabela não existir no banco, cai no armazenamento do navegador (localStorage);
// quando ela passa a existir, os modelos do navegador são levados para a conta uma vez.
import { supabase } from "@/lib/supabase";
import type { DimColuna, DimLinha, Medida } from "./pivo";

export type DimFiltro = "unidade" | "profissional" | "procedimento" | "cid" | "carater" | "faixa";

export interface ExtrasModelo {
  unitario: boolean;
  valorTotal: boolean;
  pct: boolean;
  comparar: boolean;
  media: boolean;
}

export interface ConfigRelatorio {
  linhas: DimLinha;
  colunas: DimColuna;
  medida: Medida;
  tipos: string[]; // tipos LIGADOS (vazio = todos)
  filtros: Partial<Record<DimFiltro, string[]>>;
  extras: ExtrasModelo;
  periodo: { modo: "dinamico" } | { modo: "fixo"; de: string; ate: string };
}

export interface ModeloRelatorio {
  id: string;
  nome: string;
  config: ConfigRelatorio;
  compartilhado: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export const COMPARTILHAR_DISPONIVEL = false;

// ---------------- Navegador (reserva) ----------------
const chave = (userId: string | null | undefined) => `relatorio-modelos:${userId || "anon"}`;
function lerLocal(userId: string | null | undefined): ModeloRelatorio[] {
  try {
    const raw = localStorage.getItem(chave(userId));
    const arr = raw ? (JSON.parse(raw) as ModeloRelatorio[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function gravarLocal(userId: string | null | undefined, lista: ModeloRelatorio[]) {
  try {
    if (lista.length) localStorage.setItem(chave(userId), JSON.stringify(lista));
    else localStorage.removeItem(chave(userId));
  } catch {
    /* sem armazenamento */
  }
}

// ---------------- Banco ----------------
type Linha = {
  id: string;
  nome: string;
  config: ConfigRelatorio;
  compartilhado: boolean;
  criado_em: string;
  atualizado_em: string;
};
const COLS = "id, nome, config, compartilhado, criado_em, atualizado_em";
const deLinha = (l: Linha): ModeloRelatorio => ({
  id: l.id,
  nome: l.nome,
  config: l.config,
  compartilhado: l.compartilhado,
  criadoEm: l.criado_em,
  atualizadoEm: l.atualizado_em,
});
const tabela = () => supabase!.from("relatorio_modelos" as never);

let bancoDisponivel: boolean | null = null; // null = ainda não testado
async function usarBanco(): Promise<boolean> {
  if (!supabase) return false;
  if (bancoDisponivel !== null) return bancoDisponivel;
  const { error } = await tabela().select("id").limit(1);
  bancoDisponivel = !error;
  return bancoDisponivel;
}

// Leva os modelos que ficaram no navegador para a conta (uma vez).
async function migrarLocais(userId: string) {
  const locais = lerLocal(userId);
  if (locais.length === 0) return;
  const { error } = await tabela().insert(
    locais.map((m) => ({
      nome: m.nome,
      config: m.config,
      criado_em: m.criadoEm,
      atualizado_em: m.atualizadoEm,
    })) as never,
  );
  if (!error) gravarLocal(userId, []);
}

export async function listarModelos(userId: string | null | undefined): Promise<ModeloRelatorio[]> {
  if (userId && (await usarBanco())) {
    await migrarLocais(userId);
    const { data, error } = await tabela()
      .select(COLS)
      .order("atualizado_em", { ascending: false });
    if (!error) return ((data ?? []) as unknown as Linha[]).map(deLinha);
  }
  return lerLocal(userId).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
}

export async function salvarModelo(
  userId: string | null | undefined,
  nome: string,
  config: ConfigRelatorio,
): Promise<ModeloRelatorio> {
  const n = nome.trim() || "Modelo sem nome";
  if (userId && (await usarBanco())) {
    const { data, error } = await tabela()
      .insert({ nome: n, config } as never)
      .select(COLS)
      .single();
    if (error) throw new Error("Não foi possível salvar o modelo.");
    return deLinha(data as unknown as Linha);
  }
  const agora = new Date().toISOString();
  const m: ModeloRelatorio = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    nome: n,
    config,
    compartilhado: false,
    criadoEm: agora,
    atualizadoEm: agora,
  };
  gravarLocal(userId, [m, ...lerLocal(userId)]);
  return m;
}

export async function renomearModelo(
  userId: string | null | undefined,
  id: string,
  nome: string,
): Promise<void> {
  const n = nome.trim();
  if (!n) return;
  if (userId && (await usarBanco())) {
    const { error } = await tabela()
      .update({ nome: n, atualizado_em: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) throw new Error("Não foi possível renomear o modelo.");
    return;
  }
  gravarLocal(
    userId,
    lerLocal(userId).map((m) =>
      m.id === id ? { ...m, nome: n, atualizadoEm: new Date().toISOString() } : m,
    ),
  );
}

export async function excluirModelo(userId: string | null | undefined, id: string): Promise<void> {
  if (userId && (await usarBanco())) {
    const { error } = await tabela().delete().eq("id", id);
    if (error) throw new Error("Não foi possível excluir o modelo.");
    return;
  }
  gravarLocal(
    userId,
    lerLocal(userId).filter((m) => m.id !== id),
  );
}

export async function obterModelo(
  userId: string | null | undefined,
  id: string,
): Promise<ModeloRelatorio | null> {
  if (userId && (await usarBanco())) {
    const { data, error } = await tabela().select(COLS).eq("id", id).maybeSingle();
    if (!error) return data ? deLinha(data as unknown as Linha) : null;
  }
  return lerLocal(userId).find((m) => m.id === id) ?? null;
}

// Diz se os modelos já estão indo para a conta (o cartão mostra "na sua conta").
export async function modelosNaConta(): Promise<boolean> {
  return usarBanco();
}
