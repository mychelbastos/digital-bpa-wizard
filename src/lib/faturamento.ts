// "Movimento de faturamento" — o mês de APRESENTAÇÃO em que a produção digitada será
// lançada. É carimbado em `fichas.mes_producao` no 1º save da ficha. Espelha a "competência
// do movimento" do programa oficial do BPA Magnético (aquela barra que fica sempre visível):
// você abre um movimento (ex.: Ago/2026) e tudo que digita entra nele, inclusive folhas
// retroativas de meses anteriores.
//
// NÃO confundir com a competência da FOLHA (essa = realização, vem do cabeçalho da ficha —
// profMes/profAno no BPA-I, ano/mes no BPA-C). Ver memória competencia-realizacao-vs-faturamento.
import { useSyncExternalStore } from "react";

const CHAVE = "bpa-movimento-faturamento";
const EVENTO = "movimento-faturamento-mudou";

// Mês do calendário (AAAAMM) — o default quando nada foi escolhido.
export function competenciaCalendario(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Movimento atual (AAAAMM). Default = mês do calendário. Tolerante a storage indisponível.
export function movimentoFaturamento(): string {
  try {
    const v = localStorage.getItem(CHAVE);
    if (v && /^\d{6}$/.test(v)) return v;
  } catch { /* ignora */ }
  return competenciaCalendario();
}

// Troca o movimento atual (persiste + avisa a UI). Ignora valor fora do formato AAAAMM.
export function setMovimentoFaturamento(m: string): void {
  if (!/^\d{6}$/.test(m)) return;
  try { localStorage.setItem(CHAVE, m); } catch { /* ignora */ }
  try { window.dispatchEvent(new Event(EVENTO)); } catch { /* ignora */ }
}

// Hook reativo: reflete a troca do movimento em qualquer lugar (mesmo em outra aba).
export function useMovimentoFaturamento(): [string, (m: string) => void] {
  const mov = useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENTO, cb);
      window.addEventListener("storage", cb);
      return () => { window.removeEventListener(EVENTO, cb); window.removeEventListener("storage", cb); };
    },
    () => movimentoFaturamento(),
    () => competenciaCalendario(),
  );
  return [mov, setMovimentoFaturamento];
}

// AAAAMM -> "Ago/2026". Rótulo curto para os seletores.
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export function rotuloMovimento(m: string): string {
  if (!/^\d{6}$/.test(m)) return m;
  return `${MESES_ABREV[Number(m.slice(4, 6)) - 1] ?? m.slice(4, 6)}/${m.slice(0, 4)}`;
}

// Opções de movimento em torno de agora: `antes` meses para trás + o mês atual + `depois`
// meses à frente (mais recente primeiro). Inclui sempre o valor atual selecionado, mesmo
// que caia fora da janela (ex.: um movimento antigo reaberto).
export function opcoesMovimento(atual: string, antes = 14, depois = 1): string[] {
  const base = competenciaCalendario();
  const y = Number(base.slice(0, 4)), mo = Number(base.slice(4, 6));
  const set = new Set<string>();
  for (let i = depois; i >= -antes; i--) {
    const d = new Date(y, mo - 1 + i, 1);
    set.add(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  if (/^\d{6}$/.test(atual)) set.add(atual);
  return [...set].sort((a, b) => b.localeCompare(a));
}
