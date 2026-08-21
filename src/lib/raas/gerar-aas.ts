// Gerador do arquivo magnético RAAS `.AAS` (Atenção Psicossocial / CAPS) — registros
// 01/15/16, separados por CRLF, codificação ISO-8859-1. É o INVERSO do parser em
// `raas-aas.ts`, com os MESMOS offsets. Arquivo SEPARADO do .txt do BPA (vai para outro
// programa: RAAS-PAD/SIA).
//
// DÍGITO DE CONTROLE (15/16) — crackeado byte a byte dos 6 arquivos reais do município
// (AA292720.*, ~4.335 registros, 100% de acerto). Ver memória `aas-controle-e-geracao`.
//   D = (Σ ord(byte) do corpo sem controle) mod 1111 + 111
//   char_i = chr(128 + BASE[i] + dígito_i),  BASE = [41,39,54,45]  (milhar,centena,dezena,unidade)
// O controle é calculado sobre o PRÓPRIO conteúdo gerado, então os registros são válidos
// por construção (independente de quirks de formatação herdados de dados importados).
//
// CABEÇALHO (01): a competência, o estabelecimento e o gestor/CNPJ são reproduzidos; mas o
// número de remessa [13,23) e o char de controle [143] são internos do aplicativo SIA e NÃO
// derivam do conteúdo — ficam best-effort. Por isso o arquivo deve ser VALIDADO uma vez
// importando no programa destino antes de transmitir.
import type { RaasState, RaasAcao } from "@/lib/raas/raas-layout";

const BASE = [41, 39, 54, 45];

// Controle de 4 chars sobre o corpo do registro (sem os 4 chars finais). Exportado p/ teste.
export function controle4(corpo: string): string {
  let soma = 0;
  for (let i = 0; i < corpo.length; i++) soma += corpo.charCodeAt(i);
  const D = (soma % 1111) + 111;
  const g = [Math.floor(D / 1000) % 10, Math.floor(D / 100) % 10, Math.floor(D / 10) % 10, D % 10];
  return g.map((d, i) => String.fromCharCode(128 + BASE[i] + d)).join("");
}

// ---- helpers de campo (convenções calibradas nos arquivos reais) ----
const digitos = (v: string | undefined) => (v || "").replace(/\D/g, "");
// Texto: esquerda, preenchido com espaço à direita.
const T = (v: string | undefined, n: number) => (v || "").slice(0, n).padEnd(n, " ");
// Número-ID: direita, zero à esquerda. Vazio → tudo `vazio` (0 por padrão; espaço p/ campos opcionais).
const NR = (v: string | undefined, n: number, vazio = "0") => {
  const d = digitos(v);
  return d === "" ? vazio.repeat(n) : d.slice(-n).padStart(n, "0");
};
// Número à ESQUERDA + espaço (telefone/celular/prontuário nos reais).
const NL = (v: string | undefined, n: number) => digitos(v).slice(0, n).padEnd(n, " ");
// Data ISO "YYYY-MM-DD" → "AAAAMMDD"; vazia → 8 espaços.
const D8 = (iso: string | undefined) => {
  const d = digitos(iso);
  return d.length === 8 ? d : " ".repeat(8);
};
// Município IBGE: 6 dígitos (sem DV) à esquerda + espaço, em 7.
const MUN = (v: string | undefined) => digitos(v).slice(0, 6).padEnd(7, " ");

// Escreve `txt` a partir da posição `a` no buffer de chars.
function put(buf: string[], a: number, txt: string) {
  for (let i = 0; i < txt.length; i++) buf[a + i] = txt[i];
}

// Registro 15 (folha do paciente) — 402 chars de corpo + 4 de controle = 406.
function linha15(f: RaasState): string {
  const b = new Array(402).fill(" ");
  put(b, 0, "15");
  put(b, 2, NR(f.coduf, 2));
  put(b, 4, NR(f.competencia, 6));
  put(b, 10, NR(f.cnes, 7));
  put(b, 17, NR(f.cnsPaciente, 15));
  put(b, 32, D8(f.validadeInicio));
  put(b, 40, D8(f.validadeFim));
  put(b, 48, T(f.nomePaciente, 30));
  put(b, 78, NL(f.prontuario, 10));
  put(b, 88, T(f.nomeMae, 30));
  put(b, 118, T(f.bairro, 30));
  put(b, 148, T(f.numero, 5));
  put(b, 153, T(f.complemento, 10));
  put(b, 163, NR(f.cep, 8));
  put(b, 171, MUN(f.municipioIbge));
  put(b, 178, D8(f.dataNascimento));
  put(b, 186, T(f.sexo, 1));
  put(b, 187, NR(f.raca, 2));
  put(b, 189, T(f.nomeResponsavel, 30));
  put(b, 219, NR(f.nacionalidade, 3));
  put(b, 222, NR(f.etnia, 4, " "));
  put(b, 226, NL(f.telefone, 11));
  put(b, 237, NL(f.celular, 11));
  put(b, 248, "21".padEnd(10, " "));
  put(b, 258, T(f.cidPrincipal, 4));
  put(b, 262, T(f.cidSec1, 4));
  put(b, 266, T(f.cidSec2, 4));
  put(b, 270, T(f.cidSec3, 4));
  put(b, 274, T(f.cidCausas, 4));
  put(b, 278, NR(f.origemPaciente, 2));
  put(b, 280, NR(f.destinoPaciente, 2));
  put(b, 282, T(f.coberturaEsf || "N", 1));
  put(b, 283, NR(f.cnesEsf, 7, " "));
  put(b, 290, "0000000"); // código de equipe ESF — não capturado no cadastro
  put(b, 297, T(f.origemInfo || "RAS", 3));
  put(b, 300, T(f.situacaoRua || "N", 1));
  put(b, 301, T(f.usuarioDroga || "N", 1));
  put(b, 302, T(["A", "C", "O"].filter((l) => f.tiposDroga.includes(l)).join(""), 3));
  put(b, 305, NR(f.autorizacao, 13, " "));
  put(b, 318, T(f.logradouro, 30));
  put(b, 348, NR(f.codLogradouro, 3));
  put(b, 351, T(f.email, 40));
  put(b, 391, NR(f.cpfPaciente, 11));
  const corpo = b.join("");
  return corpo + controle4(corpo);
}

// Registro 16 (ação/procedimento) — 106 chars de corpo + 4 de controle = 110.
function linha16(f: RaasState, ac: RaasAcao): string {
  const b = new Array(106).fill(" ");
  put(b, 0, "16");
  put(b, 2, NR(f.coduf, 2));
  put(b, 4, NR(f.competencia, 6));
  put(b, 10, NR(f.cnes, 7));
  put(b, 17, NR(f.cnsPaciente, 15));
  put(b, 32, D8(f.validadeInicio));
  put(b, 40, NR(ac.procedimento, 10));
  put(b, 50, T(ac.cbo, 6));
  put(b, 56, NR(ac.cnsExecutante, 15));
  put(b, 71, D8(ac.dataExec));
  put(b, 79, T(ac.servico, 3));
  put(b, 82, T(ac.classificacao, 3));
  put(b, 85, NR(ac.quantidade, 6));
  put(b, 91, "   ");
  put(b, 94, T(ac.localRealizacao || "C", 1));
  put(b, 95, "00000000000");
  const corpo = b.join("");
  return corpo + controle4(corpo);
}

// Cabeçalho 01 (144 chars). num/gerData/versao/controle são best-effort (ver topo do arquivo).
function cabecalho01(competencia: string, estabNome: string, cfg: GerarAasCfg, num: string, hoje: string): string {
  const b = new Array(143).fill(" ");
  put(b, 0, "01#RAS#");
  put(b, 7, NR(competencia, 6));
  put(b, 13, num.replace(/\D/g, "").slice(-10).padStart(10, "0"));
  put(b, 23, T(estabNome, 30));
  put(b, 53, T(cfg.sigla, 6));
  put(b, 59, NR(cfg.cnpj, 14));
  put(b, 73, T(cfg.gestorNome, 40));
  put(b, 113, cfg.destinoTipo === "E" ? "E" : "M");
  put(b, 114, D8(hoje));
  put(b, 122, (cfg.versaoAas || "02.35").slice(0, 5).padEnd(5, " "));
  put(b, 137, NR(competencia, 6));
  // char de controle [143] — desconhecido (depende do num interno do SIA); best-effort.
  return b.join("") + "a";
}

export interface GerarAasCfg {
  sigla: string; // órgão origem — sigla (6)
  cnpj: string; // CNPJ do gestor (14)
  gestorNome: string; // órgão destino / gestor (40)
  destinoTipo: "M" | "E";
  versaoAas?: string; // versão do aplicativo SIA (ex.: "02.35"); default "02.35"
}

export interface ArquivoAas {
  cnes: string;
  estabelecimento: string;
  nome: string; // nome do arquivo (AA<mun>.<MMM>)
  conteudo: string; // string latin-1 (usar baixarAas p/ gravar byte a byte)
  fichas: number;
  acoes: number;
}

const MESES_EXT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

// Gera UM arquivo .AAS por CNES (o cabeçalho tem um só órgão de origem). Só inclui ações com
// procedimento preenchido. `competencia` = mês de apresentação (AAAAMM). `hoje` = AAAAMMDD.
export function gerarAas(fichas: RaasState[], competencia: string, cfg: GerarAasCfg, hoje: string): ArquivoAas[] {
  const porCnes = new Map<string, RaasState[]>();
  for (const f of fichas) {
    const c = digitos(f.cnes);
    if (!c) continue;
    (porCnes.get(c) ?? porCnes.set(c, []).get(c)!).push(f);
  }
  const mesIdx = Number(competencia.slice(4, 6)) - 1;
  const ext = MESES_EXT[mesIdx] ?? "AAS";
  const out: ArquivoAas[] = [];
  for (const [cnes, grupo] of porCnes) {
    const estab = grupo.find((f) => f.estabelecimentoNome?.trim())?.estabelecimentoNome?.trim() || "";
    const mun = digitos(grupo.find((f) => digitos(f.municipioIbge))?.municipioIbge || "").slice(0, 6) || "000000";
    // num de remessa best-effort: determinístico por competência+cnes (não validado pelo destino).
    const num = (competencia + cnes).replace(/\D/g, "").slice(-10);
    const linhas: string[] = [cabecalho01(competencia, estab, cfg, num, hoje)];
    let nFichas = 0;
    let nAcoes = 0;
    for (const f of grupo) {
      const acoes = f.acoes.filter((a) => digitos(a.procedimento).length > 0 && Number(digitos(a.quantidade)) > 0);
      if (acoes.length === 0) continue;
      linhas.push(linha15(f));
      nFichas++;
      for (const ac of acoes) {
        linhas.push(linha16(f, ac));
        nAcoes++;
      }
    }
    if (nFichas === 0) continue;
    out.push({
      cnes,
      estabelecimento: estab || cnes,
      nome: `AA${mun}.${ext}`,
      conteudo: linhas.join("\r\n") + "\r\n",
      fichas: nFichas,
      acoes: nAcoes,
    });
  }
  return out;
}

// Baixa o conteúdo como arquivo, gravando BYTE A BYTE (latin-1). Necessário porque o .AAS tem
// caracteres de controle em bytes altos (0xA0–0xBF) que um Blob de texto corromperia em UTF-8.
export function baixarAas(nome: string, conteudo: string) {
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
