import { supabase } from "@/lib/supabase";
import { emptySeq, type SeqData } from "@/lib/bpai-v2-layout";
import type { Paciente } from "@/lib/pacientes";
import { gerarProcedimentosTfd, COD_TFD, type EntradaTfd } from "./gerar-bpa-tfd";

// Persistência do módulo TFD: destinos (catálogo por org), valores unitários (vigência à la
// FPO), registros de TFD e a geração da ficha BPA-I a partir de um registro. Null-safe.

// CNES habilitados para o TFD (inicialmente estas duas unidades). Só quem tem vínculo em
// algum destes vê a aba/página do TFD. A visibilidade dos dados continua por CNES próprio.
export const CNES_TFD: readonly string[] = ["6429335", "2510375"];

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
  data_atendimento: string | null; // data de referência das sequências BPA-I (YYYY-MM-DD)
  tem_acompanhante: boolean;
  acompanhante_id: string | null;  // pessoa cadastrada (mesmos campos do paciente/BPA-I)
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

// Registro + dados do paciente/acompanhante/destino embutidos + total valorado, p/ a listagem.
export interface TfdRegistroView extends TfdRegistro {
  paciente_nome: string | null;
  paciente_cns: string | null;
  acompanhante_nome: string | null;
  acompanhante_cns: string | null;
  destino_descricao: string | null;
  total_rs: number; // soma de quantidade × valor_unitario das linhas (por paciente)
}

const TFD_COLS =
  "id, organizacao_id, cnes, paciente_id, destino_id, distancia_km, competencia, qtd_com_pernoite, qtd_sem_pernoite, data_atendimento, tem_acompanhante, acompanhante_id, prof_cns, prof_nome, prof_cbo, status, ficha_id, observacoes";

export async function listarTfd(cnes: string, competencia: string): Promise<TfdRegistroView[]> {
  if (!supabase || !cnes || !competencia) return [];
  try {
    const { data, error } = await supabase.from("tfd")
      .select(`${TFD_COLS}, paciente:pacientes!tfd_paciente_id_fkey(nome, cns), acompanhante:pacientes!tfd_acompanhante_id_fkey(nome, cns), tfd_destinos(descricao), tfd_linhas(quantidade, valor_unitario)`)
      .eq("cnes", cnes).eq("competencia", competencia).order("criado_em", { ascending: false });
    if (error || !data) return [];
    return (data as unknown as Array<Record<string, unknown>>).map((r) => {
      const pac = (Array.isArray(r.paciente) ? r.paciente[0] : r.paciente) as { nome?: string; cns?: string } | null;
      const ac = (Array.isArray(r.acompanhante) ? r.acompanhante[0] : r.acompanhante) as { nome?: string; cns?: string } | null;
      const dest = (Array.isArray(r.tfd_destinos) ? r.tfd_destinos[0] : r.tfd_destinos) as { descricao?: string } | null;
      const linhas = (Array.isArray(r.tfd_linhas) ? r.tfd_linhas : []) as { quantidade: number; valor_unitario: number }[];
      return {
        ...(r as unknown as TfdRegistro),
        paciente_nome: pac?.nome ?? null,
        paciente_cns: pac?.cns ?? null,
        acompanhante_nome: ac?.nome ?? null,
        acompanhante_cns: ac?.cns ?? null,
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
    data_atendimento: input.data_atendimento || null,
    tem_acompanhante: Boolean(input.tem_acompanhante),
    acompanhante_id: input.acompanhante_id ?? null,
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

// Preenche uma seq BPA-I com a demografia COMPLETA de uma pessoa (paciente ou acompanhante),
// para que o BPA Magnético aceite na importação. `dataAtend` = YYYY-MM-DD -> [D,D,M,M,A,A,A,A].
function preencherSeqPessoa(s: SeqData, pessoa: Paciente, dataAtend: string | null) {
  s.cnsPac = cells(pessoa.cns, 15);
  s.nomePac = (pessoa.nome || "").toUpperCase();
  if (pessoa.sexo) s.sexo = pessoa.sexo;
  if (pessoa.nascimento) s.dataNasc = cells(pessoa.nascimento.split("-").reverse().join(""), 8);
  if (pessoa.nacionalidade) s.nacionalidade = pessoa.nacionalidade;
  if (pessoa.raca_cor) s.racaCor = pessoa.raca_cor;
  if (pessoa.etnia) s.etnia = pessoa.etnia;
  if (pessoa.cep) s.cep = cells(pessoa.cep, 8);
  if (pessoa.municipio_ibge) s.ibge = cells(pessoa.municipio_ibge, 7);
  if (pessoa.cod_logradouro) s.codLog = cells(pessoa.cod_logradouro, 3);
  if (pessoa.logradouro) s.endereco = pessoa.logradouro.toUpperCase();
  if (pessoa.numero) s.numero = cells(pessoa.numero, 4);
  if (pessoa.complemento) s.complemento = pessoa.complemento;
  if (pessoa.bairro) s.bairro = pessoa.bairro.toUpperCase();
  if (pessoa.cpf) s.cpfPac = cells(pessoa.cpf, 11);
  if (pessoa.situacao_rua) s.situacaoRua = pessoa.situacao_rua;
  if (pessoa.email) s.email = pessoa.email;
  if (pessoa.telefone) {
    s.ddd = cells(pessoa.telefone.slice(0, 2), 2);
    s.telefone = cells(pessoa.telefone.slice(2), 8);
  }
  if (dataAtend) s.dataAtend = cells(dataAtend.split("-").reverse().join(""), 8);
}

// Dados relevantes de um TFD para gerar as sequências.
type TfdParaSeq = Pick<TfdRegistro, "distancia_km" | "qtd_com_pernoite" | "qtd_sem_pernoite" | "tem_acompanhante" | "data_atendimento">;

// Gera as sequências BPA-I de UM TFD (paciente + acompanhante), cada uma com demografia
// COMPLETA e caráter de atendimento ELETIVO ("01", sempre, para TFD).
export function montarSeqsTfd(tfd: TfdParaSeq, paciente: Paciente, acompanhante: Paciente | null): SeqData[] {
  const linhas = gerarProcedimentosTfd({
    distanciaKm: tfd.distancia_km,
    qtdComPernoite: tfd.qtd_com_pernoite,
    qtdSemPernoite: tfd.qtd_sem_pernoite,
    temAcompanhante: tfd.tem_acompanhante,
  });
  return linhas.map((l) => {
    const s = emptySeq();
    s.codProc = cells(l.codigo, 10);
    s.qtde = cells(String(l.quantidade), 3);
    s.carater = cells("01", 2); // TFD é sempre eletivo
    const pessoa = l.para === "acompanhante" ? acompanhante : paciente;
    if (pessoa) preencherSeqPessoa(s, pessoa, tfd.data_atendimento);
    return s;
  });
}

// Header do profissional + seqs -> objeto `dados` no shape do BPA-I v2. O gerador do .txt
// (gerarArquivoBpa) distribui essas seqs em folhas de 3 automaticamente.
function dadosBpaTfd(
  h: { cnes: string; profCns: string | null; profNome: string | null; profCbo: string | null; competencia: string; nomeEstab: string },
  seqs: SeqData[],
): unknown {
  return {
    nomeEstab: h.nomeEstab,
    cnes: cells(h.cnes, 7),
    profCns: cells(h.profCns, 15),
    profNome: (h.profNome || "").toUpperCase(),
    profCbo: cells(h.profCbo, 6),
    profMes: cells(h.competencia.slice(4, 6), 2),
    profAno: cells(h.competencia.slice(0, 4), 4),
    profEquipe: "",
    profFolha: Array(3).fill(""),
    seqs,
    respConfirmacao: null,
    respData: [],
    gestCarimbo: "",
    gestRubrica: "",
    gestData: [],
    origem_tfd: true, // marcador auxiliar (além de fichas.origem='tfd')
  };
}

// `dados` de uma ficha BPA-I para UM TFD (prévia/individual).
export function montarDadosFichaTfd(
  tfd: TfdParaSeq & Pick<TfdRegistro, "cnes" | "competencia" | "prof_cns" | "prof_nome" | "prof_cbo">,
  paciente: Paciente,
  acompanhante: Paciente | null,
  nomeEstab: string,
): { dados: unknown; totalSeqs: number } {
  const seqs = montarSeqsTfd(tfd, paciente, acompanhante);
  const dados = dadosBpaTfd(
    { cnes: tfd.cnes, profCns: tfd.prof_cns, profNome: tfd.prof_nome, profCbo: tfd.prof_cbo, competencia: tfd.competencia, nomeEstab },
    seqs,
  );
  return { dados, totalSeqs: seqs.length };
}

export interface ResultadoFaturamentoTfd {
  fichas: number;   // fichas BPA-I geradas (1 por profissional)
  tfds: number;     // TFDs faturados
  seqs: number;     // total de sequências
  semProf: number;  // TFDs pulados por não ter profissional responsável
}

// FATURAMENTO DO MÊS: consolida TODOS os TFDs (não cancelados) da competência num CNES,
// AGRUPADOS por profissional responsável — cada profissional vira UMA ficha BPA-I com todas
// as suas seqs (o gerador do .txt fatia em folhas de 3). Idempotente: reexecutar atualiza a
// ficha do profissional em vez de duplicar. Marca os TFDs como 'faturada'. Null em falha.
export async function gerarFaturamentoMes(cnes: string, competencia: string, nomeEstab: string): Promise<ResultadoFaturamentoTfd | null> {
  if (!supabase) return null;
  try {
    const { data: tfds, error } = await supabase.from("tfd")
      .select("id, cnes, competencia, distancia_km, qtd_com_pernoite, qtd_sem_pernoite, data_atendimento, tem_acompanhante, paciente_id, acompanhante_id, prof_cns, prof_nome, prof_cbo")
      .eq("cnes", cnes).eq("competencia", competencia).neq("status", "cancelada");
    if (error) return null;
    if (!tfds || tfds.length === 0) return { fichas: 0, tfds: 0, seqs: 0, semProf: 0 };

    // Carrega as pessoas (paciente + acompanhante) envolvidas.
    const ids = [...new Set((tfds as Array<Record<string, string | null>>).flatMap((t) => [t.paciente_id, t.acompanhante_id]).filter(Boolean) as string[])];
    const { data: pacs } = await supabase.from("pacientes").select("*").in("id", ids);
    const pacMap = new Map<string, Paciente>((pacs ?? []).map((p) => [(p as Paciente).id, p as Paciente]));

    // Agrupa as seqs por profissional responsável.
    interface Grupo { profCns: string; profNome: string | null; profCbo: string | null; seqs: SeqData[]; tfdIds: string[]; }
    const grupos = new Map<string, Grupo>();
    let semProf = 0;
    for (const t of tfds as Array<Record<string, unknown>>) {
      const profCns = String(t.prof_cns || "").replace(/\D/g, "");
      if (!profCns) { semProf++; continue; }
      const pac = pacMap.get(t.paciente_id as string);
      if (!pac) continue;
      const ac = t.acompanhante_id ? pacMap.get(t.acompanhante_id as string) ?? null : null;
      const seqs = montarSeqsTfd(t as unknown as TfdParaSeq, pac, ac);
      const g = grupos.get(profCns) ?? { profCns, profNome: (t.prof_nome as string) ?? null, profCbo: (t.prof_cbo as string) ?? null, seqs: [], tfdIds: [] };
      g.seqs.push(...seqs);
      g.tfdIds.push(t.id as string);
      grupos.set(profCns, g);
    }

    let totalSeqs = 0;
    for (const g of grupos.values()) {
      const dados = dadosBpaTfd({ cnes, profCns: g.profCns, profNome: g.profNome, profCbo: g.profCbo, competencia, nomeEstab }, g.seqs);
      totalSeqs += g.seqs.length;
      const payload = {
        titulo: `TFD ${competencia.slice(4, 6)}/${competencia.slice(0, 4)} — ${g.profNome || g.profCns}`,
        competencia, dados, tipo: "BPA-I", cnes,
        profissional_cns: g.profCns, profissional_nome: g.profNome, origem: "tfd", mes_producao: competencia,
      };
      const { data: existente } = await supabase.from("fichas").select("id")
        .eq("cnes", cnes).eq("competencia", competencia).eq("origem", "tfd").eq("profissional_cns", g.profCns).limit(1).maybeSingle();
      let fichaId: string | null = null;
      if (existente) {
        const { error: e2 } = await supabase.from("fichas").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", (existente as { id: string }).id);
        if (!e2) fichaId = (existente as { id: string }).id;
      } else {
        const { data: nova, error: e3 } = await supabase.from("fichas").insert(payload).select("id").single();
        if (!e3 && nova) fichaId = (nova as { id: string }).id;
      }
      if (fichaId) {
        await supabase.from("tfd").update({ status: "faturada", ficha_id: fichaId, atualizado_em: new Date().toISOString() }).in("id", g.tfdIds);
      }
    }
    return { fichas: grupos.size, tfds: tfds.length, seqs: totalSeqs, semProf };
  } catch {
    return null;
  }
}

// Prévia dos procedimentos faturáveis (sem gravar), para o painel do registro.
export function previaTfd(entrada: EntradaTfd) {
  return gerarProcedimentosTfd(entrada);
}

export { COD_TFD };
