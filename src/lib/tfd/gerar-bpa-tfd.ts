// Gerador de procedimentos BPA a partir de um TFD (Tratamento Fora de Domicílio).
// PURO e testável: só matemática, sem banco, sem I/O. A persistência (montar a ficha BPA-I,
// escolher CNS/CBO) fica em outra camada. Regras CONFIRMADAS pelo Mychel (Parte D):
//
//   DESLOCAMENTO (por viagem, ida e volta):
//     unidades_por_viagem = ARREDONDAMENTO_MATEMÁTICO( (distancia_km_ida × 2) ÷ 50 )
//       (fração ≥ 0,5 sobe; < 0,5 desce — Math.round)
//     total_deslocamento = unidades_por_viagem × (qtd_com_pernoite + qtd_sem_pernoite)
//     → 08.03.01.012-5 (paciente)   e, se houver acompanhante, 08.03.01.010-9 (mesma qtd)
//
//   ALIMENTAÇÃO (uma por viagem; total = total de viagens):
//     com pernoite → 08.03.01.001-0 (paciente) × qtd_com_pernoite
//     sem pernoite → 08.03.01.002-8 (paciente) × qtd_sem_pernoite
//     acompanhante (mesma regra) → 004-4 (com) × qtd_com ; 005-2 (sem) × qtd_sem
//
//   Sem acompanhante ⇒ NÃO gera nenhuma linha de acompanhante. Quantidade 0 ⇒ não gera a linha.
//
// ⚠️ REGRA A VALIDAR (não provada contra arquivo real): as linhas de ACOMPANHANTE são
// faturadas sob o CNS do PRÓPRIO ACOMPANHANTE (não do paciente). O gerador só marca `para`;
// quem atribui o CNS é a persistência (ver o comentário lá). Inferência forte pela lógica do
// SUS (códigos separados = produção do acompanhante), mas confirmar quando houver um TFD real
// num .MAR/.JUN.

// Códigos SIGTAP (10 díg., sem pontos/traço). Ex.: 08.03.01.001-0 → "0803010010".
export const COD_TFD = {
  ALIM_PERNOITE_PAC: "0803010010",     // 08.03.01.001-0
  ALIM_SEM_PERNOITE_PAC: "0803010028", // 08.03.01.002-8
  ALIM_PERNOITE_ACOMP: "0803010044",   // 08.03.01.004-4
  ALIM_SEM_PERNOITE_ACOMP: "0803010052", // 08.03.01.005-2
  DESLOC_PAC: "0803010125",            // 08.03.01.012-5
  DESLOC_ACOMP: "0803010109",          // 08.03.01.010-9
} as const;

export interface EntradaTfd {
  distanciaKm: number;      // distância só de IDA (a rota vem do catálogo de destinos)
  qtdComPernoite: number;   // nº de viagens do mês COM pernoite
  qtdSemPernoite: number;   // nº de viagens do mês SEM pernoite
  temAcompanhante: boolean;
}

export interface LinhaBpaTfd {
  codigo: string;                        // SIGTAP 10 díg.
  quantidade: number;
  para: "paciente" | "acompanhante";     // define de QUEM é o CNS na persistência
  descricao: string;
}

// Unidades de deslocamento de UMA viagem (ida+volta). `distanciaKm` = só ida.
// Ex. (mostrando a distância TOTAL ida+volta): 400→8, 440→9 (8,8), 480→10 (9,6), 60→1 (1,2).
export function unidadesDeslocamentoPorViagem(distanciaKm: number): number {
  return Math.round((Math.max(0, distanciaKm) * 2) / 50);
}

// Gera as linhas BPA faturáveis do TFD. Cada linha vira uma seq da ficha BPA-I na persistência.
export function gerarProcedimentosTfd(e: EntradaTfd): LinhaBpaTfd[] {
  const comP = Math.max(0, Math.floor(e.qtdComPernoite || 0));
  const semP = Math.max(0, Math.floor(e.qtdSemPernoite || 0));
  const totalViagens = comP + semP;
  const deslocTotal = unidadesDeslocamentoPorViagem(e.distanciaKm) * totalViagens;

  const linhas: LinhaBpaTfd[] = [];
  const add = (codigo: string, quantidade: number, para: LinhaBpaTfd["para"], descricao: string) => {
    if (quantidade > 0) linhas.push({ codigo, quantidade, para, descricao });
  };

  // Paciente
  add(COD_TFD.DESLOC_PAC, deslocTotal, "paciente", "Deslocamento paciente (cada 50 km)");
  add(COD_TFD.ALIM_PERNOITE_PAC, comP, "paciente", "Ajuda de custo alimentação/pernoite — paciente");
  add(COD_TFD.ALIM_SEM_PERNOITE_PAC, semP, "paciente", "Ajuda de custo alimentação s/ pernoite — paciente");

  // Acompanhante (mesma regra; só se houver). CNS do próprio acompanhante (regra a validar).
  if (e.temAcompanhante) {
    add(COD_TFD.DESLOC_ACOMP, deslocTotal, "acompanhante", "Deslocamento acompanhante (cada 50 km)");
    add(COD_TFD.ALIM_PERNOITE_ACOMP, comP, "acompanhante", "Ajuda de custo alimentação/pernoite — acompanhante");
    add(COD_TFD.ALIM_SEM_PERNOITE_ACOMP, semP, "acompanhante", "Ajuda de custo alimentação s/ pernoite — acompanhante");
  }

  return linhas;
}
