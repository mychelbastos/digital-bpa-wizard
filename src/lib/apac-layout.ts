// APAC — Autorização de Procedimentos Ambulatoriais (Laudo de Solicitação / Autorização).
// 2 páginas. Coordenadas em % da imagem de fundo (1653×2339). PRIMEIRO PASSE — a calibração
// fina é feita visualmente no editor da página (/apac). Muitos campos têm casinhas de 1
// dígito (celulas), datas (data) e códigos numéricos (num/maxLen).
import type { CampoForm as Campo, CheckForm as Check } from "@/components/FormularioOverlay";

// 10 linhas de "Procedimento Secundário": código (10 casinhas) | nome | qtde.
const secundarios: Campo[] = [];
for (let i = 0; i < 10; i++) {
  const top = 37.4 + i * 3.15;
  secundarios.push({ key: `sec_cod_${i}`, top, left: 2, width: 27, celulas: 10 });
  secundarios.push({ key: `sec_nome_${i}`, top: top + 0.2, left: 30, width: 58, upper: true });
  secundarios.push({ key: `sec_qtde_${i}`, top, left: 89, width: 9, num: true });
}

export const CAMPOS: Campo[] = [
  // ---------- PÁGINA 1 ----------
  // Estabelecimento solicitante
  { key: "estab_solic_nome", top: 9.7, left: 2, width: 78, upper: true },
  { key: "estab_solic_cnes", top: 9.5, left: 82, width: 16, celulas: 7 },
  // Paciente
  { key: "pac_nome", top: 14.1, left: 2, width: 62, upper: true },
  { key: "pac_prontuario", top: 14.1, left: 65, width: 15, num: true },
  { key: "pac_cpf_cns", top: 16.2, left: 2, width: 40, celulas: 15 },
  { key: "pac_nascimento", top: 16.2, left: 44, width: 12, data: true },
  { key: "pac_raca", top: 16.2, left: 72, width: 8, num: true, maxLen: 2 },
  { key: "pac_etnia", top: 16.2, left: 82, width: 14, num: true, maxLen: 4 },
  { key: "pac_mae", top: 18.7, left: 2, width: 58, upper: true },
  { key: "pac_ddd_cel", top: 18.7, left: 62, width: 6, celulas: 2 },
  { key: "pac_tel_cel", top: 18.7, left: 70, width: 28, celulas: 9 },
  { key: "pac_responsavel", top: 21.4, left: 2, width: 58, upper: true },
  { key: "pac_ddd_contato", top: 21.4, left: 62, width: 6, celulas: 2 },
  { key: "pac_tel_contato", top: 21.4, left: 70, width: 28, celulas: 9 },
  { key: "pac_endereco", top: 24.4, left: 2, width: 96, upper: true },
  { key: "pac_mun_residencia", top: 27.1, left: 2, width: 56, upper: true },
  { key: "pac_ibge", top: 27.1, left: 60, width: 16, celulas: 7 },
  { key: "pac_uf", top: 27.1, left: 78, width: 5, letras: true, maxLen: 2 },
  { key: "pac_cep", top: 27.1, left: 84, width: 14, celulas: 8 },
  // Procedimento principal
  { key: "proc_princ_codigo", top: 32.5, left: 2, width: 26, celulas: 10 },
  { key: "proc_princ_servico", top: 32.5, left: 29, width: 8, celulas: 3 },
  { key: "proc_princ_class", top: 32.5, left: 38, width: 8, celulas: 3 },
  { key: "proc_princ_nome", top: 32.5, left: 47, width: 41, upper: true },
  { key: "proc_princ_qtde", top: 32.5, left: 89, width: 9, num: true },
  // Procedimentos secundários (10 linhas)
  ...secundarios,
  // Diagnóstico histopatológico
  { key: "diag_data", top: 73.2, left: 2, width: 14, data: true },
  { key: "diag_cid", top: 73.2, left: 18, width: 12, upper: true, maxLen: 4 },
  { key: "diag_descricao", top: 73.2, left: 31, width: 66, upper: true },
  // Justificativa
  { key: "just_descricao", top: 78.2, left: 2, width: 50, upper: true },
  { key: "cid_principal", top: 78.2, left: 54, width: 10, upper: true, maxLen: 4 },
  { key: "cid_secundario", top: 78.2, left: 65, width: 12, upper: true },
  { key: "cid_causas", top: 78.2, left: 78, width: 20, upper: true },
  { key: "observacoes", top: 82.5, left: 2, width: 96, height: 12, area: true, upper: true },

  // ---------- PÁGINA 2 ----------
  { key: "prof_solic_nome", top: 6.9, left: 2, width: 48, upper: true, pagina: 2 },
  { key: "data_solicitacao", top: 6.9, left: 52, width: 14, data: true, pagina: 2 },
  { key: "prof_solic_cns", top: 11.2, left: 2, width: 40, celulas: 15, pagina: 2 },
  { key: "prof_autoriz_nome", top: 15.6, left: 2, width: 42, upper: true, pagina: 2 },
  { key: "orgao_emissor", top: 15.6, left: 46, width: 12, celulas: 4, pagina: 2 },
  { key: "num_autorizacao", top: 15.6, left: 60, width: 26, celulas: 13, pagina: 2 },
  { key: "prof_autoriz_cns", top: 17.5, left: 2, width: 40, celulas: 15, pagina: 2 },
  { key: "data_autorizacao", top: 20.2, left: 2, width: 14, data: true, pagina: 2 },
  { key: "validade_inicio", top: 20.2, left: 60, width: 14, data: true, pagina: 2 },
  { key: "validade_fim", top: 20.2, left: 78, width: 14, data: true, pagina: 2 },
  { key: "estab_exec_nome", top: 26.6, left: 2, width: 78, upper: true, pagina: 2 },
  { key: "estab_exec_cnes", top: 26.4, left: 82, width: 16, celulas: 7, pagina: 2 },
];

export const CHECKS: Check[] = [
  { key: "rua_sim", top: 14.3, left: 88, grupo: "rua" },
  { key: "rua_nao", top: 14.3, left: 93.5, grupo: "rua" },
  { key: "sexo_masc", top: 16.4, left: 60, grupo: "sexo" },
  { key: "sexo_fem", top: 16.4, left: 66.5, grupo: "sexo" },
];
