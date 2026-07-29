// Padronização do NOME/RÓTULO das fichas em "Minhas fichas".
// Formato: CNES · [Nome prof 1º+último | CNS] · MM/AAAA · folha X[/Y] [· (importado)]
// - O tipo (BPA-C/BPA-I) NÃO entra no texto: já existe o selo colorido ao lado.
// - Profissional só aparece no BPA-I; quando há nome, mostra 1º + último; senão o CNS.

// Primeiro + último nome (descarta os do meio). "" quando vazio.
export function nomeCurto(nome: string | null | undefined): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

const labelComp = (c: string | null | undefined): string =>
  c && /^\d{6}$/.test(c) ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : (c ?? "");

// Monta o título padronizado a partir de campos estruturados (usado na GERAÇÃO: importação
// e sugestão de nome ao salvar). `folha`/`totalFolhas` opcionais.
export function montarTituloFicha(opts: {
  cnes?: string | null;
  profNome?: string | null;
  profCns?: string | null;
  competencia: string | null;
  folha?: string | number | null;
  totalFolhas?: number | null;
  importado?: boolean;
}): string {
  const cnes = (opts.cnes ?? "").trim();
  const ident = nomeCurto(opts.profNome) || (opts.profCns ?? "").trim();
  const folhaNum = String(opts.folha ?? "").replace(/^0+(?=\d)/, "");
  const folhaTok = folhaNum
    ? opts.totalFolhas && opts.totalFolhas > 1
      ? `folha ${folhaNum}/${opts.totalFolhas}`
      : `folha ${folhaNum}`
    : "";
  const partes = [cnes, ident, labelComp(opts.competencia), folhaTok].filter(Boolean);
  let s = partes.join(" · ");
  if (opts.importado) s += " (importado)";
  return s;
}

// Campos que a exibição precisa (vêm de listarFichas: coluna + subcampos do jsonb `dados`).
export interface FichaRotulo {
  tipo: "BPA-I" | "BPA-C";
  titulo: string;
  competencia: string | null;
  origem?: string | null;
  cnes?: string | null;
  profNome?: string | null;
  profCns?: string | null;
}

// Título AUTO-gerado de uma ficha importada. Cobre os dois formatos que já gravamos:
//  - antigo: começa pelo tipo ("BPA-C …" / "BPA-I …")
//  - novo (montarTituloFicha): começa pelo CNES, mas SEMPRE termina em "(importado)"
// Uma renomeação manual perde o sufixo "(importado)" e o prefixo "BPA-", então NÃO é
// recomposta (respeita a edição). É o que distingue auto-gerado de renomeado.
const ehTituloAutoImportado = (t: string) => /^BPA-[CI][\s·]/.test(t) || /\(importado\)\s*$/.test(t);

// Rótulo para EXIBIR na lista. Fichas importadas com título auto-gerado são recompostas no
// padrão novo (some o tipo duplicado, entra o CNES, CNS vira nome quando houver). Fichas
// renomeadas ou digitadas mantêm o título salvo (respeita edição manual).
export function rotuloExibicao(f: FichaRotulo): string {
  const titulo = f.titulo || "";
  if (f.origem !== "importado" || !ehTituloAutoImportado(titulo)) return titulo || "Ficha sem nome";
  const folhaTok = (titulo.match(/folha \d+(?:\/\d+)?/) ?? [""])[0];
  // Nome do profissional (1º+último) quando houver; senão o CNS. Vale p/ BPA-I e BPA-C
  // (o consolidado também tem "Nome do profissional"). Importados não trazem nome → CNS/vazio.
  const ident = nomeCurto(f.profNome) || (f.profCns ?? "").trim();
  const partes = [(f.cnes ?? "").trim(), ident, labelComp(f.competencia), folhaTok].filter(Boolean);
  const s = partes.join(" · ");
  return s ? `${s} (importado)` : titulo;
}
