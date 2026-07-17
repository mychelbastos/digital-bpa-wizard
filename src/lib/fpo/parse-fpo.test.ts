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
