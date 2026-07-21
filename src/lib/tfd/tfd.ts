import { supabase } from "@/lib/supabase";
import { emptySeq } from "@/lib/bpai-v2-layout";
import type { Paciente } from "@/lib/pacientes";
import { gerarProcedimentosTfd, COD_TFD, type EntradaTfd } from "./gerar-bpa-tfd";

// Persistência do módulo TFD: destinos (catálogo por org), valores unitários (vigência à la
// FPO), registros de TFD e a geração da ficha BPA-I a partir de um registro. Null-safe.

// ---------------------------------------------------------------------------
// Org a partir do CNES (a RLS deixa o usuário ler os estabelecimentos da sua org).
// ---------------------------------------------------------------------------
const orgCache = new Map<string, string | null>();
export async function orgDoCnes(cnes: string): Promise<string | null> {
  if (!supabase || !cnes) return null;
  if (orgCache.has(cnes)) return orgCache.get(cnes) ?? null;
  try {
    const { data } = await supabase.from("estabelecimentos").select("organizacao_id").eq("cnes", cnes).maybeSingle();
    const org = (data as { organizacao_id: string } | null)?.organizacao_id ?? null;
    orgCache.set(cnes, org);
    return org;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Destinos (rotas) — catálogo por organização, auto-alimentável.
// ---------------------------------------------------------------------------
export interface TfdDestino {
  id: string;
  organizacao_id: string;
  descricao: string;
  municipio_destino: string | null;
  uf_destino: string | null;
  estabelecimento_destino: string | null;
  distancia_km: number;
  ativo: boolean;
}

const DEST_COLS = "id, organizacao_id, descricao, municipio_destino, uf_destino, estabelecimento_destino, distancia_km, ativo";

export async function listarDestinos(organizacaoId: string): Promise<TfdDestino[]> {
  if (!supabase || !organizacaoId) return [];
  try {
    const { data, error } = await supabase.from("tfd_destinos").select(DEST_COLS)
      .eq("organizacao_id", organizacaoId).eq("ativo", true).order("descricao");
    return error || !data ? [] : (data as TfdDestino[]);
  } catch {
    return [];
  }
}

export type DestinoInput = Partial<Omit<TfdDestino, "id" | "organizacao_id">> & {
  organizacao_id: string;
  descricao: string;
  distancia_km: number;
};

// Cria ou atualiza um destino (dedup por descrição na org).
export async function salvarDestino(input: DestinoInput): Promise<TfdDestino | null> {
  if (!supabase) return null;
  const row = {
    organizacao_id: input.organizacao_id,
    descricao: input.descricao.trim(),
    municipio_destino: input.municipio_destino?.trim() || null,
    uf_destino: input.uf_destino?.trim().toUpperCase() || null,
    estabelecimento_destino: input.estabelecimento_destino?.trim() || null,
    distancia_km: Math.max(0, input.distancia_km || 0),
    ativo: input.ativo ?? true,
    atualizado_em: new Date().toISOString(),
  };
  try {
    const { data: existente } = await supabase.from("tfd_destinos").select("id")
      .eq("organizacao_id", input.organizacao_id).ilike("descricao", row.descricao).maybeSingle();
    if (existente) {
      const { data, error } = await supabase.from("tfd_destinos").update(row)
        .eq("id", (existente as { id: string }).id).select(DEST_COLS).single();
      return error || !data ? null : (data as TfdDestino);
    }
    const { data, error } = await supabase.from("tfd_destinos").insert(row).select(DEST_COLS).single();
    return error || !data ? null : (data as TfdDestino);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Valores unitários (por org) com vigência: o valor de uma competência X é a linha
// com competencia <= X mais recente (mesmo modelo do FPO). Devolve mapa procedimento->valor.
// ---------------------------------------------------------------------------
export async function valoresVigentes(organizacaoId: string, competencia: string): Promise<Record<string, number>> {
  if (!supabase || !organizacaoId || !competencia) return {};
  try {
    const { data, error } = await supabase.from("tfd_valores")
      .select("procedimento, competencia, valor_unitario")
      .eq("organizacao_id", organizacaoId).lte("competencia", competencia);
    if (error || !data) return {};
    // Vigente por procedimento = maior competência <= X.
    const vig = new Map<string, { comp: string; valor: number }>();
    for (const r of data as { procedimento: string; competencia: string; valor_unitario: number }[]) {
      const cur = vig.get(r.procedimento);
      if (!cur || r.competencia > cur.comp) vig.set(r.procedimento, { comp: r.competencia, valor: Number(r.valor_unitario) });
    }
    const out: Record<string, number> = {};
    for (const [proc, v] of vig) out[proc] = v.valor;
    return out;
  } catch {
    return {};
  }
}

// Define/atualiza o valor VIGENTE a partir de uma competência (cria a linha da vigência).
export async function definirValorVigente(
  organizacaoId: string, procedimento: string, competencia: string, valor: number, por: string | null,
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("tfd_valores").upsert({
    organizacao_id: organizacaoId, procedimento, competencia,
    valor_unitario: Math.max(0, valor), atualizado_por: por, atualizado_em: new Date().toISOString(),
  }, { onConflict: "organizacao_id,procedimento,competencia" });
  return !error;
}

// ---------------------------------------------------------------------------
// Registros de TFD.
// ---------------------------------------------------------------------------
export type TfdStatus = "agendada" | "realizada" | "faturada" | "cancelada";

export interface TfdRegistro {
  id: string;
  organizacao_id: string;
  cnes: string;
  paciente_id: string;
  destino_id: string | null;
  distancia_km: number;
  competencia: string;
  qtd_com_pernoite: number;
  qtd_sem_pernoite: number;
  tem_acompanhante: boolean;
  acompanhante_nome: string | null;
  acompanhante_cns: string | null;
  prof_cns: string | null;
  prof_nome: string | null;
  prof_cbo: string | null;
  status: TfdStatus;
  ficha_id: string | null;
  observacoes: string | null;
}

// Uma linha de valor por procedimento do TFD (guardada por paciente em tfd_linhas).
export interface LinhaValor {
  codigo: string;
  quantidade: number;
  para: "paciente" | "acompanhante";
  valor_unitario: number;
}

// Registro + dados do paciente/destino embutidos + total valorado, para a listagem.
export interface TfdRegistroView extends TfdRegistro {
  paciente_nome: string | null;
  paciente_cns: string | null;
  destino_descricao: string | null;
  total_rs: number; // soma de quantidade × valor_unitario das linhas (por paciente)
}

const TFD_COLS =
  "id, organizacao_id, cnes, paciente_id, destino_id, distancia_km, competencia, qtd_com_pernoite, qtd_sem_pernoite, tem_acompanhante, acompanhante_nome, acompanhante_cns, prof_cns, prof_nome, prof_cbo, status, ficha_id, observacoes";

export async function listarTfd(cnes: string, competencia: string): Promise<TfdRegistroView[]> {
  if (!supabase || !cnes || !competencia) return [];
  try {
    const { data, error } = await supabase.from("tfd")
      .select(`${TFD_COLS}, pacientes(nome, cns), tfd_destinos(descricao), tfd_linhas(quantidade, valor_unitario)`)
      .eq("cnes", cnes).eq("competencia", competencia).order("criado_em", { ascending: false });
    if (error || !data) return [];
    return (data as unknown as Array<Record<string, unknown>>).map((r) => {
      const pac = (Array.isArray(r.pacientes) ? r.pacientes[0] : r.pacientes) as { nome?: string; cns?: string } | null;
      const dest = (Array.isArray(r.tfd_destinos) ? r.tfd_destinos[0] : r.tfd_destinos) as { descricao?: string } | null;
      const linhas = (Array.isArray(r.tfd_linhas) ? r.tfd_linhas : []) as { quantidade: number; valor_unitario: number }[];
      return {
        ...(r as unknown as TfdRegistro),
        paciente_nome: pac?.nome ?? null,
        paciente_cns: pac?.cns ?? null,
        destino_descricao: dest?.descricao ?? null,
        total_rs: linhas.reduce((s, l) => s + (l.quantidade || 0) * Number(l.valor_unitario || 0), 0),
      };
    });
  } catch {
    return [];
  }
}

export type TfdInput = Partial<Omit<TfdRegistro, "id">> & {
  organizacao_id: string;
  cnes: string;
  paciente_id: string;
  competencia: string;
};

// Regrava as linhas de valor (por paciente) de um TFD: apaga as atuais e insere as novas.
async function regravarLinhas(tfdId: string, linhas: LinhaValor[]): Promise<void> {
  if (!supabase) return;
  await supabase.from("tfd_linhas").delete().eq("tfd_id", tfdId);
  const rows = linhas
    .filter((l) => l.quantidade > 0)
    .map((l, i) => ({ tfd_id: tfdId, codigo: l.codigo, quantidade: l.quantidade, para: l.para, valor_unitario: Math.max(0, l.valor_unitario || 0), ordem: i }));
  if (rows.length) await supabase.from("tfd_linhas").insert(rows);
}

// Cria ou atualiza um registro de TFD (e regrava as linhas de valor por paciente, quando
// passadas). Retorna o id, ou null em falha.
export async function salvarTfd(id: string | null, input: TfdInput, linhas?: LinhaValor[]): Promise<string | null> {
  if (!supabase) return null;
  const row = {
    organizacao_id: input.organizacao_id,
    cnes: input.cnes,
    paciente_id: input.paciente_id,
    destino_id: input.destino_id ?? null,
    distancia_km: Math.max(0, input.distancia_km || 0),
    competencia: input.competencia,
    qtd_com_pernoite: Math.max(0, Math.floor(input.qtd_com_pernoite || 0)),
    qtd_sem_pernoite: Math.max(0, Math.floor(input.qtd_sem_pernoite || 0)),
    tem_acompanhante: Boolean(input.tem_acompanhante),
    acompanhante_nome: input.acompanhante_nome?.trim() || null,
    acompanhante_cns: (input.acompanhante_cns || "").replace(/\D/g, "") || null,
    prof_cns: (input.prof_cns || "").replace(/\D/g, "") || null,
    prof_nome: input.prof_nome?.trim() || null,
    prof_cbo: (input.prof_cbo || "").replace(/\D/g, "") || null,
    status: input.status ?? "agendada",
    observacoes: input.observacoes?.trim() || null,
    atualizado_em: new Date().toISOString(),
  };
  try {
    let tfdId = id;
    if (id) {
      const { error } = await supabase.from("tfd").update(row).eq("id", id);
      if (error) return null;
    } else {
      const { data, error } = await supabase.from("tfd").insert(row).select("id").single();
      if (error || !data) return null;
      tfdId = (data as { id: string }).id;
    }
    if (tfdId && linhas) await regravarLinhas(tfdId, linhas);
    return tfdId;
  } catch {
    return null;
  }
}

export async function atualizarStatusTfd(id: string, status: TfdStatus): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("tfd").update({ status, atualizado_em: new Date().toISOString() }).eq("id", id);
  return !error;
}

// ---------------------------------------------------------------------------
// Geração da ficha BPA-I a partir de um TFD (faturamento).
// ---------------------------------------------------------------------------
const cells = (s: string | null | undefined, n: number): string[] => {
  const d = (s || "").replace(/\D/g, "").slice(0, n).split("");
  return [...d, ...Array(Math.max(0, n - d.length)).fill("")];
};

// Monta o `dados` (shape do BPA-I v2) de uma ficha TFD: header do profissional responsável +
// uma seq por linha faturável. Linha de paciente usa o CNS/demografia do paciente; linha de
// acompanhante usa o CNS do PRÓPRIO acompanhante (⚠️ regra a validar — ver gerar-bpa-tfd.ts).
export function montarDadosFichaTfd(
  tfd: Pick<TfdRegistro, "cnes" | "competencia" | "qtd_com_pernoite" | "qtd_sem_pernoite" | "tem_acompanhante" | "acompanhante_nome" | "acompanhante_cns" | "prof_cns" | "prof_nome" | "prof_cbo" | "distancia_km">,
  paciente: Paciente,
  nomeEstab: string,
): { dados: unknown; totalSeqs: number } {
  const entrada: EntradaTfd = {
    distanciaKm: tfd.distancia_km,
    qtdComPernoite: tfd.qtd_com_pernoite,
    qtdSemPernoite: tfd.qtd_sem_pernoite,
    temAcompanhante: tfd.tem_acompanhante,
  };
  const linhas = gerarProcedimentosTfd(entrada);

  const seqs = linhas.map((l) => {
    const s = emptySeq();
    s.codProc = cells(l.codigo, 10);
    s.qtde = cells(String(l.quantidade), 3);
    if (l.para === "acompanhante") {
      s.cnsPac = cells(tfd.acompanhante_cns, 15);
      s.nomePac = (tfd.acompanhante_nome || "").toUpperCase();
    } else {
      s.cnsPac = cells(paciente.cns, 15);
      s.nomePac = paciente.nome.toUpperCase();
      if (paciente.sexo) s.sexo = paciente.sexo;
      if (paciente.nascimento) s.dataNasc = cells(paciente.nascimento.split("-").reverse().join(""), 8);
      if (paciente.cep) s.cep = cells(paciente.cep, 8);
      if (paciente.municipio_ibge) s.ibge = cells(paciente.municipio_ibge, 7);
      if (paciente.logradouro) s.endereco = paciente.logradouro.toUpperCase();
      if (paciente.numero) s.numero = cells(paciente.numero, 4);
      if (paciente.bairro) s.bairro = paciente.bairro.toUpperCase();
      if (paciente.telefone) {
        s.ddd = cells(paciente.telefone.slice(0, 2), 2);
        s.telefone = cells(paciente.telefone.slice(2), 8);
      }
    }
    return s;
  });

  const dados = {
    nomeEstab,
    cnes: cells(tfd.cnes, 7),
    profCns: cells(tfd.prof_cns, 15),
    profNome: (tfd.prof_nome || "").toUpperCase(),
    profCbo: cells(tfd.prof_cbo, 6),
    profMes: cells(tfd.competencia.slice(4, 6), 2),
    profAno: cells(tfd.competencia.slice(0, 4), 4),
    profEquipe: "",
    profFolha: Array(3).fill(""),
    seqs,
    respConfirmacao: null,
    respData: [],
    gestCarimbo: "",
    gestRubrica: "",
    gestData: [],
    origem_tfd: true, // marcador auxiliar no próprio dados (além de fichas.origem='tfd')
  };
  return { dados, totalSeqs: seqs.length };
}

// Gera a ficha BPA-I (origem='tfd') a partir de um registro de TFD, vincula-a ao TFD e marca
// o TFD como 'faturada'. Retorna o id da ficha, ou null em falha.
export async function faturarTfd(
  tfd: TfdRegistro, paciente: Paciente, nomeEstab: string, competenciaProducao: string,
): Promise<string | null> {
  if (!supabase) return null;
  const { dados } = montarDadosFichaTfd(tfd, paciente, nomeEstab);
  try {
    const { data, error } = await supabase.from("fichas").insert({
      titulo: `TFD — ${paciente.nome}`,
      competencia: tfd.competencia,
      dados,
      tipo: "BPA-I",
      cnes: tfd.cnes,
      profissional_cns: (tfd.prof_cns || "").replace(/\D/g, "") || null,
      profissional_nome: tfd.prof_nome || null,
      origem: "tfd",
      mes_producao: competenciaProducao,
    }).select("id").single();
    if (error || !data) return null;
    const fichaId = (data as { id: string }).id;
    await supabase.from("tfd").update({ ficha_id: fichaId, status: "faturada", atualizado_em: new Date().toISOString() }).eq("id", tfd.id);
    return fichaId;
  } catch {
    return null;
  }
}

// Prévia dos procedimentos faturáveis (sem gravar), para o painel do registro.
export function previaTfd(entrada: EntradaTfd) {
  return gerarProcedimentosTfd(entrada);
}

export { COD_TFD };
