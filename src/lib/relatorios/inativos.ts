import { supabase, buscarTodasPaginado } from "@/lib/supabase";
import { carregarDescricoesCbo } from "@/lib/dashboard-producao";

// Relatório de PROFISSIONAIS INATIVOS / SEM PRODUÇÃO no mês.
//
// "Atende pacientes" = CBO assistencial. O CBO de cada profissional vem do VÍNCULO no CNES
// (tabela `profissional_vinculos`, cache da Edge Function) — um profissional pode ter MAIS
// DE UM CBO na mesma unidade. Assim conseguimos separar quem é da assistência de quem é
// apoio (porteiro, vigia, cozinheiro, limpeza), que aparece no cadastro do CNES mas nunca
// lança produção. Para quem produziu, o CBO da própria produção serve de reforço/fallback.
//
// "Inativo/sem produção" = profissional que produziu na JANELA anterior (ex.: últimos 3–12
// meses) mas está com ZERO produção no mês de referência selecionado; opcionalmente, também
// os cadastrados no CNES que nunca lançaram nada (já filtrados por CBO assistencial).

// Sentinela usada no cache de vínculos para "consultado e sem CBO".
const CBO_NONE = "__NONE__";

// CBOs NÃO assistenciais (não atendem paciente / não lançam BPA). Prefixos da família CBO
// (2002), calibrados com a lista real de vínculos das unidades. Bloqueia por grande-grupo os
// que nunca são assistenciais (1 gestão, 4 administrativo, 6 agro, 7 industrial/motorista,
// 8 industrial, 9 manutenção) + os específicos de serviços (cozinha, limpeza, lavanderia,
// vigilância, portaria, balcão) e alguns do grupo 2/3 (TI, administração, segurança do
// trabalho). NÃO bloqueia: 22xx (médicos, enfermeiros, dentistas, farmacêuticos, fisio,
// nutri, fono, biomédico), 2515/2516 (psicólogo, assistente social), 322x/324x/325x
// (técnicos de saúde), 3522 (agente de saúde), 515x (atendente/aux. de enfermagem/laboratório).
const CBO_NAO_CLINICO: string[] = [
  "1",    // dirigentes / gestão
  "4",    // serviços administrativos (aux. escritório, recepção, faturamento, almoxarife, digitador)
  "6",    // agropecuários
  "7",    // motoristas, construção, produção industrial
  "8",    // industrial
  "9",    // manutenção / reparação / coleta
  "2124", // tecnologia da informação
  "252", "253", "254", // administração, contabilidade, jurídico, comunicação
  "3516", // técnico de segurança do trabalho
  "3731", // programação / mídia
  "5132", "5134", "5135", "5136", // cozinha / copa / alimentação
  "5142", "5143",                 // limpeza / conservação / manutenção predial
  "5163",                         // lavanderia
  "5173", "5174",                 // vigilância / portaria
  "5211", "5212",                 // atendente / balconista comercial
];
export const ehCboClinico = (cbo: string | null | undefined): boolean =>
  !cbo || !CBO_NAO_CLINICO.some((p) => cbo.startsWith(p));

export interface CboItem { codigo: string; descricao: string | null }

export interface ProfInativoRow {
  cns: string;
  nome: string;
  cnes: string;
  nomeUnidade: string;
  cbos: CboItem[];            // CBOs do vínculo (ou o da produção como fallback); pode ter vários
  cboLabel: string;           // rótulo pronto ("" quando não identificado)
  ultimoMes: string | null;   // AAAAMM da produção mais recente na janela (null = nunca produziu)
  qtdPeriodo: number;         // total produzido na janela anterior
  situacao: "sumiu" | "nunca";
}

export interface InativosResultado {
  rows: ProfInativoRow[];
  excluidosNaoClinico: number; // quantos foram tirados por CBO só de apoio
  semCboCount: number;         // quantos ficaram sem CBO identificado
  janelaMeses: string[];       // meses da janela considerada
}

// Meses (AAAAMM) imediatamente ANTES de `comp`, do mais recente para o mais antigo.
function mesesAntes(comp: string, n: number): string[] {
  const y = Number(comp.slice(0, 4)), m = Number(comp.slice(4, 6));
  const d = new Date(y, m - 1, 1);
  const out: string[] = [];
  for (let i = 0; i < n; i++) { d.setMonth(d.getMonth() - 1); out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`); }
  return out;
}

const chavePar = (cns: string, cnes: string) => `${cns}|${cnes}`;
const rotuloCbos = (cbos: CboItem[]) =>
  cbos.map((c) => (c.descricao ? `${c.descricao} (${c.codigo})` : c.codigo)).join(" · ");

// Carrega os CBOs do VÍNCULO (por CNS+CNES) do cache `profissional_vinculos`. Um par pode
// ter vários CBOs. Ignora a sentinela de "sem CBO". Nunca lança.
async function carregarVinculosCbo(pares: { cns: string; cnes: string }[]): Promise<Map<string, CboItem[]>> {
  const map = new Map<string, CboItem[]>();
  if (!supabase || pares.length === 0) return map;
  const cnsList = [...new Set(pares.map((p) => p.cns))];
  const cnesList = [...new Set(pares.map((p) => p.cnes))];
  try {
    // Consulta em blocos de CNS (evita URL gigante); filtra o par exato pela chave depois.
    for (let i = 0; i < cnsList.length; i += 300) {
      const bloco = cnsList.slice(i, i + 300);
      const { data } = await supabase.from("profissional_vinculos")
        .select("cns, cnes, cbo_codigo, cbo_descricao").in("cns", bloco).in("cnes", cnesList);
      for (const r of (data ?? []) as { cns: string; cnes: string; cbo_codigo: string; cbo_descricao: string | null }[]) {
        if (!r.cbo_codigo || r.cbo_codigo === CBO_NONE) continue;
        const k = chavePar(r.cns, r.cnes);
        const arr = map.get(k) ?? [];
        if (!arr.some((c) => c.codigo === r.cbo_codigo)) arr.push({ codigo: r.cbo_codigo, descricao: r.cbo_descricao });
        map.set(k, arr);
      }
    }
  } catch { /* fail-open: sem CBO de vínculo */ }
  return map;
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
  const vazio: InativosResultado = { rows: [], excluidosNaoClinico: 0, semCboCount: 0, janelaMeses: historico };
  if (!supabase || cnesList.length === 0 || !/^\d{6}$/.test(competencia)) return vazio;

  // Produção do mês de referência + da janela anterior, no escopo das unidades.
  // ===== Crivo por CBO ÚNICO na unidade =====
  // Quando UM só profissional do vínculo tem aquele CBO na unidade, a produção lançada com esse
  // CBO mas SEM CNS (típico de BPA-C, que não cita o profissional) é atribuída a ele. Se 2+
  // profissionais compartilham o CBO, não dá para saber quem é → não atribui. Vale só p/ ESTE relatório.
  const cboUnicoOwner = new Map<string, string>(); // "cnes|cbo" -> cns único
  {
    const { data } = await supabase.from("profissional_vinculos")
      .select("cnes, cbo_codigo, cns").in("cnes", cnesList).neq("cbo_codigo", CBO_NONE);
    const porChave = new Map<string, Set<string>>();
    for (const r of (data ?? []) as { cnes: string; cbo_codigo: string; cns: string }[]) {
      const k = `${r.cnes}|${r.cbo_codigo}`;
      const s = porChave.get(k) ?? new Set<string>(); s.add(r.cns); porChave.set(k, s);
    }
    for (const [k, s] of porChave) if (s.size === 1) cboUnicoOwner.set(k, [...s][0]);
  }
  // Donos de uma linha de produção: o CNS lançado (se válido) + o dono do CBO único (se houver).
  const donosDaLinha = (cnsLinha: string, cnes: string | null, cbo: string | null): string[] => {
    const out: string[] = [];
    if (cnsLinha) out.push(cnsLinha);
    const dono = cnes && cbo ? cboUnicoOwner.get(`${cnes}|${cbo}`) : undefined;
    if (dono && !out.includes(dono)) out.push(dono);
    return out;
  };

  // Toda a produção das unidades (qualquer mês) — atribuída por CNS e por CBO único.
  const prod = await buscarTodasPaginado<ProdLinha>((de, ate) =>
    supabase!.from("producao_dashboard")
      .select("profissional_cns, profissional_nome, cbo, cnes, mes_producao, quantidade")
      .in("cnes", cnesList)
      .order("id", { ascending: true }).range(de, ate));

  const ativosNoMes = new Set<string>();
  const janelaSet = new Set(historico);
  type H = { nome: string; cbo: string | null; cnes: string; ultimoMes: string; qtd: number };
  const hist = new Map<string, H>();                                                             // produção NA JANELA (sumiu + qtd período)
  const ultimoGlobal = new Map<string, { mes: string; cbo: string | null; cnes: string }>();     // último mês em QUALQUER tempo
  for (const r of prod) {
    const cnsLinha = (r.profissional_cns ?? "").trim();
    const donos = donosDaLinha(cnsLinha, r.cnes, r.cbo);
    const mes = r.mes_producao ?? "";
    if (donos.length === 0 || !mes) continue;
    const nomeLinha = r.profissional_nome?.trim() || "";
    const cnesLinha = r.cnes || "";
    for (const cns of donos) {
      const g = ultimoGlobal.get(cns);
      if (!g || mes > g.mes) ultimoGlobal.set(cns, { mes, cbo: r.cbo || g?.cbo || null, cnes: cnesLinha || g?.cnes || "" });

      if (mes === competencia) { ativosNoMes.add(cns); continue; }
      if (!janelaSet.has(mes)) continue; // fora da janela: conta só p/ ultimoGlobal
      const cur = hist.get(cns);
      if (!cur) hist.set(cns, { nome: nomeLinha, cbo: r.cbo || null, cnes: cnesLinha, ultimoMes: mes, qtd: r.quantidade || 0 });
      else {
        cur.qtd += r.quantidade || 0;
        if (mes > cur.ultimoMes) { cur.ultimoMes = mes; if (nomeLinha) cur.nome = nomeLinha; if (r.cbo) cur.cbo = r.cbo; if (cnesLinha) cur.cnes = cnesLinha; }
        else { if (!cur.nome && nomeLinha) cur.nome = nomeLinha; if (!cur.cbo && r.cbo) cur.cbo = r.cbo; }
      }
    }
  }

  // Monta os candidatos (ainda sem resolver o CBO do vínculo).
  type Cand = ProfInativoRow & { cboProducao: string | null };
  const candidatos: Cand[] = [];
  for (const [cns, h] of hist) {
    if (ativosNoMes.has(cns)) continue;
    candidatos.push({
      cns, nome: h.nome || cns, cnes: h.cnes, nomeUnidade: nomesUnidade[h.cnes] || h.cnes,
      cbos: [], cboLabel: "", cboProducao: h.cbo, ultimoMes: h.ultimoMes, qtdPeriodo: h.qtd, situacao: "sumiu",
    });
  }
  if (incluirRosterSemProducao) {
    const { data: roster } = await supabase.from("profissionais").select("cns, nome, cnes").in("cnes", cnesList);
    const jaListado = new Set(candidatos.map((c) => c.cns));
    for (const r of (roster ?? []) as { cns: string; nome: string; cnes: string }[]) {
      const cns = (r.cns ?? "").trim();
      if (!cns || ativosNoMes.has(cns) || hist.has(cns) || jaListado.has(cns)) continue;
      jaListado.add(cns);
      // Produziu fora da janela (por CNS ou por CBO único)? → "sumiu" com o último mês real.
      // Só é "nunca" quem não tem produção em NENHUM mês.
      const g = ultimoGlobal.get(cns);
      candidatos.push({
        cns, nome: r.nome?.trim() || cns, cnes: r.cnes, nomeUnidade: nomesUnidade[r.cnes] || r.cnes,
        cbos: [], cboLabel: "", cboProducao: g?.cbo ?? null,
        ultimoMes: g?.mes ?? null, qtdPeriodo: 0, situacao: g ? "sumiu" : "nunca",
      });
    }
  }

  // Nomes que ficaram como o próprio CNS (ex.: produção de BPA-C sem nome) → resolve pelo cadastro.
  const semNome = [...new Set(candidatos.filter((c) => c.nome === c.cns).map((c) => c.cns))];
  if (semNome.length) {
    const nomeDe = new Map<string, string>();
    for (let i = 0; i < semNome.length; i += 300) {
      const { data } = await supabase.from("profissionais").select("cns, nome").in("cns", semNome.slice(i, i + 300));
      for (const r of (data ?? []) as { cns: string; nome: string }[]) if (r.nome && !nomeDe.has(r.cns)) nomeDe.set(r.cns, r.nome.trim());
    }
    for (const c of candidatos) if (c.nome === c.cns && nomeDe.has(c.cns)) c.nome = nomeDe.get(c.cns)!;
  }

  // CBOs do vínculo (por CNS+CNES). Fallback: o CBO carimbado na produção (quem já produziu).
  const vinc = await carregarVinculosCbo(candidatos.map((c) => ({ cns: c.cns, cnes: c.cnes })));
  const faltamDesc: string[] = [];
  for (const c of candidatos) {
    let cbos = vinc.get(chavePar(c.cns, c.cnes)) ?? [];
    if (cbos.length === 0 && c.cboProducao) { cbos = [{ codigo: c.cboProducao, descricao: null }]; faltamDesc.push(c.cboProducao); }
    c.cbos = cbos;
  }
  // Completa descrições que vieram só como código (fallback da produção).
  if (faltamDesc.length) {
    const descs = await carregarDescricoesCbo(faltamDesc);
    for (const c of candidatos) for (const cb of c.cbos) if (!cb.descricao && descs[cb.codigo]) cb.descricao = descs[cb.codigo];
  }

  // Classifica: fica quem tem PELO MENOS UM CBO assistencial, ou quem está sem CBO
  // identificado (para não sumir com quem a base não classificou). Sai quem só tem CBO
  // de apoio (porteiro, vigia, cozinheiro, limpeza…).
  let excluidosNaoClinico = 0, semCboCount = 0;
  const rows: ProfInativoRow[] = [];
  for (const c of candidatos) {
    const temCbo = c.cbos.length > 0;
    const algumClinico = c.cbos.some((cb) => ehCboClinico(cb.codigo));
    if (temCbo && !algumClinico) { excluidosNaoClinico++; continue; }
    if (!temCbo) semCboCount++;
    rows.push({
      cns: c.cns, nome: c.nome, cnes: c.cnes, nomeUnidade: c.nomeUnidade,
      cbos: c.cbos, cboLabel: rotuloCbos(c.cbos), ultimoMes: c.ultimoMes, qtdPeriodo: c.qtdPeriodo, situacao: c.situacao,
    });
  }

  rows.sort((a, b) =>
    (a.situacao === b.situacao ? 0 : a.situacao === "sumiu" ? -1 : 1) ||
    a.nome.localeCompare(b.nome));

  return { rows, excluidosNaoClinico, semCboCount, janelaMeses: historico };
}
