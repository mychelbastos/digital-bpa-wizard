import { supabase, buscarTodasPaginado } from "@/lib/supabase";
import { carregarDescricoesCbo } from "@/lib/dashboard-producao";

// Relatório de PROFISSIONAIS INATIVOS / SEM PRODUÇÃO no mês.
//
// Fonte de "quem atende pacientes": o HISTÓRICO DE PRODUÇÃO. Quem já lançou BPA é, por
// construção, um profissional assistencial — e o CBO (ocupação) vem carimbado em cada linha
// da produção. Porteiro/vigia/cozinheiro nunca lançam BPA, então não entram nessa base.
// (O cadastro do CNES em tabela — `profissionais` — só tem nome/CNS, sem CBO; por isso não
// dá para classificar a ocupação de quem nunca produziu. Esses ficam numa seção à parte,
// marcados como "CBO não identificado", só quando o usuário pedir.)
//
// "Inativo/sem produção" = profissional que produziu na JANELA anterior (ex.: últimos 3–12
// meses) mas está com ZERO produção no mês de referência selecionado.

// CBOs claramente NÃO assistenciais (não atendem paciente) — defesa extra caso um código
// desses apareça na produção por lançamento errado. Prefixos da família CBO (2002).
const CBO_NAO_CLINICO: string[] = [
  "5174", // porteiros, vigias e afins
  "5173", // vigilantes e guardas de segurança
  "5132", // cozinheiros
  "5134", // garçons, copeiros e afins
  "5143", // trab. de limpeza / auxiliar de serviços gerais / servente
  "7823", // motoristas de veículos de transporte
  "9922", // coletores de lixo / serventes
  "6220", // trabalhadores agrícolas
  "9101", // trabalhadores de conservação/manutenção de edifícios
  "7170", // trab. da construção (pedreiro, pintor)
];
export const ehCboClinico = (cbo: string | null | undefined): boolean =>
  !cbo || !CBO_NAO_CLINICO.some((p) => cbo.startsWith(p));

export interface ProfInativoRow {
  cns: string;
  nome: string;
  cnes: string;
  nomeUnidade: string;
  cbo: string | null;
  cboDesc: string | null;
  ultimoMes: string | null;   // AAAAMM da produção mais recente na janela (null = nunca produziu)
  qtdPeriodo: number;         // total produzido na janela anterior
  situacao: "sumiu" | "nunca";
}

export interface InativosResultado {
  rows: ProfInativoRow[];
  excluidosNaoClinico: number; // quantos foram tirados por CBO não assistencial
  janelaMeses: string[];       // meses da janela considerada (rótulo)
}

// Meses (AAAAMM) imediatamente ANTES de `comp`, do mais recente para o mais antigo.
function mesesAntes(comp: string, n: number): string[] {
  const y = Number(comp.slice(0, 4)), m = Number(comp.slice(4, 6));
  const d = new Date(y, m - 1, 1);
  const out: string[] = [];
  for (let i = 0; i < n; i++) { d.setMonth(d.getMonth() - 1); out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`); }
  return out;
}

interface ProdLinha { profissional_cns: string | null; profissional_nome: string | null; cbo: string | null; cnes: string | null; mes_producao: string | null; quantidade: number }

export async function carregarInativos(opts: {
  cnesList: string[];
  nomesUnidade: Record<string, string>;
  competencia: string;
  janelaMeses: number;
  incluirRosterSemProducao: boolean;
}): Promise<InativosResultado> {
  const { competencia, janelaMeses, nomesUnidade, incluirRosterSemProducao } = opts;
  const cnesList = [...new Set(opts.cnesList.filter(Boolean))];
  const historico = mesesAntes(competencia, janelaMeses);
  const vazio: InativosResultado = { rows: [], excluidosNaoClinico: 0, janelaMeses: historico };
  if (!supabase || cnesList.length === 0 || !/^\d{6}$/.test(competencia)) return vazio;

  // Produção do mês de referência + da janela anterior, no escopo das unidades.
  const meses = [competencia, ...historico];
  const prod = await buscarTodasPaginado<ProdLinha>((de, ate) =>
    supabase!.from("producao_dashboard")
      .select("profissional_cns, profissional_nome, cbo, cnes, mes_producao, quantidade")
      .in("cnes", cnesList).in("mes_producao", meses)
      .order("id", { ascending: true }).range(de, ate));

  // Quem produziu no MÊS DE REFERÊNCIA (qualquer unidade das consideradas) = ativo.
  const ativosNoMes = new Set<string>();
  // Agregado do HISTÓRICO por profissional (CNS).
  type H = { nome: string; cbo: string | null; cnes: string; ultimoMes: string; qtd: number };
  const hist = new Map<string, H>();
  for (const r of prod) {
    const cns = (r.profissional_cns ?? "").trim();
    if (!cns) continue;
    if (r.mes_producao === competencia) { ativosNoMes.add(cns); continue; }
    // linha da janela anterior
    const cur = hist.get(cns);
    const mes = r.mes_producao ?? "";
    if (!cur) {
      hist.set(cns, { nome: r.profissional_nome?.trim() || "", cbo: r.cbo || null, cnes: r.cnes || "", ultimoMes: mes, qtd: r.quantidade || 0 });
    } else {
      cur.qtd += r.quantidade || 0;
      // Mantém o dado mais RECENTE (maior mês) para nome/cbo/unidade.
      if (mes > cur.ultimoMes) { cur.ultimoMes = mes; if (r.profissional_nome?.trim()) cur.nome = r.profissional_nome.trim(); if (r.cbo) cur.cbo = r.cbo; if (r.cnes) cur.cnes = r.cnes; }
      else { if (!cur.nome && r.profissional_nome?.trim()) cur.nome = r.profissional_nome.trim(); if (!cur.cbo && r.cbo) cur.cbo = r.cbo; }
    }
  }

  const candidatos: ProfInativoRow[] = [];
  // 1) Assistenciais que SUMIRAM: produziram na janela, zero no mês de referência.
  for (const [cns, h] of hist) {
    if (ativosNoMes.has(cns)) continue;
    candidatos.push({
      cns, nome: h.nome || cns, cnes: h.cnes, nomeUnidade: nomesUnidade[h.cnes] || h.cnes,
      cbo: h.cbo, cboDesc: null, ultimoMes: h.ultimoMes, qtdPeriodo: h.qtd, situacao: "sumiu",
    });
  }

  // 2) (Opcional) Cadastrados no CNES que NUNCA lançaram produção — CBO desconhecido.
  if (incluirRosterSemProducao) {
    const { data: roster } = await supabase.from("profissionais").select("cns, nome, cnes").in("cnes", cnesList);
    const jaListado = new Set(candidatos.map((c) => c.cns));
    for (const r of (roster ?? []) as { cns: string; nome: string; cnes: string }[]) {
      const cns = (r.cns ?? "").trim();
      if (!cns || ativosNoMes.has(cns) || hist.has(cns) || jaListado.has(cns)) continue;
      jaListado.add(cns);
      candidatos.push({
        cns, nome: r.nome?.trim() || cns, cnes: r.cnes, nomeUnidade: nomesUnidade[r.cnes] || r.cnes,
        cbo: null, cboDesc: null, ultimoMes: null, qtdPeriodo: 0, situacao: "nunca",
      });
    }
  }

  // Filtra CBOs não assistenciais (só afeta quem tem CBO conhecido).
  const antes = candidatos.length;
  const filtrados = candidatos.filter((c) => ehCboClinico(c.cbo));
  const excluidosNaoClinico = antes - filtrados.length;

  // Descrições de CBO.
  const descs = await carregarDescricoesCbo(filtrados.map((c) => c.cbo).filter((c): c is string => !!c));
  for (const c of filtrados) c.cboDesc = c.cbo ? (descs[c.cbo] || null) : null;

  // Ordena: SUMIU primeiro (mais relevante), depois nome.
  filtrados.sort((a, b) =>
    (a.situacao === b.situacao ? 0 : a.situacao === "sumiu" ? -1 : 1) ||
    a.nome.localeCompare(b.nome));

  return { rows: filtrados, excluidosNaoClinico, janelaMeses: historico };
}
