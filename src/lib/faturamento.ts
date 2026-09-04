// "Movimento de faturamento" — o mês de APRESENTAÇÃO em que a produção digitada será
// lançada (carimbado em `fichas.mes_producao` no 1º save). Espelha a "competência do
// movimento" do programa oficial do BPA Magnético.
//
// COMPARTILHADO pela equipe: o valor mora na organização (RPC `movimento_faturamento_atual`),
// e SÓ o faturista (quem tem `gerar_producao`) ou super-admin altera (RPC
// `definir_movimento_faturamento`, que também barra no banco). Assim uma pessoa rege todos.
//
// NÃO confundir com a competência da FOLHA (essa = realização, no cabeçalho da ficha).
// Ver memória competencia-realizacao-vs-faturamento.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cnesComPermissao, souSuperAdmin } from "@/lib/permissoes";

const CHAVE = "bpa-movimento-faturamento"; // espelho local (bootstrap síncrono do save)
const EVENTO = "movimento-faturamento-mudou";

// Cache de módulo: o valor JÁ resolvido da org (compartilhado). Hidratado pela sidebar no load.
let _cache: string | null = null;

// Mês do calendário (AAAAMM) — fallback quando a org ainda não definiu.
export function competenciaCalendario(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Leitura SÍNCRONA (usada no save da ficha): cache -> espelho local -> calendário.
export function movimentoFaturamento(): string {
  if (_cache && /^\d{6}$/.test(_cache)) return _cache;
  try {
    const v = localStorage.getItem(CHAVE);
    if (v && /^\d{6}$/.test(v)) return v;
  } catch { /* ignora */ }
  return competenciaCalendario();
}

// Competência PADRÃO para QUALQUER formulário/tela que trabalhe com faturamento e competência
// (BPA-I/C, TFD, RAAS, importação, dashboard, relatórios): o MOVIMENTO DE FATURAMENTO EM ABERTO,
// não o mês do calendário. Ex.: se o movimento aberto é 08/2026, tudo entra por padrão em 08/2026
// mesmo que hoje seja setembro. Cai no mês do calendário se a org não definiu movimento. É só o
// PADRÃO — o usuário pode alterar (produção retroativa). Fonte única para não divergir por tela.
export function competenciaPadrao(): string {
  return movimentoFaturamento();
}

// Mesma competência padrão, já quebrada em dígitos [M,M] e [A,A,A,A] — para os cabeçalhos do
// BPA que guardam mês/ano como arrays de char.
export function competenciaPadraoMesAno(): { mes: string[]; ano: string[] } {
  const m = movimentoFaturamento();
  return { mes: m.slice(4, 6).split(""), ano: m.slice(0, 4).split("") };
}

function guardarEspelho(m: string) {
  _cache = m;
  try { localStorage.setItem(CHAVE, m); } catch { /* ignora */ }
  try { window.dispatchEvent(new Event(EVENTO)); } catch { /* ignora */ }
}

// Hidrata do servidor (valor compartilhado da org). null no servidor => mês do calendário.
export async function carregarMovimento(): Promise<string> {
  if (!supabase) return movimentoFaturamento();
  try {
    const { data, error } = await supabase.rpc("movimento_faturamento_atual");
    const v = !error && typeof data === "string" && /^\d{6}$/.test(data) ? data : competenciaCalendario();
    guardarEspelho(v);
    return v;
  } catch {
    return movimentoFaturamento();
  }
}

// Grava no servidor (o banco barra quem não é faturista/admin). Retorna true em sucesso.
export async function definirMovimento(m: string): Promise<boolean> {
  if (!/^\d{6}$/.test(m) || !supabase) return false;
  try {
    const { data, error } = await supabase.rpc("definir_movimento_faturamento", { _mes: m });
    if (error) return false;
    guardarEspelho(typeof data === "string" && /^\d{6}$/.test(data) ? data : m);
    return true;
  } catch {
    return false;
  }
}

// AAAAMM -> "Ago/2026".
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export function rotuloMovimento(m: string): string {
  if (!/^\d{6}$/.test(m)) return m;
  return `${MESES_ABREV[Number(m.slice(4, 6)) - 1] ?? m.slice(4, 6)}/${m.slice(0, 4)}`;
}

// Opções do movimento (mais recente primeiro). Regra: mês ATUAL + os `antes` meses anteriores
// (default 5 → 6 no total) e NENHUM mês futuro (`depois=0`) — lista curta reduz erro. Inclui
// sempre o valor `atual` selecionado (mesmo fora da janela), para não "sumir" o que está em uso.
export function opcoesMovimento(atual: string, antes = 5, depois = 0): string[] {
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

// Hook: valor compartilhado + se o usuário PODE editar (é faturista/admin) + ação de gravar.
export function useMovimentoFaturamento() {
  const [movimento, setMovimento] = useState<string>(() => movimentoFaturamento());
  const [podeEditar, setPodeEditar] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    carregarMovimento()
      .then((v) => { if (vivo) setMovimento(v); })
      .finally(() => { if (vivo) setCarregando(false); });
    Promise.all([cnesComPermissao("gerar_producao"), souSuperAdmin()])
      .then(([cnes, sa]) => { if (vivo) setPodeEditar(sa || cnes.length > 0); })
      .catch(() => { /* sem permissão de edição por padrão */ });
    const onEvt = () => { if (vivo) setMovimento(movimentoFaturamento()); };
    window.addEventListener(EVENTO, onEvt);
    window.addEventListener("storage", onEvt);
    return () => { vivo = false; window.removeEventListener(EVENTO, onEvt); window.removeEventListener("storage", onEvt); };
  }, []);

  // Grava no servidor; só atualiza a UI em caso de sucesso (senão o <select> reverte sozinho).
  const definir = async (m: string): Promise<boolean> => {
    const ok = await definirMovimento(m);
    if (ok) setMovimento(m);
    return ok;
  };

  return { movimento, podeEditar, carregando, definir };
}
