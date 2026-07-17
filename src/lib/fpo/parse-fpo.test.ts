import { describe, it, expect } from "vitest";
import { parseFpoHtml, parseNumeroBR, competenciaDoNome } from "./parse-fpo";

const HTML = `
<script>function critica(){}</script>
<table>
  <tr><td>Unidade</td><td><a title="x">Procedimento</a></td><td>Qtde<br>Or&ccedil;ada</td><td>Valor<br>Unit&aacute;rio</td><td>Valor Or&ccedil;ado</td><td>Qtde Prod</td><td>Valor Prod</td></tr>
  <tr><td>2510332</td><td>030204002 - Atendimento fisioterapeutico em paciente com transtorno resp</td><td>50</td><td>4,67</td><td>233,50</td><td>0</td><td>0,00</td></tr>
  <tr><td>2510332</td><td>030205002 - Atendimento fisioterapeutico nas alteracoes motoras</td><td>993</td><td>4,67</td><td>4.637,31</td><td>0</td><td>0,00</td></tr>
  <tr><td>2510332</td><td>030206002 - Atendimento fisioterapeutico em pacientes com disturbios neu</td><td>100</td><td>6,35</td><td>635,00</td><td>0</td><td>0,00</td></tr>
  <tr><td>TOTAL:</td><td></td><td>0.00</td><td></td><td>0,00</td><td>0</td><td>0,00</td></tr>
</table>`;

describe("parseNumeroBR", () => {
  it("interpreta o formato brasileiro", () => {
    expect(parseNumeroBR("4,67")).toBe(4.67);
    expect(parseNumeroBR("4.637,31")).toBe(4637.31);
    expect(parseNumeroBR("50")).toBe(50);
    expect(parseNumeroBR("")).toBe(0);
  });
});

describe("competenciaDoNome", () => {
  it("extrai AAAAMM do nome do arquivo", () => {
    expect(competenciaDoNome("pfo_2510332_202604.xls")).toBe("202604");
    expect(competenciaDoNome("relatorio.xls")).toBeNull();
    expect(competenciaDoNome("pfo_2510332_209913.xls")).toBeNull(); // mês inválido
  });
});

// Formato A: download direto do site (pfo.asp). Unidade/competência em linhas de cabeçalho,
// sem coluna Unidade, código com DV e traço, popups ocultos de CID/CBO dentro da célula.
const HTML_SITE = `
<table><tr><td>Unidade: 3080560 - CLILAB LABORATORIO</td></tr></table>
<table><tr><td>Valores Or&ccedil;ados<br> Compet&ecirc;ncia: 04/2026<br></td></tr></table>
<table>
  <tr><td>Procedimento Clique no procedimento</td><td>Qtde<br>Or&ccedil;ada</td><td>Valor<br>Unit&aacute;rio</td><td>Valor Or&ccedil;ado</td><td>Qtde Prod</td></tr>
  <tr valign="baseline"><td><a title="Clique">020201007-4 - Determinacao de curva glicemica</a>
     <div id="ListaCID1" style="display:none"><table><tr><td>CID:</td><td>(nao aplicavel)</td></tr></table></div>
     <div id="ListaCBO1" style="display:none"><table><tr><td>CBO:</td><td></td></tr></table></div>
     </td><td>&nbsp;4 </td><td>&nbsp; 10,00 </td><td>&nbsp;40,00 </td><td><span>0</span></td></tr>
  <tr valign="baseline"><td><a>020201012-0 - Dosagem de acido urico</a>
     <div id="ListaCBO2" style="display:none"><table><tr><td>CBO:</td><td></td></tr></table></div>
     </td><td>&nbsp;24 </td><td>&nbsp; 1,85 </td><td>&nbsp;44,40 </td><td><span>0</span></td></tr>
  <tr><td>TOTAL:</td><td>28</td><td></td><td>84,40</td><td>0</td></tr>
</table>`;

describe("parseFpoHtml formato do site (A)", () => {
  const r = parseFpoHtml(HTML_SITE, "pfo.xls"); // nome sem competência: tem que vir do corpo
  it("lê CNES e competência do corpo", () => {
    expect(r.cnes).toBe("3080560");
    expect(r.competencia).toBe("202604");
  });
  it("lê 2 procedimentos (pula TOTAL, ignora CID/CBO)", () => {
    expect(r.linhas.length).toBe(2);
  });
  it("junta o dígito verificador ao código (10 díg.)", () => {
    expect(r.linhas[0].codigoFpo).toBe("0202010074");
    expect(r.linhas[0].qtdOrcada).toBe(4);
    expect(r.linhas[0].valorUnitario).toBe(10);
    expect(r.linhas[0].descricao).toMatch(/curva glicemica/i);
  });
});

describe("parseFpoHtml", () => {
  const r = parseFpoHtml(HTML, "pfo_2510332_202604.xls");
  it("lê CNES e competência", () => {
    expect(r.cnes).toBe("2510332");
    expect(r.competencia).toBe("202604");
  });
  it("lê 3 procedimentos (pula o TOTAL)", () => {
    expect(r.linhas.length).toBe(3);
  });
  it("extrai código, descrição, qtd e valor", () => {
    const l = r.linhas[1];
    expect(l.codigoFpo).toBe("030205002");
    expect(l.descricao).toMatch(/alteracoes motoras/i);
    expect(l.qtdOrcada).toBe(993);
    expect(l.valorUnitario).toBe(4.67);
  });
  it("sem avisos num arquivo bem formado", () => {
    expect(r.avisos).toEqual([]);
  });
});
