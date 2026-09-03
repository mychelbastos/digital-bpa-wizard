// Reproduz o RELEXP.PRN — "Relatório de Controle de Remessa" que o programa do BPA Magnético
// gera JUNTO com o arquivo PA. É um relatório de PAPEL (encaminhado com o arquivo na entrega);
// NÃO é importado pelo SIA. Reproduzido dos nossos dados/config para o "Baixar para o SIA".
import type { ConfigOrgao } from "@/lib/bpa-i-v2/config";

const MESES_MMM = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const z = (n: number, w: number) => String(n).padStart(w, "0");

export function gerarRelexp(
  cfg: ConfigOrgao,
  compApres: string,
  nomeArquivo: string,
  info: { linhas: number; folhas: number; controle: number },
): string {
  const h = new Date();
  const data = `${z(h.getDate(), 2)}/${z(h.getMonth() + 1, 2)}/${h.getFullYear()}`;
  const mmmAno = `${MESES_MMM[Number(compApres.slice(4, 6)) - 1] ?? compApres.slice(4, 6)}/${compApres.slice(0, 4)}`;
  const ver = (cfg.versao || "").replace(/^D/i, "") || "05.00"; // "D05.00" -> "05.00"
  const tipo = cfg.destinoTipo === "E" ? "E" : "M";
  const reg = z(info.linhas + 1, 6); // + o registro de cabeçalho (01)
  const bpas = z(info.folhas, 6);

  const linhas = [
    "",
    "*".repeat(67) + `Versao: ${ver}`,
    "MS/SAS/DATASUS/     SISTEMA DE INFORMACOES AMBULATORIAIS            DATA COMP.",
    `${data}            RELATORIO DE CONTROLE DE REMESSA                ${mmmAno}`,
    "*".repeat(58) + `Versao banco :${compApres}b`,
    "", "",
    " ORGAO RESPONSAVEL PELA INFORMACAO",
    "",
    ` NOME   : ${cfg.orgaoOrigemNome}`,
    "",
    ` SIGLA  : ${cfg.sigla}`,
    "",
    ` CGC/CPF: ${(cfg.cgcCpf || "").replace(/\D/g, "")}`,
    "", "",
    " Carimbo e",
    " Assinatura : ___________________",
    "", "", "",
    " SECRETARIA DE SAUDE DESTINO DOS B.P.A.(s)",
    "",
    ` NOME  : ${cfg.orgaoDestinoNome}`,
    "",
    ` ORGAO (M)UNICIPAL OU (E)STADUAL : ${tipo}`,
    "", "",
    " Setor de                                       Carimbo e",
    " Recebimento : ____________ Data : ___/___/___  Assinatura : ________________",
    "", "", "",
    " ARQUIVO DE BPA(s) GERADO",
    "",
    `               NOME : ${nomeArquivo}`,
    "",
    ` REGISTROS GRAVADOS : ${reg}`,
    "",
    `             BPA(s) : ${bpas}`,
    "",
    `  CAMPO DE CONTROLE : ${info.controle}`,
    "", "", "", "",
    "    (ENCAMINHAR ESTE RELATORIO JUNTAMENTE COM O ARQUIVO DE BPA(s) GERADO.)",
  ];
  return linhas.join("\r\n") + "\r\n";
}
