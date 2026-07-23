// Traduz erros do Postgres/PostgREST para mensagens claras em PT-BR, para a UI sempre
// explicar o MOTIVO de uma falha (em vez de só "Falha ao salvar").
export interface ErroBanco { message?: string; code?: string; details?: string; hint?: string }

export function mensagemErroBanco(error: ErroBanco | null | undefined, fallback = "Falha inesperada."): string {
  if (!error) return fallback;
  const msg = error.message ?? "";
  const code = error.code ?? "";
  if (code === "23505" || /duplicate key|already exists/i.test(msg)) return "Já existe um registro com esse documento/chave.";
  if (code === "23503" || /foreign key/i.test(msg)) return "Referência inválida (um registro relacionado não existe).";
  if (code === "23514" || /check constraint/i.test(msg)) return "Um dos valores está fora do permitido.";
  if (code === "23502" || /not-null|null value/i.test(msg)) return "Falta preencher um campo obrigatório.";
  if (code === "42501" || /row-level security|violates row-level|permission denied/i.test(msg)) return "Sem permissão para esta ação nesta unidade.";
  if (code === "PGRST116" || /JSON object requested|Results contain 0 rows/i.test(msg)) return "Sem permissão para ler o registro após salvar.";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Sem conexão com o servidor. Verifique a internet.";
  return msg || fallback;
}
