// Motivos de exclusão de paciente (soft-delete). O motivo enviado à RPC começa com um TOKEN
// ASCII estável ("OBITO", "TRANSFERENCIA", ...) para que o banco detecte óbito por prefixo,
// sem depender de acento. Regra: óbito → qualquer um com permissão exclui; demais → só master.
export interface MotivoExclusao {
  token: string;   // prefixo estável no texto gravado (sem acento)
  label: string;   // rótulo exibido
  soMaster: boolean; // true = só o master (super-admin) pode usar
}

export const MOTIVOS_EXCLUSAO: MotivoExclusao[] = [
  { token: "OBITO", label: "Óbito", soMaster: false },
  { token: "TRANSFERENCIA", label: "Transferência para outro município", soMaster: true },
  { token: "DUPLICADO", label: "Cadastro duplicado", soMaster: true },
  { token: "ERRO", label: "Erro de cadastro / digitação", soMaster: true },
  { token: "OUTRO", label: "Outro", soMaster: true },
];

// Monta o texto do motivo gravado: "TOKEN — Rótulo" (+ ": detalhe" quando houver).
export function montarMotivo(m: MotivoExclusao, detalhe?: string): string {
  const base = `${m.token} — ${m.label}`;
  const d = (detalhe || "").trim();
  return d ? `${base}: ${d}` : base;
}
