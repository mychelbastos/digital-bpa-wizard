// Baixa um conteúdo de texto como arquivo .txt (usado p/ o arquivo magnético BPA).
// Encoding ASCII/latin-1 já garantido pelo gerador (sem acentos). Espelha o padrão
// do export-pdf.ts (ação disparada por clique do usuário).
export function baixarTxt(nome: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/plain;charset=iso-8859-1" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
