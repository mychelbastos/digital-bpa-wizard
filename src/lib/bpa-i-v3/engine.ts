// Motor do BPA-I (headless). Extraído de src/routes/bpa-i-v3.tsx SEM mudança de comportamento
// para ser a ÚNICA fonte de verdade compartilhada entre o V3 (tela oficial) e o V4 (tela nova
// de proposta). Regra: V3 e V4 produzem exatamente o mesmo `dados.seqs` e o mesmo `.MAR` — a
// equivalência é travada por src/lib/bpa-i-v3/equivalencia.golden.test.ts.
//
// Fatia 1 (este commit): tipos + constantes + helpers puros de estado. O hook useBpaIEngine
// (efeitos + save + ações de seq) vem nas fatias seguintes, também por movimento mecânico.
import { emptySeq, type SeqData } from "@/lib/bpai-v2-layout";
import { ancorarCharsDireita } from "@/lib/digitos-direita";
import type { Confirmacao } from "@/lib/bpa-i-v2/confirmacao";

export const STORAGE_KEY = "bpa-i-v3-state-v1";

// Campos de IDENTIFICAÇÃO DO PACIENTE (não os do procedimento/atendimento) — usados pelo
// botão "repetir paciente" da sequência seguinte, quando o mesmo paciente tem mais de um
// procedimento na folha.
export const CAMPOS_PACIENTE: (keyof SeqData)[] = [
  "cnsPac", "nomePac", "sexo", "dataNasc", "nacionalidade", "racaCor", "etnia",
  "cep", "ibge", "codLog", "endereco", "numero", "complemento", "bairro",
  "ddd", "telefone", "email", "cpfPac", "situacaoRua",
];

// Estado completo de uma ficha BPA-I na tela (cabeçalho + sequências + rodapé). É exatamente
// o que se grava em `fichas.dados` — por isso V3 e V4 compartilham este mesmo shape.
export interface State {
  nomeEstab: string;
  cnes: string[];
  profCns: string[];
  profNome: string;
  profCbo: string[];
  profMes: string[];
  profAno: string[];
  profEquipe: string;
  profFolha: string[];
  seqs: SeqData[];
  respConfirmacao: Confirmacao | null;
  respData: string[];
  gestCarimbo: string;
  gestRubrica: string;
  gestData: string[];
}

// Preenche uma string em exatamente n células (index → char), completando com "".
export const cells = (s: string, n: number): string[] => Array.from({ length: n }, (_, i) => s[i] ?? "");

// Mês/Ano da competência atual (preenchidos por padrão; o usuário pode alterar).
export const competenciaAtual = () => {
  const agora = new Date();
  return {
    mes: String(agora.getMonth() + 1).padStart(2, "0").split(""),
    ano: String(agora.getFullYear()).padStart(4, "0").split(""),
  };
};

// Data de hoje como 8 dígitos [D,D,M,M,A,A,A,A] — pré-preenche o campo Data do rodapé.
export const hojeDigits = (): string[] => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aaaa = String(d.getFullYear()).padStart(4, "0");
  return `${dd}${mm}${aaaa}`.split("");
};

export const initialState = (): State => ({
  nomeEstab: "",
  cnes: Array(7).fill(""),
  profCns: Array(15).fill(""),
  profNome: "",
  profCbo: Array(6).fill(""),
  profMes: competenciaAtual().mes,
  profAno: competenciaAtual().ano,
  profEquipe: "",
  profFolha: Array(3).fill(""),
  seqs: [emptySeq(), emptySeq(), emptySeq()],
  respConfirmacao: null,
  respData: hojeDigits(),
  gestCarimbo: "",
  gestRubrica: "",
  gestData: hojeDigits(),
});

// Ajusta um vetor de dígitos para exatamente n posições, justificado à direita
// (mantém os dígitos preenchidos, alinhados à direita; descarta excedente à esquerda).
export function rjust(arr: string[] | undefined, n: number): string[] {
  const digs = (arr ?? []).filter(Boolean).slice(-n);
  return [...Array(Math.max(0, n - digs.length)).fill(""), ...digs];
}

// Migração: campo Número (endereço) — 4 caixinhas alfanuméricas ("SN" de "sem número"),
// ancoradas à DIREITA (estilo calculadora). Aceita array antigo (à esquerda ou com
// espaços de importação) ou texto livre; remove espaços e mantém os últimos 4 caracteres.
export function migrarNumero(v: unknown): string[] {
  const raw = Array.isArray(v) ? (v as string[]).join("") : String(v ?? "");
  return ancorarCharsDireita(raw.replace(/\s/g, ""), 4);
}

// Garante 3 sequências (o formulário renderiza 3 fixas) e blinda campos ausentes. Fichas
// importadas ou geradas (TFD) podem ter < 3 seqs — sem isto o render acessaria state.seqs[si]
// indefinido e a página quebraria. Também aplica a migração de Quantidade (6->3 díg.).
export function normalizarSeqs3(seqs: SeqData[] | undefined): SeqData[] {
  const base = seqs ?? [];
  const arr = base.length >= 3 ? base : [...base, ...Array.from({ length: 3 - base.length }, emptySeq)];
  return arr.map((s) => ({ ...emptySeq(), ...s, qtde: rjust((s?.qtde ?? []), 3), numero: migrarNumero(s?.numero ?? []) }));
}

export function loadState(): State {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const merged = { ...initialState(), ...(JSON.parse(raw) as Partial<State>) };
    merged.seqs = normalizarSeqs3(merged.seqs);
    return merged;
  } catch {
    return initialState();
  }
}
