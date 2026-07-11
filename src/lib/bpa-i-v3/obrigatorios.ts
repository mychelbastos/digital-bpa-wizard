// Regras de obrigatoriedade do BPA-I v3 (não existem na v2). Bloqueiam Salvar/Gerar
// quando um campo obrigatório está vazio OU incompleto (faltando caracteres).
//
// Opcionais (podem ficar em branco): Equipe, DDD, Telefone, E-mail, CNPJ, Nº da
// Autorização e Complemento (complemento de endereço, ausente na maioria dos casos).
// Serviço/Classificação e CID: obrigatórios só quando o SIGTAP exige p/ o procedimento.
// Todo o resto é obrigatório. Campos de tamanho fixo (identificação, datas, CEP, IBGE)
// precisam estar COMPLETOS.
import type { SeqData } from "@/lib/bpai-v2-layout";
import { dataCompleta } from "@/lib/bpa-i-v2/validacao";
import { RACA_INDIGENA } from "@/lib/bpa-i-v2/racas";
import { identificarPaciente } from "./identificacao";

const vazio = (v: string) => !v || !v.trim();
const digs = (a: string[]) => a.join("").replace(/\D/g, "");

// Campo de tamanho fixo começado mas incompleto (tem ao menos 1 dígito, mas não os n
// esperados) — ex.: data 20/03/202 (7 de 8). Vazio NÃO conta (aí é "obrigatório").
export function parcialIncompleto(arr: string[], n: number): boolean {
  const d = digs(arr).length;
  return d > 0 && d !== n;
}

export interface CabecalhoBpa {
  nomeEstab: string;
  cnes: string[];
  profCns: string[];
  profNome: string;
  profCbo: string[];
  profMes: string[];
  profAno: string[];
  profFolha: string[];
}

// Obrigatórios do cabeçalho (estabelecimento + profissional + competência). Chamar só
// quando houver ao menos uma sequência ativa (senão o formulário vazio acenderia tudo).
export function motivosCabecalho(c: CabecalhoBpa): string[] {
  const m: string[] = [];
  if (vazio(c.nomeEstab)) m.push("Nome do estabelecimento é obrigatório.");
  const cnes = digs(c.cnes);
  if (cnes.length === 0) m.push("CNES é obrigatório.");
  else if (cnes.length !== 7) m.push("CNES incompleto (7 dígitos).");
  const pcns = digs(c.profCns);
  if (pcns.length === 0) m.push("CNS do profissional é obrigatório.");
  else if (pcns.length !== 15) m.push("CNS do profissional incompleto (15 dígitos).");
  if (vazio(c.profNome)) m.push("Nome do profissional é obrigatório.");
  const cbo = digs(c.profCbo);
  if (cbo.length === 0) m.push("CBO é obrigatório.");
  else if (cbo.length !== 6) m.push("CBO incompleto (6 dígitos).");
  if (digs(c.profMes).length !== 2 || digs(c.profAno).length !== 4) m.push("Competência (mês/ano) é obrigatória.");
  if (digs(c.profFolha).length === 0) m.push("Folha é obrigatória.");
  return m;
}

// Identificação do paciente (CPF/CNS) vazia ou incompleta? (não trata o dígito
// verificador — isso é IDENT_MOTIVO no componente). Exposto p/ acender a borda do campo.
export function identificacaoIncompleta(cnsPac: string[]): boolean {
  const d = digs(cnsPac);
  if (d.length === 0) return true; // obrigatória
  return !identificarPaciente(d).completo; // 1–10 ou 12–14 díg. = faltando caracteres
}

// Obrigatórios de uma sequência ATIVA (com procedimento). Não inclui Caráter nem os
// cruzamentos do SIGTAP (esses já vêm do componente), p/ não duplicar mensagens.
export function motivosObrigatoriosSeq(
  s: SeqData,
  opts: { exigeServico: boolean | null; exigeCid: boolean | null },
): string[] {
  const m: string[] = [];

  // Identificação do paciente: obrigatória e completa (CPF 11 ou CNS 15 dígitos).
  const idd = digs(s.cnsPac);
  if (idd.length === 0) m.push("Identificação do paciente (CPF ou CNS) é obrigatória.");
  else if (!identificarPaciente(idd).completo) m.push("Identificação do paciente incompleta — CPF tem 11 e CNS tem 15 dígitos.");

  if (vazio(s.nomePac)) m.push("Nome do paciente é obrigatório.");
  if (s.sexo !== "M" && s.sexo !== "F") m.push("Sexo é obrigatório.");

  // Data de nascimento: obrigatória e completa (8 dígitos).
  if (digs(s.dataNasc).length === 0) m.push("Data de nascimento é obrigatória.");
  else if (!dataCompleta(s.dataNasc)) m.push("Data de nascimento incompleta (faltam dígitos).");

  if (vazio(s.nacionalidade)) m.push("Nacionalidade é obrigatória.");
  if (vazio(s.racaCor)) m.push("Raça/Cor é obrigatória.");
  if (s.racaCor === RACA_INDIGENA && vazio(s.etnia)) m.push("Etnia é obrigatória para Raça/Cor Indígena.");

  // Endereço (Complemento é opcional).
  const cep = digs(s.cep);
  if (cep.length === 0) m.push("CEP é obrigatório.");
  else if (cep.length !== 8) m.push("CEP incompleto (8 dígitos).");
  const ibge = digs(s.ibge);
  if (ibge.length === 0) m.push("Cód. IBGE do município é obrigatório.");
  else if (ibge.length !== 7) m.push("Cód. IBGE do município incompleto (7 dígitos).");
  if (digs(s.codLog).length === 0) m.push("Cód. do logradouro é obrigatório.");
  if (vazio(s.endereco)) m.push("Endereço é obrigatório.");
  if (vazio(s.numero.join(""))) m.push("Número do endereço é obrigatório (use SN se não houver).");
  if (vazio(s.bairro)) m.push("Bairro é obrigatório.");

  // Data do atendimento: obrigatória e completa.
  if (digs(s.dataAtend).length === 0) m.push("Data do atendimento é obrigatória.");
  else if (!dataCompleta(s.dataAtend)) m.push("Data do atendimento incompleta (faltam dígitos).");

  if ((Number(digs(s.qtde)) || 0) <= 0) m.push("Quantidade é obrigatória.");

  // Serviço/Classificação e CID: obrigatórios só quando o SIGTAP exige (fail-open no null).
  if (opts.exigeServico === true && (digs(s.servico).length !== 3 || digs(s.classProc).length !== 3))
    m.push("Serviço e Classificação são obrigatórios para este procedimento (SIGTAP).");
  if (opts.exigeCid === true && s.cid.join("").trim().length < 3)
    m.push("CID é obrigatório para este procedimento (SIGTAP).");

  return m;
}
