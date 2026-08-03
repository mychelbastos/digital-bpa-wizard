// Overlay da folha oficial do RAAS Psicossocial (Formulario_Raas_PSI.pdf → raas-1/2.png,
// 1654×2339). Espelha o modelo dos outros formulários (APAC/BPA): CAMPOS/CHECKS em % da
// imagem, renderizados pelo FormularioOverlay. Aqui NÃO se digita — a folha é preenchida a
// partir do RaasState (tela em seções) só para gerar o PDF; por isso há também o conversor
// `raasStateParaOverlay`.
//
// IMPORTANTE: as coordenadas abaixo são um ponto de partida APROXIMADO. A posição final é
// calibrada visualmente na própria tela ("Editar posições" → "Copiar coordenadas") e colada
// de volta aqui. Não são posições oficiais deduzidas.
import type { CampoForm as Campo, CheckForm as Check } from "@/components/FormularioOverlay";
import type { RaasState, RaasAcao } from "@/lib/raas/raas-layout";

// 18 ações por folha: 6 na página 1 + 12 na página 2.
export const ACOES_PAGINA_1 = 6;
export const ACOES_PAGINA_2 = 12;
export const ACOES_POR_FOLHA = ACOES_PAGINA_1 + ACOES_PAGINA_2;

// ---- Campos de uma linha de ação (2 sub-linhas: código e executante) ----
// left/width relativos à página; o gerador aplica o `top` de cada linha.
function camposAcao(n: number, topL1: number, topL2: number, pagina: number): Campo[] {
  return [
    { key: `a${n}_cod`, top: topL1, left: 6, width: 40, height: 1.8, celulas: 10, pagina },
    { key: `a${n}_qtd`, top: topL1, left: 49, width: 7, height: 1.8, num: true, maxLen: 6, pagina },
    { key: `a${n}_data`, top: topL1, left: 59, width: 9, height: 1.8, celulas: 4, pagina },
    { key: `a${n}_srv`, top: topL1, left: 71, width: 8, height: 1.8, celulas: 3, pagina },
    { key: `a${n}_cls`, top: topL1, left: 84, width: 10, height: 1.8, celulas: 3, pagina },
    { key: `a${n}_cbo`, top: topL2, left: 6, width: 16, height: 1.8, celulas: 6, pagina },
    { key: `a${n}_cns`, top: topL2, left: 26, width: 45, height: 1.8, celulas: 15, pagina },
  ];
}
function checksAcao(n: number, top: number, pagina: number): Check[] {
  return [
    { key: `a${n}_caps`, top, left: 75, grupo: `a${n}_local`, pagina },
    { key: `a${n}_terr`, top, left: 87, grupo: `a${n}_local`, pagina },
  ];
}

// Gera as N linhas de ação de uma página a partir de um topo-base e um passo vertical.
function linhasAcao(inicio: number, qtd: number, baseTop: number, passo: number, pagina: number): { campos: Campo[]; checks: Check[] } {
  const campos: Campo[] = [];
  const checks: Check[] = [];
  for (let i = 0; i < qtd; i++) {
    const n = inicio + i;
    const topL1 = baseTop + i * passo;
    const topL2 = topL1 + 2.7; // sub-linha do executante (CBO/CNS/local)
    campos.push(...camposAcao(n, topL1, topL2, pagina));
    checks.push(...checksAcao(n, topL2, pagina));
  }
  return { campos, checks };
}

const acoesP1 = linhasAcao(0, ACOES_PAGINA_1, 55.9, 5.95, 1);
const acoesP2 = linhasAcao(ACOES_PAGINA_1, ACOES_PAGINA_2, 9.8, 7.15, 2);

// ---- Cabeçalho / paciente / atendimento (página 1) ----
// Passada de ajuste 1: campos descidos ~0,5% p/ sentarem na LINHA de preenchimento (não sobre
// o rótulo). Ainda aproximado — a posição final é calibrada na tela.
const CAMPOS_CABECALHO: Campo[] = [
  // Identificação do estabelecimento
  { key: "estab_nome", top: 10.3, left: 5.5, width: 61, height: 1.6, upper: true },
  { key: "estab_cnes", top: 10.1, left: 79.5, width: 15, height: 1.6, celulas: 7 },

  // Identificação do usuário
  { key: "prontuario", top: 15.7, left: 5.5, width: 15, height: 1.5, num: true, maxLen: 10 },
  { key: "paciente_nome", top: 15.7, left: 22, width: 72, height: 1.5, upper: true },
  { key: "cns", top: 18.7, left: 5.5, width: 42, height: 1.5, celulas: 15 },
  { key: "nascimento", top: 18.7, left: 61, width: 14, height: 1.5, data: true },
  { key: "nacionalidade", top: 18.7, left: 80, width: 14, height: 1.5, num: true, maxLen: 3 },
  { key: "raca", top: 21.5, left: 5.5, width: 12, height: 1.5, num: true, maxLen: 2 },
  { key: "etnia", top: 21.5, left: 21, width: 20, height: 1.5, num: true, maxLen: 4 },
  { key: "mae", top: 21.5, left: 46, width: 48, height: 1.5, upper: true },
  { key: "responsavel", top: 24.3, left: 5.5, width: 55, height: 1.5, upper: true },
  { key: "municipio", top: 24.3, left: 63, width: 22, height: 1.5, upper: true },
  { key: "uf", top: 24.3, left: 89.5, width: 5, height: 1.5, celulas: 2, letras: true },
  { key: "ibge", top: 27.1, left: 5.5, width: 14, height: 1.5, celulas: 7 },
  { key: "cep", top: 27.1, left: 22, width: 16, height: 1.5, celulas: 8 },
  { key: "endereco", top: 27.1, left: 40, width: 54, height: 1.5, upper: true },
  { key: "complemento", top: 29.9, left: 5.5, width: 38, height: 1.5, upper: true },
  { key: "cel_ddd", top: 29.9, left: 46, width: 5, height: 1.5, celulas: 2 },
  { key: "cel_num", top: 29.9, left: 52, width: 20, height: 1.5, celulas: 9 },
  { key: "contato_ddd", top: 29.9, left: 74, width: 5, height: 1.5, celulas: 2 },
  { key: "contato_num", top: 29.9, left: 80, width: 14, height: 1.5, celulas: 9 },

  // Dados do atendimento
  { key: "admissao", top: 35.7, left: 5.5, width: 15, height: 1.5, data: true },
  { key: "mes_atend", top: 35.7, left: 22, width: 12, height: 1.5, celulas: 6 },
  { key: "autorizacao", top: 35.7, left: 43, width: 30, height: 1.5, celulas: 13 },
  { key: "cid_principal", top: 43.3, left: 5.5, width: 10, height: 1.5, upper: true, celulas: 4, letras: true },
  { key: "cid_principal_desc", top: 43.3, left: 20, width: 74, height: 1.5, upper: true },
  { key: "cid_causas", top: 46.1, left: 5.5, width: 10, height: 1.5, upper: true, celulas: 4, letras: true },
  { key: "cid_causas_desc", top: 46.1, left: 20, width: 74, height: 1.5, upper: true },
  { key: "esf_cnes", top: 48.9, left: 55, width: 16, height: 1.5, celulas: 7 },
];

// ---- Checkboxes (página 1) ----
const CHECKS_CABECALHO: Check[] = [
  { key: "sexo_m", top: 18.7, left: 52, grupo: "sexo" },
  { key: "sexo_f", top: 18.7, left: 56.5, grupo: "sexo" },
  // Usuário de álcool/drogas
  { key: "droga_nao", top: 39.3, left: 6.5, grupo: "droga" },
  { key: "droga_sim", top: 39.3, left: 12, grupo: "droga" },
  { key: "droga_alcool", top: 39.3, left: 35 },
  { key: "droga_crack", top: 39.3, left: 42 },
  { key: "droga_outras", top: 39.3, left: 50 },
  // Origem do paciente (posicional, 01..06)
  { key: "origem_01", top: 38.6, left: 57, grupo: "origem" },
  { key: "origem_02", top: 38.6, left: 70, grupo: "origem" },
  { key: "origem_03", top: 38.6, left: 83, grupo: "origem" },
  { key: "origem_04", top: 40.6, left: 57, grupo: "origem" },
  { key: "origem_05", top: 40.6, left: 70, grupo: "origem" },
  { key: "origem_06", top: 40.6, left: 83, grupo: "origem" },
  // Cobertura ESF
  { key: "esf_sim", top: 48.9, left: 34, grupo: "esf" },
  { key: "esf_nao", top: 48.9, left: 42, grupo: "esf" },
  // Encaminhamento (destino 01..04; Permanência=00 não tem caixa)
  { key: "encam_01", top: 51.3, left: 6, grupo: "encam" },
  { key: "encam_02", top: 51.3, left: 40, grupo: "encam" },
  { key: "encam_03", top: 51.3, left: 74, grupo: "encam" },
  { key: "encam_04", top: 51.3, left: 83, grupo: "encam" },
];

const CAMPOS_DADOS_CONCLUSAO: Campo[] = [
  { key: "conclusao", top: 51.3, left: 90, width: 9, height: 1.5, data: true },
];

export const CAMPOS: Campo[] = [
  ...CAMPOS_CABECALHO,
  ...CAMPOS_DADOS_CONCLUSAO,
  ...acoesP1.campos,
  ...acoesP2.campos,
];

export const CHECKS: Check[] = [
  ...CHECKS_CABECALHO,
  ...acoesP1.checks,
  ...acoesP2.checks,
];

// ---------------- Conversão RaasState → valores do overlay ----------------
type Overlay = { txt: Record<string, string>; chk: Record<string, boolean> };

const soDig = (s: string) => (s || "").replace(/\D/g, "");
// Célula: um caractere por caixa ("2510332" → "2|5|1|0|3|3|2").
const cel = (s: string) => (s || "").split("").join("|");
// Data "YYYY-MM-DD" → "DD|MM|YYYY" (segmentos do campo data). Vazio se incompleto.
function dataDDMMYYYY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}|${m[2]}|${m[1]}` : "";
}
// Data "YYYY-MM-DD" → "D|D|M|M" (célula de 4 caixas, DD/MM da ação). Vazio se incompleto.
function dataDDMM(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[2][0]}|${m[2][1]}|${m[1][0]}|${m[1][1]}` : "";
}

function acaoParaOverlay(a: RaasAcao, n: number, o: Overlay) {
  o.txt[`a${n}_cod`] = cel(soDig(a.procedimento));
  o.txt[`a${n}_qtd`] = soDig(a.quantidade);
  o.txt[`a${n}_data`] = dataDDMM(a.dataExec);
  o.txt[`a${n}_srv`] = cel(soDig(a.servico));
  o.txt[`a${n}_cls`] = cel(soDig(a.classificacao));
  o.txt[`a${n}_cbo`] = cel(soDig(a.cbo));
  o.txt[`a${n}_cns`] = cel(soDig(a.cnsExecutante));
  o.chk[`a${n}_caps`] = a.localRealizacao === "C";
  o.chk[`a${n}_terr`] = a.localRealizacao === "T";
}

export function raasStateParaOverlay(s: RaasState): Overlay {
  const o: Overlay = { txt: {}, chk: {} };

  o.txt.estab_nome = s.estabelecimentoNome || "";
  o.txt.estab_cnes = cel(soDig(s.cnes));

  o.txt.prontuario = soDig(s.prontuario);
  o.txt.paciente_nome = s.nomePaciente || "";
  o.txt.cns = cel(soDig(s.cnsPaciente));
  o.txt.nascimento = dataDDMMYYYY(s.dataNascimento);
  o.txt.nacionalidade = soDig(s.nacionalidade);
  o.txt.raca = soDig(s.raca);
  o.txt.etnia = soDig(s.etnia);
  o.txt.mae = s.nomeMae || "";
  o.txt.responsavel = s.nomeResponsavel || "";
  // Município (nome) e UF (sigla) não são guardados no RaasState — só o código IBGE. Ficam
  // em branco na folha (preenchimento manual/calibração); o IBGE tem caixas próprias.
  o.txt.municipio = "";
  o.txt.uf = "";
  o.txt.ibge = cel(soDig(s.municipioIbge));
  o.txt.cep = cel(soDig(s.cep));
  o.txt.endereco = [s.logradouro, s.numero].filter(Boolean).join(", ");
  o.txt.complemento = s.complemento || "";
  const cel11 = soDig(s.celular);
  o.txt.cel_ddd = cel(cel11.slice(0, 2));
  o.txt.cel_num = cel(cel11.slice(2));
  const con11 = soDig(s.telefone);
  o.txt.contato_ddd = cel(con11.slice(0, 2));
  o.txt.contato_num = cel(con11.slice(2));

  o.txt.mes_atend = cel(/^\d{6}$/.test(s.competencia) ? s.competencia.slice(4) + s.competencia.slice(0, 4) : "");
  o.txt.autorizacao = cel(soDig(s.autorizacao));
  o.txt.cid_principal = cel((s.cidPrincipal || "").toUpperCase());
  o.txt.cid_causas = cel((s.cidCausas || "").toUpperCase());
  o.txt.esf_cnes = cel(soDig(s.cnesEsf));
  o.txt.conclusao = dataDDMMYYYY(s.dataObitoAlta);

  // Checks
  o.chk.sexo_m = s.sexo === "M";
  o.chk.sexo_f = s.sexo === "F";
  o.chk.droga_sim = s.usuarioDroga === "S";
  o.chk.droga_nao = s.usuarioDroga === "N";
  o.chk.droga_alcool = s.tiposDroga.includes("A");
  o.chk.droga_crack = s.tiposDroga.includes("C");
  o.chk.droga_outras = s.tiposDroga.includes("O");
  for (let i = 1; i <= 6; i++) o.chk[`origem_0${i}`] = s.origemPaciente === `0${i}`;
  for (let i = 1; i <= 4; i++) o.chk[`encam_0${i}`] = s.destinoPaciente === `0${i}`;
  o.chk.esf_sim = s.coberturaEsf === "S";
  o.chk.esf_nao = s.coberturaEsf === "N";

  // Ações (até 18 na folha; excedente vai numa folha futura).
  s.acoes.slice(0, ACOES_POR_FOLHA).forEach((a, i) => acaoParaOverlay(a, i, o));

  return o;
}
