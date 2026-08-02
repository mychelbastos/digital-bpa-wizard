// Modelo de dados do RAAS — Registro das Ações Ambulatoriais de Saúde, variante
// ATENÇÃO PSICOSSOCIAL (CAPS). Espelha o layout oficial de exportação do DATASUS
// (Layout_Exportacao_RAAS.pdf, abril/2025):
//   - Linha 01 = cabeçalho do arquivo (gerado no fechamento, NÃO por ficha).
//   - Linha 15 = folha do paciente (identificação/endereço/clínico/social).
//   - Linha 16 = ações (procedimentos SIGTAP executados no período).
// Uma FICHA RAAS = uma folha (linha 15) + N ações (linha 16). Guardamos aqui TODOS os
// campos dos registros 15/16 para que o gerador do arquivo .AAS (fase futura) apenas
// formate — sem remodelar. Datas ficam no estado como "YYYY-MM-DD" (input date) e viram
// "YYYYMMDD" só na exportação; competência como "AAAAMM".
import type { ComboOption } from "@/lib/bpa-i-v2/racas";
import type { Confirmacao } from "@/lib/bpa-i-v2/confirmacao";

export type { ComboOption };

// ---- Tabelas de domínio (exatamente como enumeradas no PDF do layout) ----

// Origem do paciente (ras_origempcn) — obrigatório.
export const RAAS_ORIGEM_PACIENTE: ComboOption[] = [
  { code: "01", label: "Demanda espontânea" },
  { code: "02", label: "Atenção Básica" },
  { code: "03", label: "Serviço de urgência" },
  { code: "04", label: "Outro CAPS" },
  { code: "05", label: "Hospital dia" },
  { code: "06", label: "Hospital psiquiátrico" },
];

// Destino do paciente (ras_dest_paciente) — obrigatório.
export const RAAS_DESTINO_PACIENTE: ComboOption[] = [
  { code: "00", label: "Permanência" },
  { code: "01", label: "Continuidade do acompanhamento em outro CAPS" },
  { code: "02", label: "Continuidade do acompanhamento na Atenção Básica" },
  { code: "03", label: "Alta" },
  { code: "04", label: "Óbito" },
];

// Tipo de droga (ras_usu_tipo_droga) — obrigatório se for usuário de drogas. Até 3.
export const RAAS_TIPO_DROGA: ComboOption[] = [
  { code: "A", label: "Álcool" },
  { code: "C", label: "Crack" },
  { code: "O", label: "Outros" },
];

// Local de realização da ação (ras_local_realizacao) — linha 16.
export const RAAS_LOCAL_REALIZACAO: ComboOption[] = [
  { code: "C", label: "CAPS" },
  { code: "T", label: "Território" },
];

// Origem das informações (ras_org) — linhas 15 e 16.
export const RAAS_ORIGEM_INFO: ComboOption[] = [
  { code: "RAS", label: "RAS — SIA/SUS" },
  { code: "EXT", label: "EXT — outros sistemas" },
];

export const RAAS_SIM_NAO: ComboOption[] = [
  { code: "S", label: "Sim" },
  { code: "N", label: "Não" },
];

// Nacionalidade default (ras_nascpcnte, 3 díg — Anexo VIII PT/MS/SAS 205/96).
// 010 = Brasileiro. O campo é editável (não enumeramos as ~200 nacionalidades).
export const RAAS_NACIONALIDADE_PADRAO = "010";

// ---- Ação (linha 16) ----
// Campos que se repetem da folha (coduf, cmp, codcnes, cnspct, dtiinval, org, cpfpct)
// são herdados da folha na exportação — não precisam ser digitados por ação.
export interface RaasAcao {
  procedimento: string; // ras_acao — SIGTAP 10 díg
  procedimentoNome: string; // só exibição (não exportado)
  cbo: string; // ras_cbo — CBO do executante (6)
  cnsExecutante: string; // ras_cns — CNS do executante (15)
  dataExec: string; // ras_dtexec — "YYYY-MM-DD"
  servico: string; // ras_srv (3)
  classificacao: string; // ras_class (3)
  quantidade: string; // ras_qtd
  localRealizacao: string; // ras_local_realizacao — "C" | "T"
}

export function emptyAcao(): RaasAcao {
  return {
    procedimento: "",
    procedimentoNome: "",
    cbo: "",
    cnsExecutante: "",
    dataExec: "",
    servico: "",
    classificacao: "",
    quantidade: "",
    localRealizacao: "C",
  };
}

// ---- Folha do paciente (linha 15) + estado completo da ficha ----
export interface RaasState {
  // Estabelecimento executante
  cnes: string; // ras_codcnes (7)
  estabelecimentoNome: string; // só exibição
  coduf: string; // ras_coduf — UF IBGE (2). Derivado do município do paciente.
  competencia: string; // ras_cmp — "AAAAMM"

  // Período de validade da folha
  validadeInicio: string; // ras_dtiinval — "YYYY-MM-DD" (obrig)
  validadeFim: string; // ras_dtfimval — "YYYY-MM-DD" (opc)

  // Identificação do paciente (autofill do cadastro compartilhado)
  pacienteId: string | null;
  cnsPaciente: string; // ras_cnspct (15) — CNS; se vazio, usa CPF
  cpfPaciente: string; // ras_cpfpct (11)
  nomePaciente: string; // ras_nomepcnte (30)
  prontuario: string; // ras_npront — RAAS-local (não está no cadastro)
  nomeMae: string; // ras_nomemae (30)
  dataNascimento: string; // ras_datanascim — "YYYY-MM-DD"
  sexo: string; // ras_sexopcnte — "M" | "F"
  raca: string; // ras_raca (01-05)
  etnia: string; // ras_etnia (4) — se raça = 05
  nacionalidade: string; // ras_nascpcnte (3) — default 010
  nomeResponsavel: string; // ras_nomeresp (30)

  // Endereço do paciente
  logradouro: string; // ras_logpcnte (30)
  numero: string; // ras_numpcnte (5)
  complemento: string; // ras_cplpcnte (10)
  bairro: string; // ras_bairro (30)
  cep: string; // ras_ceppcnte (8)
  municipioIbge: string; // ras_munpcnte (7, com DV)
  codLogradouro: string; // ras_cod_logradouro (3)
  telefone: string; // ras_telefone (11)
  celular: string; // ras_celular (11)
  email: string; // ras_email (40)

  // Clínico
  cidPrincipal: string; // pap_cidp (4)
  cidSec1: string; // pap_cids1 (4)
  cidSec2: string; // pap_cids2 (4)
  cidSec3: string; // pap_cids3 (4)
  cidCausas: string; // ras_cidca (4)
  carater: string; // ras_CARATE (01-06) — opc
  origemPaciente: string; // ras_origempcn (01-06) — obrig
  motivoSaida: string; // ras_motsaida (2) — obrig (Portaria 719/2007)
  dataObitoAlta: string; // ras_dtobitoalta — "YYYY-MM-DD" (opc)
  destinoPaciente: string; // ras_dest_paciente (00-04) — obrig

  // Estratégia Saúde da Família
  coberturaEsf: string; // ras_cobertura_ESF — "S" | "N"
  cnesEsf: string; // ras_cnes_esd (7) — se cobertura = S

  // Situação social
  situacaoRua: string; // ras_situacao_rua — "S" | "N"
  usuarioDroga: string; // ras_usu_droga — "S" | "N"
  tiposDroga: string[]; // ras_usu_tipo_droga — subconjunto de A/C/O

  // Autorização / origem
  autorizacao: string; // ras_autorizacao (13)
  origemInfo: string; // ras_org — "RAS" | "EXT"

  // Ações (linha 16)
  acoes: RaasAcao[];

  // Confirmação eletrônica do responsável (mesma do BPA)
  respConfirmacao: Confirmacao | null;
}

// Competência (AAAAMM) do mês atual — pré-preenche a folha.
export function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// UF IBGE (2 díg) = 2 primeiros dígitos do código IBGE do município.
export function ufDeMunicipio(municipioIbge: string): string {
  const dig = (municipioIbge || "").replace(/\D/g, "");
  return dig.length >= 2 ? dig.slice(0, 2) : "";
}

export function emptyRaasState(): RaasState {
  return {
    cnes: "",
    estabelecimentoNome: "",
    coduf: "",
    competencia: competenciaAtual(),
    validadeInicio: "",
    validadeFim: "",
    pacienteId: null,
    cnsPaciente: "",
    cpfPaciente: "",
    nomePaciente: "",
    prontuario: "",
    nomeMae: "",
    dataNascimento: "",
    sexo: "",
    raca: "",
    etnia: "",
    nacionalidade: RAAS_NACIONALIDADE_PADRAO,
    nomeResponsavel: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cep: "",
    municipioIbge: "",
    codLogradouro: "",
    telefone: "",
    celular: "",
    email: "",
    cidPrincipal: "",
    cidSec1: "",
    cidSec2: "",
    cidSec3: "",
    cidCausas: "",
    carater: "",
    origemPaciente: "",
    motivoSaida: "",
    dataObitoAlta: "",
    destinoPaciente: "",
    coberturaEsf: "N",
    cnesEsf: "",
    situacaoRua: "N",
    usuarioDroga: "N",
    tiposDroga: [],
    autorizacao: "",
    origemInfo: "RAS",
    acoes: [emptyAcao()],
    respConfirmacao: null,
  };
}

// Converte "YYYY-MM-DD" (input date) → "YYYY-MM-DD" default do input a partir de
// "YYYY-MM-DD" armazenado. (Mantido simples: o estado já guarda no formato do input.)

// Total de ações preenchidas (ras_total_acoes) — conta ações com procedimento.
export function totalAcoes(acoes: RaasAcao[]): number {
  return acoes.filter((a) => a.procedimento.replace(/\D/g, "").length > 0).length;
}
