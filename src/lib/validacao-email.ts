// Crivo leve de e-mail: valida o formato básico (um "@", texto antes e depois, domínio
// com ponto e TLD com 2+ caracteres, sem espaços). Não é RFC-completo de propósito — só
// pega os erros comuns de digitação (falta de "@", domínio sem ponto, espaço no meio).
// Usado como aviso não-bloqueante no cadastro de paciente (campo opcional).
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
