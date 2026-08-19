// Coletor de ERROS/crivo da produção — alimenta o "Relatório de erros".
// Quatro categorias (selecionáveis): produção×SIGTAP, fichas incompletas, cadastro de
// pacientes (revisão) e duplicidade de fichas. Tudo null-safe: degrada sem quebrar a tela.
import { supabase } from "@/lib/supabase";
import { carregarProducaoDashboard, type ProducaoBpaRow } from "@/lib/dashboard-producao";
import { fichasDoMes, type FichaCompleta } from "@/lib/bpa-i-v2/fichas";
import { buscarProcedimentoSigtap } from "@/lib/bpa-i-v2/procedimentos-sigtap";
import { procedimentoExigeServico, procedimentoExigeCid } from "@/lib/bpa-i-v3/exigencias-sigtap";
import { motivosObrigatoriosSeq } from "@/lib/bpa-i-v3/obrigatorios";
import { seqPreenchida } from "@/lib/bpa-i-v2/bpa-magnetico";
import { assinaturaBpaI, assinaturaBpaC } from "@/lib/bpa-i-v2/folha-duplicidade";
import type { SeqData } from "@/lib/bpai-v2-layout";

export type CategoriaErro = "producao-sigtap" | "ficha-incompleta" | "paciente-revisao" | "duplicidade";
export const ROTULO_CATEGORIA: Record<CategoriaErro, string> = {
  "producao-sigtap": "Produção × SIGTAP",
  "ficha-incompleta": "Ficha incompleta",
  "paciente-revisao": "Cadastro de paciente",
  "duplicidade": "Duplicidade de fichas",
};

export interface ErroItem {
  categoria: CategoriaErro;
  gravidade: "erro" | "aviso";
  fichaId: string | null;
  tipo: string;          // BPA-I / BPA-C / —
  competencia: string;   // AAAAMM (atendimento) ou ""
  cnes: string;
  profissional: string;
  procedimento: string;  // código, quando aplicável
  descricao: string;
  pacienteId?: string | null; // preenchido em "paciente-revisao" p/ resolver a marca
}

const jc = (a: unknown): string => (Array.isArray(a) ? a.join("") : String(a ?? ""));
const nomeOuCodigo = (nome: string | null | undefined, codigo: string | null | undefined) => (nome?.trim() || codigo || "—");
const mesesDiff = (a: string, b: string) => { // a - b em meses (AAAAMM)
  if (!/^\d{6}$/.test(a) || !/^\d{6}$/.test(b)) return 0;
  return (Number(a.slice(0, 4)) - Number(b.slice(0, 4))) * 12 + (Number(a.slice(4, 6)) - Number(b.slice(4, 6)));
};

// ---- A) Produção × SIGTAP ----
async function errosProducaoSigtap(rows: ProducaoBpaRow[]): Promise<ErroItem[]> {
  const out: ErroItem[] = [];
  const procCache = new Map<string, Awaited<ReturnType<typeof buscarProcedimentoSigtap>>>();
  const servCache = new Map<string, boolean | null>();
  const cidCache = new Map<string, boolean | null>();
  const distintos = [...new Set(rows.map((r) => r.procedimento).filter((c) => c && c.length === 10))];
  await Promise.all(distintos.map(async (c) => {
    procCache.set(c, await buscarProcedimentoSigtap(c));
    servCache.set(c, await procedimentoExigeServico(c));
    cidCache.set(c, await procedimentoExigeCid(c));
  }));

  for (const r of rows) {
    const base = { tipo: r.tipo, competencia: r.competencia, cnes: r.cnes ?? "", fichaId: r.ficha_id,
      profissional: nomeOuCodigo(r.profissional_nome, r.profissional_cns || r.cbo), procedimento: r.procedimento };
    const proc = r.procedimento && r.procedimento.length === 10 ? procCache.get(r.procedimento) : null;
    if (!proc) {
      out.push({ ...base, categoria: "producao-sigtap", gravidade: "erro", descricao: `Procedimento ${r.procedimento || "(vazio)"} não consta no SIGTAP das competências carregadas.` });
      continue; // sem SIGTAP não dá p/ checar as demais regras
    }
    if (r.quantidade <= 0) out.push({ ...base, categoria: "producao-sigtap", gravidade: "erro", descricao: "Quantidade inválida (0)." });
    // Serviço/Classificação NÃO se aplica ao BPA Consolidado (o formulário só registra
    // procedimento/CBO/idade/quantidade — não há esses campos). Só cobramos no individualizado.
    if (r.tipo !== "BPA-C" && servCache.get(r.procedimento) === true && (!r.servico || !r.classificacao))
      out.push({ ...base, categoria: "producao-sigtap", gravidade: "erro", descricao: "Serviço/Classificação obrigatório para o procedimento (SIGTAP) e está ausente." });
    // CID também não se aplica ao BPA Consolidado (o formulário não registra CID).
    if (r.tipo !== "BPA-C" && cidCache.get(r.procedimento) === true && (!r.cid || r.cid.trim().length < 3))
      out.push({ ...base, categoria: "producao-sigtap", gravidade: "erro", descricao: "CID obrigatório para o procedimento (SIGTAP) e está ausente." });
    // Competência de atendimento muito anterior ao mês de produção (retroatividade).
    if (r.mes_producao && r.competencia && mesesDiff(r.mes_producao, r.competencia) > 3)
      out.push({ ...base, categoria: "producao-sigtap", gravidade: "aviso", descricao: `Atendimento em ${r.competencia} lançado na produção de ${r.mes_producao} (mais de 3 competências de retroatividade).` });
  }
  return out;
}

// ---- B) Fichas incompletas (BPA-I: identidade/endereço/data/quantidade por sequência) ----
function errosFichasIncompletas(fichas: FichaCompleta[]): ErroItem[] {
  const out: ErroItem[] = [];
  for (const f of fichas) {
    if (f.tipo !== "BPA-I") continue;
    try {
      const d = f.dados as { seqs?: SeqData[]; profNome?: string; profCns?: unknown; cnes?: unknown };
      const cnes = jc(d.cnes);
      const prof = (d.profNome as string) || jc(d.profCns) || "—";
      const seqs = Array.isArray(d.seqs) ? d.seqs : [];
      seqs.forEach((s, i) => {
        if (!seqPreenchida(s)) return;
        const motivos = motivosObrigatoriosSeq(s, { exigeServico: null, exigeCid: null });
        for (const m of motivos) {
          out.push({ categoria: "ficha-incompleta", gravidade: "erro", fichaId: f.id, tipo: "BPA-I",
            competencia: "", cnes, profissional: prof, procedimento: jc(s.codProc),
            descricao: `Seq. ${i + 1}: ${m}` });
        }
      });
    } catch { /* ficha com shape inesperado — ignora */ }
  }
  return out;
}

// ---- C) Cadastro de pacientes em revisão (conflito de documento no dedup/backfill) ----
async function errosPacientesRevisao(): Promise<ErroItem[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from("pacientes")
      .select("id, nome, cns, cpf").eq("flag_revisao", true).is("excluido_em", null).limit(2000);
    if (error || !data) return [];
    return (data as { id: string; nome: string; cns: string | null; cpf: string | null }[]).map((p) => ({
      categoria: "paciente-revisao" as const, gravidade: "aviso" as const, fichaId: null, tipo: "—",
      competencia: "", cnes: "", profissional: "—", procedimento: "", pacienteId: p.id,
      descricao: `Paciente ${p.nome}${p.cns ? ` (CNS ${p.cns})` : p.cpf ? ` (CPF ${p.cpf})` : ""} marcado para revisão — possível conflito de documento (nome/nascimento divergente).`,
    }));
  } catch { return []; }
}

// Dá baixa na revisão de um paciente (zera flag_revisao). Usado no botão "Resolver"
// do relatório de erros. Retorna true se atualizou.
export async function resolverRevisaoPaciente(id: string): Promise<boolean> {
  if (!supabase || !id) return false;
  try {
    const { error } = await supabase.from("pacientes").update({ flag_revisao: false }).eq("id", id);
    return !error;
  } catch { return false; }
}

// ---- D) Duplicidade de fichas (mesma chave + mesmo conteúdo) ----
function errosDuplicidade(fichas: FichaCompleta[]): ErroItem[] {
  const out: ErroItem[] = [];
  const grupos = new Map<string, { id: string; cnes: string; prof: string; tipo: string }[]>();
  for (const f of fichas) {
    try {
      const d = f.dados as Record<string, unknown>;
      const cnes = jc(d.cnes) || jc(d.nome);
      let chave = "", assinatura = "", prof = "—";
      if (f.tipo === "BPA-I") {
        const comp = jc(d.profAno) + jc(d.profMes);
        assinatura = assinaturaBpaI(d.profCbo, d.seqs);
        prof = (d.profNome as string) || jc(d.profCns) || "—";
        chave = `I|${cnes}|${jc(d.profCns)}|${comp}`;
      } else {
        const comp = jc(d.ano) + jc(d.mes);
        assinatura = assinaturaBpaC(d.rows);
        prof = (d.profNome as string) || "—";
        chave = `C|${cnes}|${comp}|${(d.profNome as string) ?? ""}`;
      }
      if (!assinatura) continue; // ficha sem conteúdo não conta
      const k = `${chave}#${assinatura}`;
      const arr = grupos.get(k) ?? [];
      arr.push({ id: f.id, cnes, prof, tipo: f.tipo });
      grupos.set(k, arr);
    } catch { /* ignora */ }
  }
  for (const arr of grupos.values()) {
    if (arr.length < 2) continue;
    for (const it of arr) {
      out.push({ categoria: "duplicidade", gravidade: "aviso", fichaId: it.id,
        tipo: it.tipo, competencia: "", cnes: it.cnes, profissional: it.prof, procedimento: "",
        descricao: `Ficha idêntica a outra(s) ${arr.length - 1} do mesmo profissional/competência (possível duplicidade). Grupo com ${arr.length} fichas.` });
    }
  }
  return out;
}

export interface OpcoesErros { mesProducao: string; categorias: Set<CategoriaErro> }

// Coleta os erros das categorias pedidas. As categorias que usam produção compartilham a
// mesma carga (uma consulta só).
export async function coletarErros({ mesProducao, categorias }: OpcoesErros): Promise<ErroItem[]> {
  const res: ErroItem[] = [];
  // Cargas compartilhadas (uma vez): produção p/ o crivo SIGTAP; fichas p/ incompletas+duplicidade.
  const [rows, fichas] = await Promise.all([
    categorias.has("producao-sigtap") ? carregarProducaoDashboard(mesProducao) : Promise.resolve([] as ProducaoBpaRow[]),
    (categorias.has("ficha-incompleta") || categorias.has("duplicidade")) ? fichasDoMes(mesProducao) : Promise.resolve([] as FichaCompleta[]),
  ]);
  const tarefas: Promise<ErroItem[]>[] = [];
  if (categorias.has("producao-sigtap")) tarefas.push(errosProducaoSigtap(rows));
  if (categorias.has("ficha-incompleta")) tarefas.push(Promise.resolve(errosFichasIncompletas(fichas)));
  if (categorias.has("paciente-revisao")) tarefas.push(errosPacientesRevisao());
  if (categorias.has("duplicidade")) tarefas.push(Promise.resolve(errosDuplicidade(fichas)));
  for (const bloco of await Promise.all(tarefas)) res.push(...bloco);
  return res;
}
