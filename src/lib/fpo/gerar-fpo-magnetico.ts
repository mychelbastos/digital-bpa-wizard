// Gerador do arquivo NATIVO do FPO Magnético (o ".IMP" que o SIA importa) — é o INVERSO do
// parser em parse-fpo-magnetico.ts. Reproduz byte a byte o MACIO<MM>.IMP real (validado
// 21.312/21.312 bytes contra o arquivo de 07/2026 de Ruy Barbosa).
//
// Formato (texto ISO-8859-1, CRLF; dígitos gravados pela CIFRA de substituição):
//   Cifra: 0-9  ->  * . ; / ? : > , ( )
//   Cabeçalho (142): "ÃÇF" + competência(6, cifrada) + "*/0*." + "EEEEEE" + espaços.
//   Linha de dado (142), decifrada = concatenação de:
//     [0:6]   competência AAAAMM
//     [6:13]  CNES (7)
//     [13:22] procedimento FPO — 9 díg. (codigo_fpo, sem DV)
//     [22:24] código de financiamento+apuração ("21"=MAC/Grupo, "24"=MAC/Proc, "34"=FAEC/Proc)
//     [24:32] quantidade orçada (física), 8 díg.
//     [32:47] valor unitário em CENTAVOS, 15 díg.
//     [47:62] valor total em centavos (= qtd × unit), 15 díg.
//     [62:138] zeros (campos de incremento/complementação — 0 quando não há)
//     [138:142] DÍGITO DE CONTROLE = 1111 + (Σ dígitos de [0:62] mod 1111)  ← decifrado por nós
//   Ordenação: CNES crescente; dentro do CNES, procedimento crescente (confirmado no real).

const CIFRA: Record<string, string> = {
  "0": "*", "1": ".", "2": ";", "3": "/", "4": "?", "5": ":", "6": ">", "7": ",", "8": "(", "9": ")",
};
const cifrar = (digitos: string): string => {
  let out = "";
  for (const c of digitos) out += CIFRA[c] ?? "";
  return out;
};
const z = (n: number | string, w: number): string => String(n).replace(/\D/g, "").padStart(w, "0").slice(-w);

export interface FpoMagItem {
  cnes: string;          // 7 díg.
  codigoFpo: string;     // 9 díg. (sem DV)
  qtdOrcada: number;     // física
  valorUnitario: number; // reais (ex.: 165.00)
  codApuracao: string;   // 2 díg. "21"/"24"/"34" (financiamento+nível de apuração)
}

export const COD_APURACAO_PADRAO = "24"; // MAC / Procedimento — usado quando não informado

// Monta o MIOLO [0:62] decifrado de uma linha.
function miolo(comp: string, it: FpoMagItem): string {
  const unitC = Math.round(it.valorUnitario * 100);
  const totC = it.qtdOrcada * unitC;
  const cod = /^[0-9]{2}$/.test(it.codApuracao) ? it.codApuracao : COD_APURACAO_PADRAO;
  return z(comp, 6) + z(it.cnes, 7) + z(it.codigoFpo, 9) + cod + z(it.qtdOrcada, 8) + z(unitC, 15) + z(totC, 15);
}

// Dígito de controle: 1111 + (soma dos dígitos do miolo[0:62] mod 1111).
function controle(core62: string): string {
  let soma = 0;
  for (const c of core62) soma += c.charCodeAt(0) - 48;
  return z(1111 + (soma % 1111), 4);
}

function linha(comp: string, it: FpoMagItem): string {
  const core = miolo(comp, it);           // 62
  const full = core + "0".repeat(76) + controle(core); // 62 + 76 + 4 = 142
  return cifrar(full);
}

function cabecalho(comp: string): string {
  const base = "ÃÇF" + cifrar(z(comp, 6)) + "*/0*." + "EEEEEE"; // 20 chars
  return base + " ".repeat(142 - base.length);
}

export interface FpoMagArquivo {
  conteudo: string; // string latin-1 (usar baixarFpoMagnetico p/ gravar byte a byte)
  nome: string;     // MACIO<MM>.IMP
  linhas: number;
  unidades: number;
}

// Gera o conteúdo do .IMP a partir dos itens (vários CNES). `prefixoNome` default "MACIO"
// (≤ 8 chars com o mês — exigência do SIA). Ordena por CNES e procedimento crescentes.
export function gerarFpoMagnetico(competencia: string, itens: FpoMagItem[], prefixoNome = "MACIO"): FpoMagArquivo {
  const comp = z(competencia, 6);
  const ordenados = [...itens]
    .filter((it) => /^[0-9]{7}$/.test(it.cnes) && /^[0-9]{9}$/.test(it.codigoFpo))
    .sort((a, b) => a.cnes.localeCompare(b.cnes) || a.codigoFpo.localeCompare(b.codigoFpo));
  const corpo = ordenados.map((it) => linha(comp, it));
  const conteudo = [cabecalho(comp), ...corpo].join("\r\n") + "\r\n";
  const mm = comp.slice(4, 6);
  const unidades = new Set(ordenados.map((it) => it.cnes)).size;
  return { conteudo, nome: `${prefixoNome}${mm}.IMP`, linhas: corpo.length, unidades };
}

// Baixa gravando BYTE A BYTE (latin-1): o cabeçalho tem bytes altos (Ã=0xC3, Ç=0xC7) que um
// Blob de texto UTF-8 corromperia. Mesmo padrão do baixarAas (RAAS).
export function baixarFpoMagnetico(nome: string, conteudo: string): void {
  const bytes = new Uint8Array(conteudo.length);
  for (let i = 0; i < conteudo.length; i++) bytes[i] = conteudo.charCodeAt(i) & 0xff;
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
