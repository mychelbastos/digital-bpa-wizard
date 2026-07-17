// Gravação das fichas importadas do BPA Magnético. Monta o `dados` no MESMO formato que a
// view producao_dashboard e o Fechamento esperam (ver 20260715120000_producao_origem_e_descarte)
// e insere em `fichas` marcando origem='importado' e mes_producao = competência de apresentação.
import { supabase } from "@/lib/supabase";
import type { ResultadoMagnetico, FichaBpaCImport, FichaBpaIImport } from "./parse-magnetico";

const arr = (s: string) => s.split("");
const labelComp = (c: string) => `${c.slice(4, 6)}/${c.slice(0, 4)}`;

function dadosBpaC(f: FichaBpaCImport, nome: string) {
  return {
    nome: nome || "",
    cnes: arr(f.cnes),
    ano: arr(f.competencia.slice(0, 4)),
    mes: arr(f.competencia.slice(4, 6)),
    folhaBase: ["1"],
    rows: f.rows,
  };
}

function dadosBpaI(f: FichaBpaIImport, nomeEstab: string) {
  return {
    nomeEstab: nomeEstab || "",
    profNome: "",
    cnes: arr(f.cnes),
    profCns: arr(f.profCns),
    profCbo: arr(f.profCbo),
    profAno: arr(f.competencia.slice(0, 4)),
    profMes: arr(f.competencia.slice(4, 6)),
    profFolha: ["1"],
    seqs: f.seqs,
  };
}

export interface ResumoGravacao {
  fichas: number;
  bpaC: number;
  bpaI: number;
  erro: string | null;
}

// Grava todas as fichas do resultado. `mesProducao` (AAAAMM) = mês de apresentação (agrupa a
// produção na dashboard/FPO). `nomesEstab` (cnes -> nome) enriquece o nome do estabelecimento.
export async function gravarMagnetico(
  res: ResultadoMagnetico,
  mesProducao: string,
  nomesEstab: Record<string, string> = {},
): Promise<ResumoGravacao> {
  if (!supabase) return { fichas: 0, bpaC: 0, bpaI: 0, erro: "Sem conexão com o banco." };
  const payloadC = res.fichasC.map((f) => ({
    titulo: `BPA-C · ${f.cnes} · ${labelComp(f.competencia)} (importado)`,
    competencia: f.competencia,
    dados: dadosBpaC(f, nomesEstab[f.cnes]),
    tipo: "BPA-C" as const,
    cnes: f.cnes,
    profissional_cns: null,
    profissional_nome: null,
    mes_producao: mesProducao,
    origem: "importado" as const,
  }));
  const payloadI = res.fichasI.map((f) => ({
    titulo: `BPA-I · ${f.profCns || "s/CNS"} · ${labelComp(f.competencia)} (importado)`,
    competencia: f.competencia,
    dados: dadosBpaI(f, nomesEstab[f.cnes]),
    tipo: "BPA-I" as const,
    cnes: f.cnes,
    profissional_cns: f.profCns || null,
    profissional_nome: null,
    mes_producao: mesProducao,
    origem: "importado" as const,
  }));
  const todos = [...payloadC, ...payloadI];
  if (todos.length === 0) return { fichas: 0, bpaC: 0, bpaI: 0, erro: "Nada para gravar." };

  let ok = 0;
  for (let i = 0; i < todos.length; i += 100) {
    const lote = todos.slice(i, i + 100);
    const { data, error } = await supabase.from("fichas").insert(lote).select("id");
    if (error) return { fichas: ok, bpaC: payloadC.length, bpaI: payloadI.length, erro: error.message };
    ok += data?.length ?? lote.length;
  }
  return { fichas: ok, bpaC: payloadC.length, bpaI: payloadI.length, erro: null };
}

// Quantas fichas já foram importadas neste mês de produção (aviso de duplicidade antes de gravar).
export async function contarImportadasNoMes(mesProducao: string, cnesList: string[]): Promise<number> {
  if (!supabase) return 0;
  try {
    let req = supabase.from("fichas").select("id", { count: "exact", head: true })
      .eq("origem", "importado").eq("mes_producao", mesProducao);
    if (cnesList.length) req = req.in("cnes", cnesList);
    const { count } = await req;
    return count ?? 0;
  } catch {
    return 0;
  }
}
