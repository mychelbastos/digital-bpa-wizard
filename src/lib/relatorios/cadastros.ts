// Cadastros de pacientes INCOMPLETOS, limitados aos pacientes com ficha no período/unidade.
// Ligação paciente × ficha (sem view/RPC nova; tudo sob a RLS de quem consulta):
//   • BPA-I: cada sequência guarda `pacienteId` (fichas novas) — nas antigas/importadas/TFD,
//     casa pelo CNS ou CPF da sequência com o cadastro.
//   • RAAS: a folha guarda `pacienteId` (ou CNS/CPF do paciente).
// "Fichas afetadas" = fichas do período com pelo menos um paciente de cadastro incompleto.
import { supabase, buscarTodasPaginado } from "@/lib/supabase";
import { pacienteFaltando, type Paciente } from "@/lib/pacientes";

export interface CampoFalta {
  id: string;
  rotulo: string;
  grave: boolean;
}

// Campos exibidos (logradouro + número viram "Endereço"). Grave = trava o envio/é essencial.
export const CAMPOS_FALTA: CampoFalta[] = [
  { id: "documento", rotulo: "CNS ou CPF", grave: true },
  { id: "nascimento", rotulo: "Data de nascimento", grave: true },
  { id: "sexo", rotulo: "Sexo", grave: true },
  { id: "endereco", rotulo: "Endereço (logradouro, número)", grave: false },
  { id: "cep", rotulo: "CEP", grave: false },
  { id: "raca_cor", rotulo: "Raça/cor", grave: false },
  { id: "bairro", rotulo: "Bairro", grave: false },
  { id: "nacionalidade", rotulo: "Nacionalidade", grave: false },
  { id: "municipio_ibge", rotulo: "Município", grave: false },
  { id: "uf", rotulo: "UF", grave: false },
  { id: "nome", rotulo: "Nome", grave: true },
];

export function camposFaltando(p: Partial<Paciente>): string[] {
  const brutos = pacienteFaltando(p);
  const out = new Set<string>();
  for (const f of brutos) {
    if (f.startsWith("documento")) out.add("documento");
    else if (f === "logradouro" || f === "numero") out.add("endereco");
    else out.add(f);
  }
  return CAMPOS_FALTA.map((c) => c.id).filter((id) => out.has(id));
}

export interface PacienteIncompleto {
  paciente: Paciente;
  faltam: string[];
  fichas: number;
  cnesUltima: string | null;
  fichaIds: string[];
}

export interface ResultadoCadastros {
  atendidos: number; // pacientes do cadastro com ficha no período
  semCadastro: number; // referências a pacientes que não estão no cadastro (só inline)
  incompletos: PacienteIncompleto[];
  fichasAfetadas: number;
}

const dig = (v: unknown) => (Array.isArray(v) ? v.join("") : String(v ?? "")).replace(/\D/g, "");
const COLS_PAC =
  "id, organizacao_id, cns, cpf, nome, nome_social, sexo, nascimento, nome_mae, nome_responsavel, responsavel_tipo, data_admissao, prontuario, telefone, email, nacionalidade, raca_cor, etnia, situacao_rua, cod_logradouro, logradouro, numero, complemento, bairro, cep, municipio_ibge, municipio_nome, uf, acompanhante_id";

type FichaLeve = {
  id: string;
  tipo: string;
  cnes: string | null;
  mes_producao: string | null;
  updated_at: string;
  seqs: { pacienteId?: string; cnsPac?: unknown; cpfPac?: unknown; codProc?: unknown }[] | null;
  pid: string | null;
  cnsr: string | null;
  cpfr: string | null;
};

async function emLotes<T>(
  valores: string[],
  tam: number,
  fn: (lote: string[]) => PromiseLike<T[]>,
): Promise<T[]> {
  const lotes: string[][] = [];
  for (let i = 0; i < valores.length; i += tam) lotes.push(valores.slice(i, i + tam));
  const out: T[] = [];
  for (let i = 0; i < lotes.length; i += 4)
    // até 4 lotes ao mesmo tempo
    for (const r of await Promise.all(lotes.slice(i, i + 4).map(fn))) out.push(...r);
  return out;
}

type Ref = { pid?: string; cns?: string; cpf?: string };
type FichaMeta = {
  id: string;
  cnes: string | null;
  mes_producao: string | null;
  updated_at: string;
};

function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  let y = Number(de.slice(0, 4)),
    m = Number(de.slice(4, 6));
  while (`${y}${String(m).padStart(2, "0")}` <= ate && out.length < 60) {
    out.push(`${y}${String(m).padStart(2, "0")}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

// Quem é o paciente de cada atendimento. Caminho rápido: RPC `relatorio_refs_pacientes` (o banco
// devolve só id/CNS/CPF). Se a RPC ainda não existir, lê as fichas mês a mês (em paralelo).
async function carregarRefs(de: string, ate: string, cnesSel: Set<string>) {
  const refsPorFicha = new Map<string, Ref[]>();
  const metas = new Map<string, FichaMeta>();
  type RefRow = {
    ficha_id: string;
    cnes: string | null;
    mes_producao: string | null;
    updated_at: string;
    paciente_id: string | null;
    cns: string | null;
    cpf: string | null;
  };
  let falhou = false;
  const viaRpc = await buscarTodasPaginado<RefRow>(async (lo, hi) => {
    const r = await supabase!
      .rpc(
        "relatorio_refs_pacientes" as never,
        { _de: de, _ate: ate, _cnes: cnesSel.size ? [...cnesSel] : null } as never,
      )
      .range(lo, hi);
    if (r.error) falhou = true;
    return { data: (r.data as unknown as RefRow[] | null) ?? null, error: r.error };
  });
  if (!falhou) {
    for (const r of viaRpc) {
      if (!metas.has(r.ficha_id))
        metas.set(r.ficha_id, {
          id: r.ficha_id,
          cnes: r.cnes,
          mes_producao: r.mes_producao,
          updated_at: r.updated_at,
        });
      const arr = refsPorFicha.get(r.ficha_id) ?? [];
      arr.push({
        pid: r.paciente_id || undefined,
        cns: dig(r.cns) || undefined,
        cpf: dig(r.cpf) || undefined,
      });
      refsPorFicha.set(r.ficha_id, arr);
    }
    return { fichas: [...metas.values()], refsPorFicha };
  }
  const porMes = async (mes: string) =>
    buscarTodasPaginado<FichaLeve>((lo, hi) => {
      let q = supabase!
        .from("fichas")
        .select(
          "id, tipo, cnes, mes_producao, updated_at, seqs:dados->seqs, pid:dados->pacienteId, cnsr:dados->cnsPaciente, cpfr:dados->cpfPaciente",
        )
        .in("tipo", ["BPA-I", "RAAS"])
        .eq("mes_producao", mes)
        .is("excluida_em", null)
        .is("substituida_por", null)
        .order("id", { ascending: true })
        .range(lo, hi);
      if (cnesSel.size) q = q.in("cnes", [...cnesSel]);
      return q as unknown as PromiseLike<{ data: FichaLeve[] | null; error: unknown }>;
    });
  const meses = mesesEntre(de, ate);
  const fichas: FichaLeve[] = [];
  for (let i = 0; i < meses.length; i += 3)
    // 3 meses ao mesmo tempo
    for (const a of await Promise.all(meses.slice(i, i + 3).map(porMes))) fichas.push(...a);
  for (const f of fichas) {
    const refs: Ref[] = [];
    if (f.tipo === "RAAS")
      refs.push({
        pid: f.pid || undefined,
        cns: dig(f.cnsr) || undefined,
        cpf: dig(f.cpfr) || undefined,
      });
    else
      for (const sq of f.seqs ?? []) {
        if (!dig(sq.codProc)) continue;
        refs.push({
          pid: sq.pacienteId || undefined,
          cns: dig(sq.cnsPac) || undefined,
          cpf: dig(sq.cpfPac) || undefined,
        });
      }
    refsPorFicha.set(f.id, refs);
    metas.set(f.id, {
      id: f.id,
      cnes: f.cnes,
      mes_producao: f.mes_producao,
      updated_at: f.updated_at,
    });
  }
  return { fichas: [...metas.values()], refsPorFicha };
}

export async function carregarCadastrosIncompletos(
  de: string,
  ate: string,
  cnesSel: Set<string>,
): Promise<ResultadoCadastros> {
  const vazio: ResultadoCadastros = {
    atendidos: 0,
    semCadastro: 0,
    incompletos: [],
    fichasAfetadas: 0,
  };
  if (!supabase) return vazio;
  const { fichas, refsPorFicha } = await carregarRefs(de, ate, cnesSel);
  const todas = [...refsPorFicha.values()].flat();
  const ids = [...new Set(todas.map((r) => r.pid).filter((x): x is string => !!x))];
  const cnss = [
    ...new Set(todas.filter((r) => !r.pid && r.cns && r.cns.length === 15).map((r) => r.cns!)),
  ];
  const cpfs = [
    ...new Set(
      todas.filter((r) => !r.pid && !r.cns && r.cpf && r.cpf.length === 11).map((r) => r.cpf!),
    ),
  ];

  const sel = (col: string) => (lote: string[]) =>
    supabase!
      .from("pacientes")
      .select(COLS_PAC)
      .in(col, lote)
      .is("excluido_em", null)
      .then(({ data }) => (data ?? []) as unknown as Paciente[]);
  const [porId, porCns, porCpf] = await Promise.all([
    emLotes(ids, 150, sel("id")),
    emLotes(cnss, 150, sel("cns")),
    emLotes(cpfs, 150, sel("cpf")),
  ]);
  const mapaId = new Map<string, Paciente>();
  const mapaCns = new Map<string, Paciente>();
  const mapaCpf = new Map<string, Paciente>();
  for (const p of [...porId, ...porCns, ...porCpf]) {
    mapaId.set(p.id, p);
    if (p.cns) mapaCns.set(dig(p.cns), p);
    if (p.cpf) mapaCpf.set(dig(p.cpf), p);
  }
  const resolver = (r: Ref) =>
    (r.pid && mapaId.get(r.pid)) ||
    (r.cns && mapaCns.get(r.cns)) ||
    (r.cpf && mapaCpf.get(r.cpf)) ||
    null;

  const porPaciente = new Map<
    string,
    { fichas: Set<string>; ultima: { mes: string; up: string; cnes: string | null } | null }
  >();
  let semCadastro = 0;
  const fichaPorId = new Map(fichas.map((f) => [f.id, f]));
  for (const [fid, refs] of refsPorFicha) {
    const f = fichaPorId.get(fid)!;
    for (const r of refs) {
      const p = resolver(r);
      if (!p) {
        semCadastro++;
        continue;
      }
      const e = porPaciente.get(p.id) ?? { fichas: new Set<string>(), ultima: null };
      e.fichas.add(fid);
      const mes = f.mes_producao ?? "",
        up = f.updated_at ?? "";
      if (!e.ultima || mes > e.ultima.mes || (mes === e.ultima.mes && up > e.ultima.up))
        e.ultima = { mes, up, cnes: f.cnes };
      porPaciente.set(p.id, e);
    }
  }

  const incompletos: PacienteIncompleto[] = [];
  const afetadas = new Set<string>();
  for (const [pid, e] of porPaciente) {
    const p = mapaId.get(pid)!;
    const faltam = camposFaltando(p);
    if (faltam.length === 0) continue;
    e.fichas.forEach((f) => afetadas.add(f));
    incompletos.push({
      paciente: p,
      faltam,
      fichas: e.fichas.size,
      cnesUltima: e.ultima?.cnes ?? null,
      fichaIds: [...e.fichas],
    });
  }
  incompletos.sort(
    (a, b) => b.fichas - a.fichas || a.paciente.nome.localeCompare(b.paciente.nome, "pt-BR"),
  );
  return { atendidos: porPaciente.size, semCadastro, incompletos, fichasAfetadas: afetadas.size };
}

// Documento mascarado: CNS 898 •••• •••• 2210 · CPF •••.482.•••-17.
export function documentoMascarado(p: Pick<Paciente, "cns" | "cpf">): string {
  const cns = dig(p.cns);
  if (cns.length === 15) return `CNS ${cns.slice(0, 3)} •••• •••• ${cns.slice(11)}`;
  const cpf = dig(p.cpf);
  if (cpf.length === 11) return `CPF •••.${cpf.slice(3, 6)}.•••-${cpf.slice(9)}`;
  return "Sem CNS e sem CPF";
}
