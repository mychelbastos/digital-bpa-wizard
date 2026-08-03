// Parser do arquivo .AAS (RAAS — variante Atenção Psicossocial / CAPS) exportado do SIA/DATASUS.
//
// LAYOUT DECODIFICADO A PARTIR DOS ARQUIVOS REAIS do município (AA292720.*), validado em
// 1.243 folhas + 3.651 ações (todos os offsets sanidade-checados: datas, sexo, C/T, CNS,
// SIGTAP, flags S/N). NÃO é deduzido — é o que os arquivos reais contêm.
//
// Registros separados por CRLF. Codificação Latin-1 (ISO-8859-1). Três tipos de registro:
//   01 (144) = cabeçalho do arquivo (órgão, competência, CNPJ) — 1 por arquivo.
//   15 (406) = folha do paciente — 1 por ficha.
//   16 (110) = ação/procedimento — N por ficha, ligadas à folha pela chave
//              (coduf + competência + CNES + CNS do paciente + início da validade).
import { emptyRaasState, emptyAcao, type RaasState, type RaasAcao } from "@/lib/raas/raas-layout";

// ---- Offsets (índices 0-based, [início, fim)) ----
// Linha 15 — folha do paciente
const L15 = {
  coduf: [2, 4], cmp: [4, 10], cnes: [10, 17], cnsPac: [17, 32],
  dtIniVal: [32, 40], dtFimVal: [40, 48], nomePac: [48, 78], prontuario: [78, 88],
  nomeMae: [88, 118], bairro: [118, 148], numero: [148, 153], complemento: [153, 163],
  cep: [163, 171], municipio: [171, 178], dtNasc: [178, 186], sexo: [186, 187],
  raca: [187, 189], nomeResp: [189, 219], nacionalidade: [219, 222], etnia: [222, 226],
  telefone: [226, 237], celular: [237, 248], /* [248,258] fixo "21" — ignorado */
  cidPrincipal: [258, 262], cidSec1: [262, 266], cidSec2: [266, 270], cidSec3: [270, 274],
  cidCausas: [274, 278], origemPaciente: [278, 280], destinoPaciente: [280, 282],
  coberturaEsf: [282, 283], cnesEsf: [283, 290], /* [290,297] código de equipe ESF — ignorado */
  org: [297, 300], situacaoRua: [300, 301], usuarioDroga: [301, 302], tipoDroga: [302, 305],
  autorizacao: [305, 318], logradouro: [318, 348], codLogradouro: [348, 351],
  email: [351, 391], cpf: [391, 402], /* [402,406] dígito de controle */
} as const;

// Linha 16 — ação
const L16 = {
  coduf: [2, 4], cmp: [4, 10], cnes: [10, 17], cnsPac: [17, 32], dtIniVal: [32, 40],
  procedimento: [40, 50], cbo: [50, 56], cnsExec: [56, 71], dtExec: [71, 79],
  servico: [79, 82], classificacao: [82, 85], quantidade: [85, 91], org: [91, 94],
  local: [94, 95], /* [95,110] filler + dígito de controle */
} as const;

type Faixa = readonly [number, number];
const sub = (s: string, [a, b]: Faixa) => s.slice(a, b);
const T = (s: string, f: Faixa) => sub(s, f).trim();
// Número: remove tudo que não é dígito; zeros-só viram "".
const N = (s: string, f: Faixa) => {
  const d = sub(s, f).replace(/\D/g, "");
  return /^0+$/.test(d) ? "" : d;
};
// "AAAAMMDD" → "AAAA-MM-DD" (vazio se não for data completa).
function dataIso(aaaammdd: string): string {
  const d = aaaammdd.trim();
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
}
// Chave que liga ação → folha = competência + CNES + CNS do paciente (identifica o paciente
// no mês). NÃO inclui o início da validade: nos arquivos reais há folhas cujo dtiinval difere
// em 1 dia do dtiinval gravado nas ações do mesmo paciente (inconsistência da origem), o que
// deixaria ações órfãs se a chave fosse estrita. Validado: 0 órfãos nos 6 arquivos reais.
const chave15 = (s: string) => sub(s, L15.cmp) + sub(s, L15.cnes) + sub(s, L15.cnsPac);
const chave16 = (s: string) => sub(s, L16.cmp) + sub(s, L16.cnes) + sub(s, L16.cnsPac);

function acaoDeLinha16(s: string): RaasAcao {
  return {
    ...emptyAcao(),
    procedimento: N(s, L16.procedimento),
    procedimentoNome: "",
    cbo: T(s, L16.cbo),
    cnsExecutante: N(s, L16.cnsExec),
    dataExec: dataIso(sub(s, L16.dtExec)),
    servico: T(s, L16.servico),
    classificacao: T(s, L16.classificacao),
    quantidade: N(s, L16.quantidade),
    localRealizacao: (sub(s, L16.local).trim() || "C"),
  };
}

function folhaDeLinha15(s: string, acoes: RaasAcao[]): RaasState {
  const cobertura = sub(s, L15.coberturaEsf).trim().toUpperCase();
  const tipos = sub(s, L15.tipoDroga).toUpperCase().split("").filter((c) => "ACO".includes(c));
  const municipio = N(s, L15.municipio); // 6 dígitos no arquivo (IBGE sem DV)
  return {
    ...emptyRaasState(),
    cnes: N(s, L15.cnes),
    coduf: T(s, L15.coduf),
    competencia: T(s, L15.cmp),
    validadeInicio: dataIso(sub(s, L15.dtIniVal)),
    validadeFim: dataIso(sub(s, L15.dtFimVal)),
    cnsPaciente: N(s, L15.cnsPac),
    cpfPaciente: N(s, L15.cpf),
    nomePaciente: T(s, L15.nomePac),
    prontuario: N(s, L15.prontuario),
    nomeMae: T(s, L15.nomeMae),
    dataNascimento: dataIso(sub(s, L15.dtNasc)),
    sexo: T(s, L15.sexo).toUpperCase(),
    raca: T(s, L15.raca),
    etnia: T(s, L15.etnia),
    nacionalidade: T(s, L15.nacionalidade),
    nomeResponsavel: T(s, L15.nomeResp),
    logradouro: T(s, L15.logradouro),
    numero: T(s, L15.numero),
    complemento: T(s, L15.complemento),
    bairro: T(s, L15.bairro),
    cep: N(s, L15.cep),
    municipioIbge: municipio,
    codLogradouro: T(s, L15.codLogradouro),
    telefone: N(s, L15.telefone),
    celular: N(s, L15.celular),
    email: T(s, L15.email),
    cidPrincipal: T(s, L15.cidPrincipal).toUpperCase(),
    cidSec1: T(s, L15.cidSec1).toUpperCase(),
    cidSec2: T(s, L15.cidSec2).toUpperCase(),
    cidSec3: T(s, L15.cidSec3).toUpperCase(),
    cidCausas: T(s, L15.cidCausas).toUpperCase(),
    origemPaciente: T(s, L15.origemPaciente),
    destinoPaciente: T(s, L15.destinoPaciente),
    coberturaEsf: cobertura === "S" || cobertura === "N" ? cobertura : "N",
    cnesEsf: N(s, L15.cnesEsf),
    situacaoRua: sub(s, L15.situacaoRua).trim().toUpperCase() || "N",
    usuarioDroga: sub(s, L15.usuarioDroga).trim().toUpperCase() || "N",
    tiposDroga: tipos,
    autorizacao: N(s, L15.autorizacao),
    origemInfo: T(s, L15.org) || "RAS",
    acoes: acoes.length ? acoes : [emptyAcao()],
  };
}

export interface AasImportado {
  competencia: string; // AAAAMM do cabeçalho (ou da primeira folha)
  orgaoNome: string; // nome do estabelecimento no cabeçalho (linha 01)
  fichas: RaasState[];
  avisos: string[];
}

// Faz o parse de um arquivo .AAS inteiro (conteúdo Latin-1 já decodificado em string).
export function parseAas(texto: string): AasImportado {
  const linhas = texto.split(/\r\n|\r|\n/).filter((l) => l.length > 0);
  const avisos: string[] = [];

  const cabecalho = linhas.find((l) => l.startsWith("01"));
  const competencia = cabecalho ? cabecalho.slice(7, 13) : "";
  const orgaoNome = cabecalho ? cabecalho.slice(23, 53).trim() : "";

  const r15 = linhas.filter((l) => l.startsWith("15"));
  const r16 = linhas.filter((l) => l.startsWith("16"));

  // Agrupa ações por chave da folha.
  const acoesPorChave = new Map<string, RaasAcao[]>();
  for (const l of r16) {
    if (l.length < 95) { avisos.push(`Ação com tamanho inesperado (${l.length}) ignorada.`); continue; }
    const k = chave16(l);
    (acoesPorChave.get(k) ?? acoesPorChave.set(k, []).get(k)!).push(acaoDeLinha16(l));
  }

  const fichas: RaasState[] = [];
  const chavesVistas = new Set<string>();
  for (const l of r15) {
    if (l.length < 402) { avisos.push(`Folha com tamanho inesperado (${l.length}) ignorada.`); continue; }
    const k = chave15(l);
    // A chave (CNS+início da validade+CNES+competência) identifica a folha. Registros 15
    // repetidos são duplicatas da origem — mantém o primeiro para não duplicar as ações.
    if (chavesVistas.has(k)) { avisos.push(`Folha duplicada de ${T(l, L15.nomePac) || "(sem nome)"} ignorada.`); continue; }
    chavesVistas.add(k);
    const acoes = acoesPorChave.get(k) ?? [];
    if (acoes.length === 0) avisos.push(`Folha de ${T(l, L15.nomePac) || "(sem nome)"} sem ações vinculadas.`);
    fichas.push(folhaDeLinha15(l, acoes));
  }

  const usadas = new Set(r15.map(chave15));
  const orfas = [...acoesPorChave.keys()].filter((k) => !usadas.has(k)).length;
  if (orfas > 0) avisos.push(`${orfas} grupo(s) de ações sem folha correspondente.`);

  return { competencia, orgaoNome, fichas, avisos };
}
