import { supabase } from "@/lib/supabase";
import { mensagemErroBanco } from "@/lib/erros";
import { emptySeq, type SeqData } from "@/lib/bpai-v2-layout";
import type { Paciente } from "@/lib/pacientes";
import { gerarProcedimentosTfd, gerarProcedimentosTfdPorData, COD_TFD, type EntradaTfd, type Viagem } from "./gerar-bpa-tfd";

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

export interface SalvarDestinoResultado { destino: TfdDestino | null; erro?: string }

// Cria ou atualiza um destino (dedup por descrição na org). Retorna { destino } ou { erro }.
export async function salvarDestino(input: DestinoInput): Promise<SalvarDestinoResultado> {
  if (!supabase) return { destino: null, erro: "Sistema indisponível." };
  const row = {
    organizacao_id: input.organizacao_id,
    descricao: input.descricao.trim().toUpperCase(),
    municipio_destino: input.municipio_destino?.trim().toUpperCase() || null,
    uf_destino: input.uf_destino?.trim().toUpperCase() || null,
    estabelecimento_destino: input.estabelecimento_destino?.trim().toUpperCase() || null,
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
      return error || !data ? { destino: null, erro: mensagemErroBanco(error) } : { destino: data as TfdDestino };
    }
    const { data, error } = await supabase.from("tfd_destinos").insert(row).select(DEST_COLS).single();
    return error || !data ? { destino: null, erro: mensagemErroBanco(error) } : { destino: data as TfdDestino };
  } catch {
    return { destino: null, erro: "Falha inesperada ao salvar o destino." };
  }
}

// Atualiza um destino existente (por id).
export async function atualizarDestino(id: string, campos: Partial<Omit<TfdDestino, "id" | "organizacao_id">>): Promise<boolean> {
  if (!supabase || !id) return false;
  const row: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (campos.descricao !== undefined) row.descricao = campos.descricao.trim().toUpperCase();
  if (campos.municipio_destino !== undefined) row.municipio_destino = campos.municipio_destino?.trim().toUpperCase() || null;
  if (campos.uf_destino !== undefined) row.uf_destino = campos.uf_destino?.trim().toUpperCase() || null;
  if (campos.estabelecimento_destino !== undefined) row.estabelecimento_destino = campos.estabelecimento_destino?.trim().toUpperCase() || null;
  if (campos.distancia_km !== undefined) row.distancia_km = Math.max(0, campos.distancia_km || 0);
  if (campos.ativo !== undefined) row.ativo = campos.ativo;
  const { error } = await supabase.from("tfd_destinos").update(row).eq("id", id);
  return !error;
}

// Exclui um destino (por id). A RLS exige gerir_tfd na org.
export async function excluirDestino(id: string): Promise<boolean> {
  if (!supabase || !id) return false;
  const { error } = await supabase.from("tfd_destinos").delete().eq("id", id);
  return !error;
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
  viagens: Viagem[];               // lista de viagens (cada uma com data + pernoite)
  data_atendimento: string | null; // 1ª data (legado/exibição); a geração usa `viagens`
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
  "id, organizacao_id, cnes, paciente_id, destino_id, distancia_km, competencia, qtd_com_pernoite, qtd_sem_pernoite, viagens, data_atendimento, tem_acompanhante, acompanhante_id, prof_cns, prof_nome, prof_cbo, status, ficha_id, observacoes";

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

// Histórico de TFDs de um paciente (como paciente OU como acompanhante), com destino e total.
export interface TfdHistoricoItem {
  id: string;
  competencia: string;
  cnes: string;
  status: TfdStatus;
  distancia_km: number;
  qtd_com_pernoite: number;
  qtd_sem_pernoite: number;
  destino_descricao: string | null;
  ficha_id: string | null;
  papel: "paciente" | "acompanhante";
  total_rs: number;
}

export async function listarTfdsDoPaciente(pacienteId: string): Promise<TfdHistoricoItem[]> {
  if (!supabase || !pacienteId) return [];
  try {
    const { data, error } = await supabase.from("tfd")
      .select("id, competencia, cnes, status, distancia_km, qtd_com_pernoite, qtd_sem_pernoite, paciente_id, acompanhante_id, ficha_id, tfd_destinos(descricao), tfd_linhas(quantidade, valor_unitario)")
      .or(`paciente_id.eq.${pacienteId},acompanhante_id.eq.${pacienteId}`)
      .order("competencia", { ascending: false }).limit(100);
    if (error || !data) return [];
    return (data as unknown as Array<Record<string, unknown>>).map((r) => {
      const dest = (Array.isArray(r.tfd_destinos) ? r.tfd_destinos[0] : r.tfd_destinos) as { descricao?: string } | null;
      const linhas = (Array.isArray(r.tfd_linhas) ? r.tfd_linhas : []) as { quantidade: number; valor_unitario: number }[];
      return {
        id: r.id as string,
        competencia: r.competencia as string,
        cnes: r.cnes as string,
        status: r.status as TfdStatus,
        distancia_km: Number(r.distancia_km) || 0,
        qtd_com_pernoite: Number(r.qtd_com_pernoite) || 0,
        qtd_sem_pernoite: Number(r.qtd_sem_pernoite) || 0,
        destino_descricao: dest?.descricao ?? null,
        ficha_id: (r.ficha_id as string) ?? null,
        papel: r.paciente_id === pacienteId ? "paciente" : "acompanhante",
        total_rs: linhas.reduce((s, l) => s + (l.quantidade || 0) * Number(l.valor_unitario || 0), 0),
      };
    });
  } catch {
    return [];
  }
}

// Linha detalhada para relatórios (um TFD com tudo que interessa a filtros/agrupamentos).
export interface TfdRelatorioRow {
  id: string;
  competencia: string;
  status: TfdStatus;
  distancia_km: number;
  qtd_com_pernoite: number;
  qtd_sem_pernoite: number;
  data_atendimento: string | null;
  criado_em: string | null;
  paciente_id: string;
  paciente_nome: string | null;
  paciente_cns: string | null;
  acompanhante_nome: string | null;
  destino_descricao: string | null;
  prof_cns: string | null;
  prof_nome: string | null;
  ficha_id: string | null;
  total_rs: number;
}

// Carrega os TFDs de um CNES num intervalo de competências (AAAAMM), para relatórios.
export async function carregarRelatorioTfd(cnes: string, compDe: string, compAte: string): Promise<TfdRelatorioRow[]> {
  if (!supabase || !cnes) return [];
  try {
    let q = supabase.from("tfd")
      .select("id, competencia, status, distancia_km, qtd_com_pernoite, qtd_sem_pernoite, data_atendimento, criado_em, paciente_id, prof_cns, prof_nome, ficha_id, paciente:pacientes!tfd_paciente_id_fkey(nome, cns), acompanhante:pacientes!tfd_acompanhante_id_fkey(nome), tfd_destinos(descricao), tfd_linhas(quantidade, valor_unitario)")
      .eq("cnes", cnes);
    if (compDe) q = q.gte("competencia", compDe);
    if (compAte) q = q.lte("competencia", compAte);
    const { data, error } = await q.order("competencia", { ascending: false }).limit(2000);
    if (error || !data) return [];
    return (data as unknown as Array<Record<string, unknown>>).map((r) => {
      const pac = (Array.isArray(r.paciente) ? r.paciente[0] : r.paciente) as { nome?: string; cns?: string } | null;
      const ac = (Array.isArray(r.acompanhante) ? r.acompanhante[0] : r.acompanhante) as { nome?: string } | null;
      const dest = (Array.isArray(r.tfd_destinos) ? r.tfd_destinos[0] : r.tfd_destinos) as { descricao?: string } | null;
      const linhas = (Array.isArray(r.tfd_linhas) ? r.tfd_linhas : []) as { quantidade: number; valor_unitario: number }[];
      return {
        id: r.id as string,
        competencia: r.competencia as string,
        status: r.status as TfdStatus,
        distancia_km: Number(r.distancia_km) || 0,
        qtd_com_pernoite: Number(r.qtd_com_pernoite) || 0,
        qtd_sem_pernoite: Number(r.qtd_sem_pernoite) || 0,
        data_atendimento: (r.data_atendimento as string) ?? null,
        criado_em: (r.criado_em as string) ?? null,
        paciente_id: r.paciente_id as string,
        paciente_nome: pac?.nome ?? null,
        paciente_cns: pac?.cns ?? null,
        acompanhante_nome: ac?.nome ?? null,
        destino_descricao: dest?.descricao ?? null,
        prof_cns: (r.prof_cns as string) ?? null,
        prof_nome: (r.prof_nome as string) ?? null,
        ficha_id: (r.ficha_id as string) ?? null,
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
// Retorna a mensagem de erro (ou undefined em sucesso).
async function regravarLinhas(tfdId: string, linhas: LinhaValor[]): Promise<string | undefined> {
  if (!supabase) return undefined;
  await supabase.from("tfd_linhas").delete().eq("tfd_id", tfdId);
  const rows = linhas
    .filter((l) => l.quantidade > 0)
    .map((l, i) => ({ tfd_id: tfdId, codigo: l.codigo, quantidade: l.quantidade, para: l.para, valor_unitario: Math.max(0, l.valor_unitario || 0), ordem: i }));
  if (!rows.length) return undefined;
  const { error } = await supabase.from("tfd_linhas").insert(rows);
  return error ? mensagemErroBanco(error) : undefined;
}

export interface SalvarTfdResultado { id: string | null; erro?: string }

// Cria ou atualiza um registro de TFD (e regrava as linhas de valor por paciente, quando
// passadas). Retorna { id } no sucesso, ou { id: null, erro } com o motivo da falha.
export async function salvarTfd(id: string | null, input: TfdInput, linhas?: LinhaValor[]): Promise<SalvarTfdResultado> {
  if (!supabase) return { id: null, erro: "Sistema indisponível." };
  // Viagens (com data por viagem). As contagens e a 1ª data são derivadas delas.
  const viagens: Viagem[] = (input.viagens ?? []).filter((v) => v && v.data);
  const comP = viagens.length ? viagens.filter((v) => v.pernoite === "com").length : Math.max(0, Math.floor(input.qtd_com_pernoite || 0));
  const semP = viagens.length ? viagens.filter((v) => v.pernoite === "sem").length : Math.max(0, Math.floor(input.qtd_sem_pernoite || 0));
  const primeiraData = viagens.length ? [...viagens.map((v) => v.data)].sort()[0] : (input.data_atendimento || null);
  const row = {
    organizacao_id: input.organizacao_id,
    cnes: input.cnes,
    paciente_id: input.paciente_id,
    destino_id: input.destino_id ?? null,
    distancia_km: Math.max(0, input.distancia_km || 0),
    competencia: input.competencia,
    qtd_com_pernoite: comP,
    qtd_sem_pernoite: semP,
    viagens,
    data_atendimento: primeiraData,
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
      if (error) return { id: null, erro: mensagemErroBanco(error) };
    } else {
      const { data, error } = await supabase.from("tfd").insert(row).select("id").single();
      if (error || !data) return { id: null, erro: mensagemErroBanco(error) };
      tfdId = (data as { id: string }).id;
    }
    if (tfdId && linhas) {
      const erroLinhas = await regravarLinhas(tfdId, linhas);
      if (erroLinhas) return { id: tfdId, erro: `TFD salvo, mas os valores não: ${erroLinhas}` };
    }
    return { id: tfdId };
  } catch {
    return { id: null, erro: "Falha inesperada ao salvar o TFD." };
  }
}

export async function atualizarStatusTfd(id: string, status: TfdStatus): Promise<{ ok: boolean; erro?: string }> {
  if (!supabase) return { ok: false, erro: "Sistema indisponível." };
  const { error } = await supabase.from("tfd").update({ status, atualizado_em: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, erro: mensagemErroBanco(error) } : { ok: true };
}

// Exclui um registro de TFD (por id). A RLS exige gerir_tfd no CNES (e reabrir_producao se faturado).
export async function excluirTfd(id: string): Promise<{ ok: boolean; erro?: string }> {
  if (!supabase || !id) return { ok: false, erro: "Sistema indisponível." };
  const { error, count } = await supabase.from("tfd").delete({ count: "exact" }).eq("id", id);
  if (error) return { ok: false, erro: mensagemErroBanco(error) };
  if (!count) return { ok: false, erro: "Nada foi excluído (sem permissão ou TFD travado por faturamento)." };
  return { ok: true };
}

// Carrega um TFD completo (+ paciente e acompanhante já resolvidos) para edição.
export interface TfdEdicao { tfd: TfdRegistro; paciente: Paciente | null; acompanhante: Paciente | null; }
export async function carregarTfd(id: string): Promise<TfdEdicao | null> {
  if (!supabase || !id) return null;
  try {
    const { data, error } = await supabase.from("tfd").select(TFD_COLS).eq("id", id).maybeSingle();
    if (error || !data) return null;
    const tfd = data as unknown as TfdRegistro;
    const ids = [tfd.paciente_id, tfd.acompanhante_id].filter(Boolean) as string[];
    const { data: pacs } = await supabase.from("pacientes").select("*").in("id", ids);
    const map = new Map<string, Paciente>((pacs ?? []).map((p) => [(p as Paciente).id, p as Paciente]));
    return { tfd, paciente: map.get(tfd.paciente_id) ?? null, acompanhante: tfd.acompanhante_id ? map.get(tfd.acompanhante_id) ?? null : null };
  } catch {
    return null;
  }
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
  // Identificação (BPA-I v04.00): um único campo aceita CPF (11) OU CNS (15). PRIORIZA o CPF;
  // se não houver, usa o CNS. O CPF entra ALINHADO À DIREITA no campo de 15 (convenção do v3).
  const cpf = (pessoa.cpf || "").replace(/\D/g, "");
  const cns = (pessoa.cns || "").replace(/\D/g, "");
  s.cnsPac = cpf.length === 11
    ? [...Array(4).fill(""), ...cpf.split("")]
    : cells(cns, 15);
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
  // cpfPac (cauda) fica vazio: a identificação (CPF ou CNS) vai no campo `cnsPac`, como no v3.
  if (pessoa.situacao_rua) s.situacaoRua = pessoa.situacao_rua;
  if (pessoa.email) s.email = pessoa.email;
  if (pessoa.telefone) {
    s.ddd = cells(pessoa.telefone.slice(0, 2), 2);
    s.telefone = cells(pessoa.telefone.slice(2), 8);
  }
  if (dataAtend) s.dataAtend = cells(dataAtend.split("-").reverse().join(""), 8);
}

// Dados relevantes de um TFD para gerar as sequências.
type TfdParaSeq = Pick<TfdRegistro, "distancia_km" | "qtd_com_pernoite" | "qtd_sem_pernoite" | "tem_acompanhante" | "data_atendimento" | "viagens">;

// Gera as sequências BPA-I de UM TFD (paciente + acompanhante), cada uma com demografia
// COMPLETA e caráter de atendimento ELETIVO ("01", sempre, para TFD). Quando há `viagens`
// com datas próprias, gera seqs POR DATA; senão cai no agregado com a data única.
export function montarSeqsTfd(tfd: TfdParaSeq, paciente: Paciente, acompanhante: Paciente | null): SeqData[] {
  const criarSeq = (l: { codigo: string; quantidade: number; para: "paciente" | "acompanhante" }, dataAtend: string | null): SeqData => {
    const s = emptySeq();
    s.codProc = cells(l.codigo, 10);
    s.qtde = cells(String(l.quantidade), 3);
    s.carater = cells("01", 2); // TFD é sempre eletivo
    const pessoa = l.para === "acompanhante" ? acompanhante : paciente;
    if (pessoa) preencherSeqPessoa(s, pessoa, dataAtend);
    return s;
  };

  const viagens = tfd.viagens ?? [];
  if (viagens.length > 0) {
    const grupos = gerarProcedimentosTfdPorData(viagens, tfd.distancia_km, tfd.tem_acompanhante);
    return grupos.flatMap((g) => g.linhas.map((l) => criarSeq(l, g.data)));
  }
  // Legado / sem lista de viagens: agregado com uma data única.
  const linhas = gerarProcedimentosTfd({
    distanciaKm: tfd.distancia_km,
    qtdComPernoite: tfd.qtd_com_pernoite,
    qtdSemPernoite: tfd.qtd_sem_pernoite,
    temAcompanhante: tfd.tem_acompanhante,
  });
  return linhas.map((l) => criarSeq(l, tfd.data_atendimento));
}

// Header do profissional + seqs -> objeto `dados` no shape do BPA-I v2. Cada ficha é UMA FOLHA
// (máx. 3 seqs, como o formulário). `folha` numera a folha (1, 2, ...) no cabeçalho.
function dadosBpaTfd(
  h: { cnes: string; profCns: string | null; profNome: string | null; profCbo: string | null; competencia: string; nomeEstab: string; folha?: number },
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
    profFolha: cells(h.folha ? String(h.folha) : "", 3),
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
      .select("id, cnes, competencia, distancia_km, qtd_com_pernoite, qtd_sem_pernoite, viagens, data_atendimento, tem_acompanhante, paciente_id, acompanhante_id, prof_cns, prof_nome, prof_cbo")
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

    const mm = competencia.slice(4, 6), yyyy = competencia.slice(0, 4);
    const emLotes = <T,>(arr: T[], n: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    let totalSeqs = 0, totalFichas = 0;
    for (const g of grupos.values()) {
      totalSeqs += g.seqs.length;
      // Uma FOLHA (ficha) a cada 3 sequências (formulário BPA-I = 3 seqs/folha).
      const folhas = emLotes(g.seqs, 3);
      // Fichas TFD já existentes desse profissional (idempotência por slot/folha).
      const { data: existentes } = await supabase.from("fichas").select("id")
        .eq("cnes", cnes).eq("competencia", competencia).eq("origem", "tfd").eq("profissional_cns", g.profCns)
        .order("created_at", { ascending: true });
      const idsExist = ((existentes ?? []) as { id: string }[]).map((r) => r.id);

      let primeiraFichaId: string | null = null;
      const total = Math.max(folhas.length, idsExist.length);
      for (let i = 0; i < total; i++) {
        const seqsFolha = i < folhas.length ? folhas[i] : []; // folha extra (dado sumiu) → esvazia
        const dados = dadosBpaTfd({ cnes, profCns: g.profCns, profNome: g.profNome, profCbo: g.profCbo, competencia, nomeEstab, folha: i + 1 }, seqsFolha);
        const payload = {
          titulo: `TFD ${mm}/${yyyy} — ${g.profNome || g.profCns} (folha ${i + 1})`,
          competencia, dados, tipo: "BPA-I", cnes,
          profissional_cns: g.profCns, profissional_nome: g.profNome, origem: "tfd", mes_producao: competencia,
        };
        if (i < idsExist.length) {
          await supabase.from("fichas").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", idsExist[i]);
          if (seqsFolha.length && !primeiraFichaId) primeiraFichaId = idsExist[i];
          if (seqsFolha.length) totalFichas++;
        } else {
          const { data: nova, error: eIns } = await supabase.from("fichas").insert(payload).select("id").single();
          if (!eIns && nova) { if (!primeiraFichaId) primeiraFichaId = (nova as { id: string }).id; totalFichas++; }
        }
      }
      await supabase.from("tfd").update({ status: "faturada", ficha_id: primeiraFichaId, atualizado_em: new Date().toISOString() }).in("id", g.tfdIds);
    }
    return { fichas: totalFichas, tfds: tfds.length, seqs: totalSeqs, semProf };
  } catch {
    return null;
  }
}

// Prévia dos procedimentos faturáveis (sem gravar), para o painel do registro.
export function previaTfd(entrada: EntradaTfd) {
  return gerarProcedimentosTfd(entrada);
}

export { COD_TFD };
