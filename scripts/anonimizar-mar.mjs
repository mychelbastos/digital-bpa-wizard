// Anonimiza um arquivo .MAR real (com PII de pacientes) num fixture SEGURO para o repo.
// Substitui PII por dados fake PRESERVANDO comprimentos e casos-limite (blanks, o "N" da
// situação de rua, competências, idades). Registro 02 e header não têm PII de paciente.
//
// Uso: node scripts/anonimizar-mar.mjs "/caminho/PA292720.MAR" src/lib/__fixtures__/bpa-mar-anon.txt
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("uso: node scripts/anonimizar-mar.mjs <entrada.MAR> <saida.txt>");
  process.exit(1);
}

// PRNG determinístico (sem depender de Math.random) — fixture reproduzível.
let seed = 0x9e3779b9;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const digits = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join("");

const NOMES = ["ANA", "JOAO", "MARIA", "PEDRO", "LUCAS", "CARLA", "PAULO", "BEATRIZ", "RAFAEL", "SOFIA", "TIAGO", "HELENA"];
const SOBRE = ["SILVA", "SOUZA", "COSTA", "PEREIRA", "OLIVEIRA", "SANTOS", "LIMA", "ALVES", "ROCHA", "GOMES", "DIAS", "MELO"];
const RUAS = ["RUA DAS FLORES", "AV BRASIL", "TRAVESSA CENTRAL", "RUA SAO JOSE", "AV PRINCIPAL", "RUA DO COMERCIO"];
const BAIRROS = ["CENTRO", "BOA VISTA", "SAO JOSE", "NOVO HORIZONTE", "PLANALTO", "JARDIM"];

// Preenche um campo de largura fixa: se o original for todo em branco, mantém em branco
// (preserva casos-limite). Caso contrário, gera fake com o MESMO comprimento.
const campo = (orig, gen) => (orig.trim() === "" ? orig : gen().slice(0, orig.length).padEnd(orig.length, " "));
const campoNum = (orig, n) => (orig.trim() === "" ? orig : digits(n));
const nomeFake = () => `${pick(NOMES)} ${pick(SOBRE)} ${pick(SOBRE)}`;

function anon03(l) {
  const put = (s, a, b) => l.slice(0, a) + s.padEnd(b - a, " ").slice(0, b - a) + l.slice(b);
  // CNS do profissional (15) e do paciente (15)
  l = put(campoNum(l.slice(15, 30), 15), 15, 30);
  l = put(campoNum(l.slice(59, 74), 15), 59, 74);
  // Nome do paciente (30)
  l = put(campo(l.slice(112, 142), nomeFake), 112, 142);
  // Data de nascimento aaaammdd (8) — dia fake, mantém mês/ano plausíveis
  const dn = l.slice(142, 150);
  if (dn.trim()) l = put(dn.slice(0, 6) + String(1 + Math.floor(rnd() * 28)).padStart(2, "0"), 142, 150);
  // Endereço, complemento, número, bairro
  l = put(campo(l.slice(202, 232), () => pick(RUAS)), 202, 232);
  l = put(campo(l.slice(232, 242), () => "CASA"), 232, 242);
  l = put(campoNum(l.slice(242, 247), 3), 242, 247);
  l = put(campo(l.slice(247, 277), () => pick(BAIRROS)), 247, 277);
  // CEP (8), telefone (11), email (40)
  l = put(campoNum(l.slice(191, 199), 8), 191, 199);
  l = put(campoNum(l.slice(277, 288), 11), 277, 288);
  l = put(campo(l.slice(288, 328), () => `${pick(NOMES)}@exemplo.com`.toUpperCase()), 288, 328);
  // CPF do paciente (11) — cauda v04.11. situação de rua [349] PRESERVADA como está.
  l = put(campoNum(l.slice(338, 349), 11), 338, 349);
  return l;
}

const raw = readFileSync(inPath, "latin1");
const linhas = raw.split("\r\n");
const out = linhas.map((l) => (l.startsWith("03") ? anon03(l) : l)); // header e 02 sem PII de paciente
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out.join("\r\n"), "latin1");

const l03 = linhas.filter((l) => l.startsWith("03")).length;
const l02 = linhas.filter((l) => l.startsWith("02")).length;
const comN = out.filter((l) => l.length >= 350 && l[349] === "N").length;
console.log(`fixture: ${out.filter(Boolean).length} linhas (02=${l02}, 03=${l03}); situação-rua "N" preservados: ${comN}`);
