// "Enter pula para o próximo campo" — compartilhado por todos os tipos de campo do
// formulário (DigitBoxes, TextField, ComboField). Usa a ordem do DOM (= ordem visual de
// leitura), então funciona em qualquer folha sem encadear refs manualmente.

// Focáveis do formulário, em ordem de leitura. Ignora readonly/disabled e tabIndex -1
// (ícones de lixeira, botões auxiliares).
function focaveis(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("input:not([readonly]), select, textarea"),
  ).filter((el) => el.tabIndex !== -1 && !(el as HTMLInputElement).disabled);
}

// Foca o próximo campo focável depois de `ref`, ignorando os elementos em `pular` (ex.: as
// demais caixinhas do mesmo grupo DigitBoxes, para saltar o grupo inteiro de uma vez).
export function focarProximoCampo(ref: HTMLElement | null | undefined, pular: HTMLElement[] = []) {
  if (!ref) return;
  const lista = focaveis();
  const i = lista.indexOf(ref);
  if (i === -1) return;
  const prox = lista.slice(i + 1).find((el) => !pular.includes(el));
  prox?.focus();
}
