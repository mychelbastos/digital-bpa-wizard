// Mapeamento entre o cadastro central `pacientes` e a identidade INLINE de uma sequência
// do BPA-I (SeqData). A identidade continua morando no jsonb da ficha (é o snapshot que o
// gerador do .MAR lê e que congela na exportação); estes helpers só copiam de/para o
// cadastro vivo para autofill, "mesmo procedimento", criação-na-hora e re-hidratação.
import { supabase } from "@/lib/supabase";
import type { SeqData } from "@/lib/bpai-v2-layout";
import { acharPacientePorDocumento, salvarPaciente, type Paciente, type PacienteInput } from "@/lib/pacientes";
import { ancorarCharsDireita } from "@/lib/digitos-direita";

const soDig = (v: unknown): string => (Array.isArray(v) ? v.join("") : String(v ?? "")).replace(/\D/g, "");

// Ajusta uma string de dígitos para exatamente n caixinhas (à esquerda, preenchendo à direita).
const digArr = (s: string | null | undefined, n: number): string[] => {
  const d = soDig(s).slice(0, n).split("");
  return [...d, ...Array(Math.max(0, n - d.length)).fill("")];
};

// nascimento "YYYY-MM-DD" -> dataNasc [D,D,M,M,A,A,A,A]. Vazio -> 8 brancos.
const dataIsoParaArr = (iso: string | null | undefined): string[] => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return Array(8).fill("");
  return `${m[3]}${m[2]}${m[1]}`.split("");
};

// dataNasc [D,D,M,M,A,A,A,A] -> "YYYY-MM-DD" ou null se incompleta.
const arrParaDataIso = (arr: string[] | undefined): string | null => {
  const d = soDig(arr);
  if (d.length !== 8) return null;
  const dd = d.slice(0, 2), mm = d.slice(2, 4), yyyy = d.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
};

// Paciente do cadastro -> campos de IDENTIDADE da seq (não toca em procedimento/atendimento).
// Segue as convenções do campo inteligente CPF/CNS: CNS ocupa as 15 caixinhas; quando só há
// CPF, ele fica ancorado à direita nas 15 (igual ao onChangeIdent). cpfPac espelha o CPF.
export function pacienteParaIdentidade(p: Paciente): Partial<SeqData> {
  const cns = soDig(p.cns);
  const cpf = soDig(p.cpf);
  let cnsPac: string[];
  if (cns.length === 15) cnsPac = cns.split("");
  else if (cpf.length === 11) cnsPac = [...Array(4).fill(""), ...cpf.split("")]; // CPF ancorado à direita (15 caixas)
  else cnsPac = Array(15).fill("");

  const telDig = soDig(p.telefone);
  const ddd = telDig.length >= 10 ? telDig.slice(0, 2) : "";
  const tel = telDig.length >= 10 ? telDig.slice(2) : telDig;

  return {
    pacienteId: p.id,
    cnsPac,
    cpfPac: digArr(cpf, 11),
    nomePac: (p.nome ?? "").toUpperCase(),
    sexo: p.sexo === "M" || p.sexo === "F" ? p.sexo : "",
    dataNasc: dataIsoParaArr(p.nascimento),
    nacionalidade: p.nacionalidade || "1",
    racaCor: p.raca_cor ?? "",
    etnia: p.etnia ?? "",
    cep: digArr(p.cep, 8),
    ibge: digArr(p.municipio_ibge, 7),
    codLog: digArr(p.cod_logradouro, 3),
    endereco: (p.logradouro ?? "").toUpperCase(),
    numero: ancorarCharsDireita((p.numero ?? "").replace(/\s/g, ""), 4),
    complemento: (p.complemento ?? "").toUpperCase(),
    bairro: (p.bairro ?? "").toUpperCase(),
    ddd: digArr(ddd, 2),
    telefone: digArr(tel, 8),
    email: p.email ?? "",
    situacaoRua: p.situacao_rua ?? "",
  };
}

// Identidade de uma seq -> PacienteInput para upsert no cadastro. `municipio_nome`/`uf` não
// existem na folha; ficam de fora (o form de cadastro os coleta). Documento: 15 díg. = CNS,
// 11 díg. = CPF; cpfPac (cauda) complementa o CPF quando o campo principal traz o CNS.
export function identidadeParaPacienteInput(s: SeqData, organizacaoId: string): PacienteInput {
  const idd = soDig(s.cnsPac);
  const cpfTail = soDig(s.cpfPac);
  let cns: string | null = null;
  let cpf: string | null = null;
  if (idd.length === 15) cns = idd;
  else if (idd.length === 11) cpf = idd;
  if (!cpf && cpfTail.length === 11) cpf = cpfTail;

  const telDig = soDig(s.ddd) + soDig(s.telefone);

  return {
    organizacao_id: organizacaoId,
    cns,
    cpf,
    nome: (s.nomePac ?? "").trim(),
    sexo: s.sexo === "M" || s.sexo === "F" ? s.sexo : null,
    nascimento: arrParaDataIso(s.dataNasc),
    nacionalidade: s.nacionalidade || null,
    raca_cor: s.racaCor || null,
    etnia: s.etnia || null,
    situacao_rua: s.situacaoRua || null,
    cod_logradouro: soDig(s.codLog) || null,
    logradouro: s.endereco || null,
    numero: (s.numero.join("").trim()) || null,
    complemento: s.complemento || null,
    bairro: s.bairro || null,
    cep: soDig(s.cep) || null,
    municipio_ibge: soDig(s.ibge) || null,
    telefone: telDig || null,
    email: s.email || null,
  };
}

// Campos de PROCEDIMENTO do último atendimento (devolvidos pela RPC ultimo_atendimento_bpai).
export interface UltimoProcedimento {
  procedimento: string; servico: string; classificacao: string; cid: string; carater: string;
}

// Último atendimento BPA-I do paciente pelo MESMO profissional (CNS+CBO). null se não houver
// (ou sem config). A RPC impõe o escopo de organização por dentro e loga a leitura (LGPD).
export async function ultimoAtendimentoBpai(
  pacienteId: string, profCns: string, profCbo: string,
): Promise<UltimoProcedimento | null> {
  if (!supabase || !pacienteId) return null;
  try {
    const { data, error } = await supabase.rpc("ultimo_atendimento_bpai", {
      _paciente_id: pacienteId,
      _prof_cns: profCns.replace(/\D/g, ""),
      _prof_cbo: profCbo.replace(/\D/g, ""),
    });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return data[0] as UltimoProcedimento;
  } catch {
    return null;
  }
}

// Uma seq tem identidade preenchida o bastante para virar cadastro? (nome + documento válido
// em comprimento). Usado pelo save-hook (rede de segurança) para decidir se faz upsert.
export function seqTemIdentidade(s: SeqData): boolean {
  const idd = soDig(s.cnsPac);
  const cpfTail = soDig(s.cpfPac);
  const temDoc = idd.length === 15 || idd.length === 11 || cpfTail.length === 11;
  return Boolean(s.nomePac?.trim()) && temDoc;
}

// Save-hook (REDE DE SEGURANÇA, idempotente): NÃO é o primeiro lugar onde o paciente nasce
// (isso é o picker/criar-na-hora, que já seta o pacienteId). Aqui só reconciliamos seqs que
// têm identidade mas ficaram SEM pacienteId (ex.: digitação manual). Para NUNCA sobrescrever
// um cadastro existente com um nome divergente, a regra é: se o documento já existe, apenas
// LINKA (usa o id); só CRIA quando o documento é inédito. Conflitos/erros são ignorados (a
// seq segue sem id — a identidade inline continua sendo o snapshot). Retorna as seqs
// possivelmente com pacienteId carimbado (mesma referência quando nada muda).
export async function reconciliarPacientesDasSeqs(seqs: SeqData[], organizacaoId: string): Promise<SeqData[]> {
  if (!organizacaoId) return seqs;
  let mudou = false;
  const out = await Promise.all(seqs.map(async (s) => {
    if (s.pacienteId || !seqTemIdentidade(s)) return s;
    try {
      const input = identidadeParaPacienteInput(s, organizacaoId);
      const existente = await acharPacientePorDocumento(organizacaoId, input.cns, input.cpf);
      if (existente) { mudou = true; return { ...s, pacienteId: existente.id }; } // linka, não muta
      const { paciente } = await salvarPaciente({ ...input, origem: "bpa_i" });
      if (paciente) { mudou = true; return { ...s, pacienteId: paciente.id }; }
      return s; // conflito/erro: segue sem id (snapshot inline preservado)
    } catch {
      return s;
    }
  }));
  return mudou ? out : seqs;
}
