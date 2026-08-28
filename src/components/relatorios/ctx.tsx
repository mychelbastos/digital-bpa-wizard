import { createContext, useContext } from "react";

// Contexto da Central de Relatórios: os FILTROS-BASE (período + unidade) e os dados
// compartilhados (unidades, timbre, cor) ficam no layout `/relatorios` e são consumidos pelas
// páginas dos relatórios. Assim o período/unidade PERSISTE ao navegar entre relatórios.
export interface RelatoriosCtxValue {
  compDe: string;
  compAte: string;
  setCompDe: (s: string) => void;
  setCompAte: (s: string) => void;
  cnesSel: Set<string>;
  setCnesSel: (s: Set<string>) => void;
  cnesOpcoes: { cnes: string; nome: string }[];
  logo: string | null;
  cor: string | null;
  podeTfd: boolean;
  nomeUsuario: string | null;
  periodoLabel: string;
  periodoArq: string;
  nomeUnidade: (c: string) => string;
}

export const RelatoriosCtx = createContext<RelatoriosCtxValue | null>(null);

export function useRelatoriosCtx(): RelatoriosCtxValue {
  const v = useContext(RelatoriosCtx);
  if (!v) throw new Error("useRelatoriosCtx deve ser usado dentro do layout /relatorios");
  return v;
}
