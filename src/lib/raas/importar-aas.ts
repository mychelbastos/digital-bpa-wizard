// Gravação das fichas RAAS importadas de um arquivo .AAS. Insere em `fichas` com tipo='RAAS',
// origem='importado' e mes_producao = competência de apresentação (mesmo padrão do BPA
// Magnético — ver importar-magnetico.ts). O `dados` é o RaasState completo, igual ao que a
// tela /raas grava, para que a folha oficial (/raas-folha) e o futuro gerador .AAS reusem.
import { supabase } from "@/lib/supabase";
import { totalAcoes, type RaasState } from "@/lib/raas/raas-layout";

export interface ResumoGravacaoRaas {
  fichas: number;
  acoes: number;
  // Unidades cujas fichas não puderam ser gravadas (ex.: sem permissão criar_ficha no CNES).
  // A gravação é feita por unidade, então um bloqueio numa unidade não impede as demais.
  bloqueadas: { cnes: string; fichas: number; motivo: string }[];
  erro: string | null;
}

// Traduz o erro do banco num motivo curto para o usuário.
function motivoErro(msg: string): string {
  return /row-level security|permission|policy/i.test(msg)
    ? "sem permissão (criar_ficha) neste CNES"
    : msg;
}

const compLabel = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : c);

function tituloRaas(f: RaasState): string {
  const nome = (f.nomePaciente || "").trim() || "Paciente sem nome";
  return `RAAS · ${nome} · ${compLabel(f.competencia)}`;
}

// Grava as fichas RAAS. `mesProducao` (AAAAMM) = mês de apresentação (agrupa na dashboard/FPO).
// Grava POR UNIDADE (CNES): a RLS exige criar_ficha em cada CNES, e o insert é atômico — então
// uma unidade sem permissão (ex.: folha isolada de outra unidade no mesmo arquivo) não deve
// impedir a importação das demais. Cada unidade é inserida em lotes de 100.
export async function gravarRaas(fichas: RaasState[], mesProducao: string): Promise<ResumoGravacaoRaas> {
  if (!supabase) return { fichas: 0, acoes: 0, bloqueadas: [], erro: "Sem conexão com o banco." };
  if (fichas.length === 0) return { fichas: 0, acoes: 0, bloqueadas: [], erro: "Nada para gravar." };

  // Agrupa por CNES.
  const porCnes = new Map<string, RaasState[]>();
  for (const f of fichas) {
    const c = f.cnes || "";
    (porCnes.get(c) ?? porCnes.set(c, []).get(c)!).push(f);
  }

  let ok = 0;
  let acoes = 0;
  const bloqueadas: { cnes: string; fichas: number; motivo: string }[] = [];

  for (const [cnes, grupo] of porCnes) {
    const payload = grupo.map((f) => ({
      titulo: tituloRaas(f),
      competencia: /^\d{6}$/.test(f.competencia) ? f.competencia : mesProducao,
      dados: f,
      tipo: "RAAS" as const,
      cnes: cnes || null,
      profissional_cns: null,
      profissional_nome: null,
      mes_producao: mesProducao,
      origem: "importado" as const,
    }));
    let bloqueada = false;
    for (let i = 0; i < payload.length; i += 100) {
      const lote = payload.slice(i, i + 100);
      const { data, error } = await supabase.from("fichas").insert(lote).select("id");
      if (error) { bloqueadas.push({ cnes: cnes || "(sem CNES)", fichas: grupo.length, motivo: motivoErro(error.message) }); bloqueada = true; break; }
      ok += data?.length ?? lote.length;
    }
    if (!bloqueada) acoes += grupo.reduce((s, f) => s + totalAcoes(f.acoes), 0);
  }

  return { fichas: ok, acoes, bloqueadas, erro: null };
}

// Quantas fichas RAAS já foram importadas neste mês de produção para estas unidades
// (aviso de duplicidade antes de gravar).
export async function contarRaasNoMes(mesProducao: string, cnesList: string[]): Promise<number> {
  if (!supabase) return 0;
  try {
    let req = supabase.from("fichas").select("id", { count: "exact", head: true })
      .eq("tipo", "RAAS").eq("origem", "importado").eq("mes_producao", mesProducao);
    if (cnesList.length) req = req.in("cnes", cnesList);
    const { count } = await req;
    return count ?? 0;
  } catch {
    return 0;
  }
}
