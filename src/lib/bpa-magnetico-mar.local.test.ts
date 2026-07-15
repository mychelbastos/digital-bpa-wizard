// Harness de validação byte a byte do gerador magnético contra um arquivo .MAR REAL
// aceito pelo DATASUS. Prova a meta 971/971: reconstrói cada linha a partir dos campos
// CAPTURADOS (competência e idade inclusas — não derivadas) e compara com o original.
//
// O .MAR NÃO fica no repositório (contém PII de pacientes). Aponte o caminho por env:
//   MAR_PATH="/caminho/PA292720.MAR" npx vitest run bpa-magnetico-mar
// Sem o arquivo, o teste é PULADO (não quebra o CI).
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { linhaBpaI, type DadosBpa } from "./bpa-i-v2/bpa-magnetico";
import { linhaBpaC, type DadosBpaC } from "./bpa-c-v2/bpa-magnetico";
import { emptySeq, type SeqData } from "./bpai-v2-layout";
import { emptyRow, type RowData } from "./bpac-layout";

const MAR_PATH =
  process.env.MAR_PATH ||
  "/Users/mychelbastos/Downloads/03 EXPORTA BPA RB MAR 2026-1/PA292720.MAR";

const arr = (s: string) => s.split("");
// data aaaammdd (como no arquivo) -> ddmmaaaa (como o SeqData guarda); branco -> vazio.
const dataParaSeq = (amd: string): string[] => {
  if (!/\d/.test(amd) || amd.trim().length !== 8) return [];
  return arr(amd.slice(6, 8) + amd.slice(4, 6) + amd.slice(0, 4));
};

// Reconstrói o INPUT de uma linha 03 e regenera; retorna a linha gerada.
function regen03(line: string): string {
  const cnes = line.slice(2, 9);
  const comp = line.slice(9, 15);
  const profCns = line.slice(15, 30);
  const profCbo = line.slice(30, 36);
  const folha = Number(line.slice(44, 47));
  const seqNum = Number(line.slice(47, 49));

  const s: SeqData = {
    ...emptySeq(),
    dataAtend: dataParaSeq(line.slice(36, 44)),
    codProc: arr(line.slice(49, 59)),
    cnsPac: arr(line.slice(59, 74)),
    sexo: (line[74] === "M" || line[74] === "F" ? line[74] : "") as SeqData["sexo"],
    ibge: arr(line.slice(75, 81)),
    cid: arr(line.slice(81, 85)),
    idade: arr(line.slice(85, 88)), // CAPTURADO (inclui os 15 casos de erro humano)
    qtde: arr(line.slice(88, 94)),
    carater: arr(line.slice(94, 96)),
    autorizacao: arr(line.slice(96, 109)),
    nomePac: line.slice(112, 142),
    dataNasc: dataParaSeq(line.slice(142, 150)),
    racaCor: line.slice(150, 152).trim(),
    etnia: line.slice(152, 156).trim(),
    nacionalidade: line.slice(156, 159).trim(),
    servico: arr(line.slice(159, 162)),
    classProc: arr(line.slice(162, 165)),
    cnpj: arr(line.slice(177, 191)),
    cep: arr(line.slice(191, 199)),
    codLog: arr(line.slice(199, 202)),
    endereco: line.slice(202, 232),
    complemento: line.slice(232, 242),
    numero: arr(line.slice(242, 247)),
    bairro: line.slice(247, 277),
    ddd: [],
    telefone: arr(line.slice(277, 288)),
    email: line.slice(288, 328),
    cpfPac: arr(line.slice(338, 349)), // cauda v04.11 CAPTURADA
    situacaoRua: line.slice(349, 350).trim(),
  };
  const d: DadosBpa = {
    cnes: arr(cnes),
    profCns: arr(profCns),
    profCbo: arr(profCbo),
    profMes: arr(comp.slice(4, 6)),
    profAno: arr(comp.slice(0, 4)),
    profFolha: arr(String(folha)),
    seqs: [s],
  };
  return linhaBpaI(d, s, folha, seqNum);
}

// Reconstrói o INPUT de uma linha 02 e regenera.
function regen02(line: string): string {
  const cnes = line.slice(2, 9);
  const comp = line.slice(9, 15);
  const folha = Number(line.slice(21, 24));
  const seq = Number(line.slice(24, 26));
  const r: RowData = {
    ...emptyRow(),
    cbo: arr(line.slice(15, 21)),
    procedimento: arr(line.slice(26, 36)),
    idade: arr(line.slice(36, 39)),
    quantidade: arr(line.slice(39, 45)),
  };
  const d: DadosBpaC = {
    cnes: arr(cnes),
    ano: arr(comp.slice(0, 4)),
    mes: arr(comp.slice(4, 6)),
    folhaBase: arr(String(folha)),
    rows: [r],
  };
  return linhaBpaC(d, r, folha, seq);
}

function diffPos(a: string, b: string): number[] {
  const out: number[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) out.push(i);
  return out;
}

// Roda o placar byte a byte sobre o conteúdo de um arquivo (real ou fixture).
function validar(nome: string, raw: string) {
  describe(`validação byte a byte — ${nome}`, () => {
    const dados = raw.split("\r\n").filter(Boolean).slice(1); // fora o header
    const l02 = dados.filter((l) => l.startsWith("02"));
    const l03 = dados.filter((l) => l.startsWith("03"));

    it(`reconstrói cada linha 02 (BPA-C) — ${l02.length} linhas`, () => {
      const falhas = l02
        .map((l) => ({ l, g: regen02(l) }))
        .filter(({ l, g }) => g !== l)
        .map(({ l, g }) => ({ pos: diffPos(l, g), esperado: l, gerado: g }));
      if (falhas.length) console.log("02 divergências:", JSON.stringify(falhas.slice(0, 5), null, 2));
      expect(falhas.length, `02: ${l02.length - falhas.length}/${l02.length}`).toBe(0);
    });

    it(`reconstrói cada linha 03 (BPA-I) — ${l03.length} linhas`, () => {
      const falhas = l03
        .map((l) => ({ l, g: regen03(l) }))
        .filter(({ l, g }) => g !== l)
        .map(({ l, g }) => ({ pos: diffPos(l, g), esperado: l, gerado: g }));
      if (falhas.length) {
        const porPos: Record<string, number> = {};
        for (const f of falhas) porPos[f.pos.join(",")] = (porPos[f.pos.join(",")] || 0) + 1;
        console.log("03 divergências por posição:", porPos);
        console.log("03 exemplos:", JSON.stringify(falhas.slice(0, 3), null, 2));
      }
      expect(falhas.length, `03: ${l03.length - falhas.length}/${l03.length}`).toBe(0);
    });
  });
}

// (1) Fixture anonimizado versionado — SEMPRE roda (é a garantia de regressão no CI).
const FIXTURE = fileURLToPath(new URL("./__fixtures__/bpa-mar-anon.txt", import.meta.url));
if (existsSync(FIXTURE)) validar("fixture anonimizado", readFileSync(FIXTURE, "latin1"));

// (2) Arquivo .MAR REAL — só roda localmente com MAR_PATH apontando pro arquivo (fora do repo).
if (existsSync(MAR_PATH)) validar(".MAR real", readFileSync(MAR_PATH, "latin1"));

// (3) 2º arquivo REAL: PA292720.JUN (jun/2026, D04.14, 1250 linhas, 3 CNES, 3 competências).
// Prova que o gerador é GENÉRICO (não ajustado a um arquivo só). Fora do repo (PII):
//   JUN_PATH="/caminho/PA292720.JUN" npx vitest run bpa-magnetico-mar
const JUN_PATH =
  process.env.JUN_PATH ||
  "/Users/mychelbastos/Downloads/06 EXPORTA BPA RB JUN 2026/PA292720.JUN";
if (existsSync(JUN_PATH)) validar(".JUN real", readFileSync(JUN_PATH, "latin1"));
