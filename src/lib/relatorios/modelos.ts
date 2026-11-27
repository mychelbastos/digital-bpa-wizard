// Modelos salvos do "Montar relatório". VERSÃO INICIAL: localStorage (por usuário, neste
// navegador). A interface (salvar/listar/renomear/excluir) já é a definitiva: quando a tabela
// `relatorio_modelos` for aprovada, só ESTE arquivo muda (e o "Compartilhar" é liberado).
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

export const COMPARTILHAR_DISPONIVEL = false; // vira true quando os modelos forem para o banco

const chave = (userId: string | null | undefined) => `relatorio-modelos:${userId || "anon"}`;

function ler(userId: string | null | undefined): ModeloRelatorio[] {
  try {
    const raw = localStorage.getItem(chave(userId));
    const arr = raw ? (JSON.parse(raw) as ModeloRelatorio[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function gravar(userId: string | null | undefined, lista: ModeloRelatorio[]) {
  try {
    localStorage.setItem(chave(userId), JSON.stringify(lista));
  } catch {
    /* sem armazenamento */
  }
}

export async function listarModelos(userId: string | null | undefined): Promise<ModeloRelatorio[]> {
  return ler(userId).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
}

export async function salvarModelo(
  userId: string | null | undefined,
  nome: string,
  config: ConfigRelatorio,
): Promise<ModeloRelatorio> {
  const agora = new Date().toISOString();
  const m: ModeloRelatorio = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    nome: nome.trim() || "Modelo sem nome",
    config,
    compartilhado: false,
    criadoEm: agora,
    atualizadoEm: agora,
  };
  gravar(userId, [m, ...ler(userId)]);
  return m;
}

export async function renomearModelo(
  userId: string | null | undefined,
  id: string,
  nome: string,
): Promise<void> {
  gravar(
    userId,
    ler(userId).map((m) =>
      m.id === id
        ? { ...m, nome: nome.trim() || m.nome, atualizadoEm: new Date().toISOString() }
        : m,
    ),
  );
}

export async function excluirModelo(userId: string | null | undefined, id: string): Promise<void> {
  gravar(
    userId,
    ler(userId).filter((m) => m.id !== id),
  );
}

export async function obterModelo(
  userId: string | null | undefined,
  id: string,
): Promise<ModeloRelatorio | null> {
  return ler(userId).find((m) => m.id === id) ?? null;
}
