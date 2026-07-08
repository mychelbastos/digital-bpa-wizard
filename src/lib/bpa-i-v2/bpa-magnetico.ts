// Gerador do arquivo magnético BPA-I (.txt) no layout oficial DATASUS/SIA.
// Header (tipo 01) = 130 chars; linha BPA-I (tipo 03) = 338 chars; ambos + CRLF.
// Fonte: "Layout da interface texto do BPA" (FEHOSP/DATASUS).
import type { SeqData } from "@/lib/bpai-v2-layout";
import type { ConfigOrgao } from "./config";

const dig = (v: string | string[]) =>
  (Array.isArray(v) ? v.join("") : v || "").replace(/\D/g, "");

// NUM: dígitos com zeros à esquerda (n). blank=true => vazio vira brancos.
function numF(v: string | string[], n: number, blank = false): string {
  const d = dig(v);
  if (!d) return (blank ? " " : "0").repeat(n);
  return d.padStart(n, "0").slice(-n);
}

// ALFA: maiúsculas sem acento, só ASCII imprimível, brancos à direita (n).
function alfaF(v: string, n: number): string {
  const s = (v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, n);
  return s.padEnd(n, " ");
}

const competencia = (ano: string[], mes: string[]) => numF(ano, 4) + numF(mes, 2);

// [d,d,m,m,a,a,a,a] -> aaaammdd; vazio/incompleto -> brancos.
function dataAMD(d8: string[]): string {
  const s = dig(d8);
  if (s.length !== 8) return " ".repeat(8);
  return s.slice(4, 8) + s.slice(2, 4) + s.slice(0, 2);
}

// Idade em anos na data de atendimento (0..130); 0 se faltar dado.
export function idadeAnos(dataNasc: string[], dataAtend: string[]): number {
  const n = dig(dataNasc);
  const a = dig(dataAtend);
  if (n.length !== 8 || a.length !== 8) return 0;
  const ny = +n.slice(4, 8), nm = +n.slice(2, 4), nd = +n.slice(0, 2);
  const ay = +a.slice(4, 8), am = +a.slice(2, 4), ad = +a.slice(0, 2);
  let idade = ay - ny;
  if (am < nm || (am === nm && ad < nd)) idade--;
  return idade >= 0 && idade <= 130 ? idade : 0;
}

export interface DadosBpa {
  cnes: string[];
  profCns: string[];
  profCbo: string[];
  profMes: string[];
  profAno: string[];
  profFolha: string[]; // folha-base
  seqs: SeqData[];
}

// Linha só entra no arquivo se tiver procedimento informado.
export const seqPreenchida = (s: SeqData) => dig(s.codProc).length > 0;

// Campo de controle do header: 1111 + (Σ(procedimento + quantidade) mod 1111).
export function campoControle(seqs: SeqData[]): number {
  let soma = 0;
  for (const s of seqs) {
    if (!seqPreenchida(s)) continue;
    soma += (Number(dig(s.codProc)) || 0) + (Number(dig(s.qtde)) || 0);
  }
  return 1111 + (soma % 1111);
}

// Concatena campos garantindo o comprimento total esperado (a formatação por campo
// já foi feita pelos helpers; aqui só corrigimos tamanho e validamos o total).
function montar(campos: [number, string][], total: number): string {
  const linha = campos.map(([n, v]) => (v.length === n ? v : v.slice(0, n).padEnd(n, " "))).join("");
  if (linha.length !== total) throw new Error(`Linha com ${linha.length} chars, esperado ${total}`);
  return linha;
}

export function linhaBpaI(d: DadosBpa, s: SeqData, folha: number, seqNum: number): string {
  const raca = dig(s.racaCor);
  const campos: [number, string][] = [
    [2, "03"],
    [7, numF(d.cnes, 7)],
    [6, competencia(d.profAno, d.profMes)],
    [15, numF(d.profCns, 15)],
    [6, alfaF(dig(d.profCbo), 6)],
    [8, dataAMD(s.dataAtend)],
    [3, numF(String(folha), 3)],
    [2, numF(String(seqNum), 2)],
    [10, numF(s.codProc, 10)],
    [15, numF(s.cnsPac, 15, true)],
    [1, s.sexo === "M" || s.sexo === "F" ? s.sexo : " "],
    // Município: o formulário guarda o IBGE completo (7 díg.); o SIA/SUS usa o
    // código de 6 díg. = IBGE SEM o dígito verificador (o último). Por isso os 6
    // PRIMEIROS dígitos — nunca os últimos (numF cortaria pela direita e derrubaria
    // o dígito do UF, gerando um município inexistente).
    [6, numF(dig(s.ibge).slice(0, 6), 6, true)],
    [4, alfaF(s.cid.join(""), 4)],
    [3, numF(String(idadeAnos(s.dataNasc, s.dataAtend)), 3)],
    [6, numF(s.qtde, 6)],
    [2, numF(s.carater, 2, true)],
    [13, numF(s.autorizacao, 13, true)],
    [3, "BPA"],
    [30, alfaF(s.nomePac, 30)],
    [8, dataAMD(s.dataNasc)],
    [2, numF(raca, 2, true)],
    [4, raca === "05" ? numF(s.etnia, 4, true) : " ".repeat(4)],
    [3, numF(s.nacionalidade, 3, true)],
    [3, numF(s.servico, 3, true)],
    [3, numF(s.classProc, 3, true)],
    [8, " ".repeat(8)], // equipe seq (não coletado)
    [4, " ".repeat(4)], // equipe área
    [14, numF(s.cnpj, 14, true)],
    [8, numF(s.cep, 8, true)],
    [3, numF(s.codLog, 3, true)],
    [30, alfaF(s.endereco, 30)],
    [10, alfaF(s.complemento, 10)],
    [5, alfaF(s.numero.join(""), 5)],
    [30, alfaF(s.bairro, 30)],
    [11, ((dig(s.ddd) + dig(s.telefone)) || "").padEnd(11, " ").slice(0, 11)],
    [40, alfaF(s.email, 40)],
    [10, " ".repeat(10)], // INE (não coletado)
  ];
  return montar(campos, 338);
}

export function header(cfg: ConfigOrgao, comp: string, nLinhas: number, nFolhas: number, controle: number): string {
  const campos: [number, string][] = [
    [2, "01"],
    [5, "#BPA#"],
    [6, numF(comp, 6)],
    [6, numF(String(nLinhas), 6)],
    [6, numF(String(nFolhas), 6)],
    [4, numF(String(controle), 4)],
    [30, alfaF(cfg.orgaoOrigemNome, 30)],
    [6, alfaF(cfg.sigla, 6)],
    [14, numF(cfg.cgcCpf, 14)],
    [40, alfaF(cfg.orgaoDestinoNome, 40)],
    [1, cfg.destinoTipo === "E" ? "E" : "M"],
    [10, alfaF(cfg.versao || "DIGBPA1.0", 10)],
  ];
  return montar(campos, 130);
}

export interface ArquivoBpa {
  conteudo: string;
  nome: string;
  linhas: number;
  folhas: number;
}

// Gera o arquivo completo (header + linhas). base de folha vem de profFolha (ou 1),
// 3 linhas por folha (fiel ao formulário). Linhas sem procedimento são ignoradas.
export function gerarArquivoBpa(d: DadosBpa, cfg: ConfigOrgao): ArquivoBpa {
  const preenchidas = d.seqs.filter(seqPreenchida);
  const comp = competencia(d.profAno, d.profMes);
  const base = Number(dig(d.profFolha)) || 1;
  const controle = campoControle(preenchidas);

  const CRLF = "\r\n";
  const linhas = preenchidas.map((s, i) =>
    linhaBpaI(d, s, base + Math.floor(i / 3), (i % 3) + 1),
  );
  const nFolhas = Math.max(1, Math.ceil(linhas.length / 3));
  const head = header(cfg, comp, linhas.length, nFolhas, controle);

  const conteudo = [head, ...linhas].join(CRLF) + CRLF;
  return { conteudo, nome: `PA${comp}.txt`, linhas: linhas.length, folhas: nFolhas };
}
