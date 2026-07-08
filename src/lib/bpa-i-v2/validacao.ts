// Validações puras do BPA-I v2. NÃO bloqueiam o formulário — alimentam apenas
// indicadores visuais sutis (borda), no espírito não-agressivo do resto do v2.

// ---------- CNS (Cartão Nacional de Saúde) — algoritmo oficial mód-11 ----------
// Definitivo (início 1 ou 2): PIS de 11 dígitos + DV calculado.
// Provisório (início 7, 8 ou 9): soma ponderada dos 15 dígitos divisível por 11.
export function validarCns(cns: string): boolean {
  const c = (cns || "").replace(/\D/g, "");
  if (c.length !== 15) return false;

  if (c[0] === "1" || c[0] === "2") {
    const pis = c.slice(0, 11);
    let soma = 0;
    for (let i = 0; i < 11; i++) soma += Number(pis[i]) * (15 - i);
    let resto = soma % 11;
    let dv = 11 - resto;
    if (dv === 11) dv = 0;
    if (dv === 10) {
      soma += 2;
      resto = soma % 11;
      dv = 11 - resto;
      return c === `${pis}001${dv}`;
    }
    return c === `${pis}000${dv}`;
  }

  if (c[0] === "7" || c[0] === "8" || c[0] === "9") {
    let soma = 0;
    for (let i = 0; i < 15; i++) soma += Number(c[i]) * (15 - i);
    return soma % 11 === 0;
  }

  return false;
}

export function cnsCompleto(cns: string): boolean {
  return (cns || "").replace(/\D/g, "").length === 15;
}

// ---------- Datas em vetor de 8 dígitos [d,d,m,m,a,a,a,a] ----------
export function dataCompleta(d: string[]): boolean {
  return d.length === 8 && d.every(Boolean);
}

// Data de calendário válida (dia existe no mês/ano; ano em faixa plausível).
export function dataValida(d: string[]): boolean {
  if (!dataCompleta(d)) return false;
  const s = d.join("");
  const dd = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  const aaaa = Number(s.slice(4, 8));
  if (mm < 1 || mm > 12) return false;
  if (aaaa < 1900 || aaaa > 2100) return false;
  const diasNoMes = new Date(aaaa, mm, 0).getDate(); // dia 0 do mês seguinte = último dia
  return dd >= 1 && dd <= diasNoMes;
}

// Converte [d,d,m,m,a,a,a,a] em número aaaammdd (0 se inválida) p/ comparação.
export function dataParaNumero(d: string[]): number {
  if (!dataValida(d)) return 0;
  const s = d.join("");
  return Number(s.slice(4, 8) + s.slice(2, 4) + s.slice(0, 2));
}

// Idade (em meses completos) do paciente na data do atendimento. null se alguma das
// datas não é válida, ou se o atendimento é anterior ao nascimento (não faz sentido).
export function idadeEmMeses(dataNasc: string[], dataAtend: string[]): number | null {
  if (!dataValida(dataNasc) || !dataValida(dataAtend)) return null;
  const sn = dataNasc.join("");
  const sa = dataAtend.join("");
  const dn = Number(sn.slice(0, 2)), mn = Number(sn.slice(2, 4)), an = Number(sn.slice(4, 8));
  const da = Number(sa.slice(0, 2)), ma = Number(sa.slice(2, 4)), aa = Number(sa.slice(4, 8));
  let meses = (aa - an) * 12 + (ma - mn);
  if (da < dn) meses -= 1; // ainda não completou o mês corrente
  return meses < 0 ? null : meses;
}

function hojeNumero(): number {
  const n = new Date();
  return n.getFullYear() * 10000 + (n.getMonth() + 1) * 100 + n.getDate();
}

// Marca inválido quando a data está completa mas: não é calendário válido, OU está
// no futuro (nascimento/atendimento não podem ser depois de hoje).
export function dataFuturaOuInvalida(d: string[]): boolean {
  if (!dataCompleta(d)) return false; // incompleto nunca acende
  if (!dataValida(d)) return true;
  return dataParaNumero(d) > hojeNumero();
}

// Atendimento com mais de 120 dias — aviso não-bloqueante (a pessoa pode confirmar
// e seguir mesmo assim). Só considera datas de calendário válidas e não-futuras
// (essas já têm o alerta próprio de dataFuturaOuInvalida).
export function atendimentoAntigo(d: string[]): boolean {
  if (!dataCompleta(d) || !dataValida(d) || dataFuturaOuInvalida(d)) return false;
  const s = d.join("");
  const dd = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  const aaaa = Number(s.slice(4, 8));
  const dataAtend = new Date(aaaa, mm - 1, dd);
  const diffDias = Math.floor((Date.now() - dataAtend.getTime()) / 86_400_000);
  return diffDias > 120;
}

// CNS completo mas inválido (incompleto nunca acende).
export function cnsInvalido(cns: string): boolean {
  return cnsCompleto(cns) && !validarCns(cns);
}

// Data de atendimento fora do mês/ano da competência. Aviso NÃO-bloqueante: o BPA
// Magnético critica quando a data do atendimento não cai na competência processada,
// mas existe produção retroativa legítima, então só alertamos. Só acende com a data
// completa, de calendário válida e não-futura (essas já têm o alerta próprio), e com
// a competência (mês+ano) completa.
export function atendimentoForaDaCompetencia(dataAtend: string[], mes: string[], ano: string[]): boolean {
  if (!dataValida(dataAtend) || dataFuturaOuInvalida(dataAtend)) return false;
  const mm = mes.join(""), aaaa = ano.join("");
  if (mm.length !== 2 || aaaa.length !== 4) return false; // competência incompleta: não acende
  const s = dataAtend.join("");
  return s.slice(2, 4) !== mm || s.slice(4, 8) !== aaaa;
}
