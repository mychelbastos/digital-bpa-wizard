// Overlay da folha oficial do RAAS Psicossocial (Formulario_Raas_PSI.pdf -> raas-1/2.png,
// 1654x2339). Espelha o modelo dos outros formularios (APAC/BPA): CAMPOS/CHECKS em % da
// imagem, renderizados pelo FormularioOverlay. Aqui NAO se digita — a folha e preenchida a
// partir do RaasState (tela em secoes) so para gerar o PDF; por isso ha tambem o conversor
// `raasStateParaOverlay`.
//
// POSICOES: cabecalho/identificacao/atendimento e as acoes 0, 5 (pag.1) e 17 (pag.2) foram
// calibradas na tela ("Editar posicoes" -> "Copiar coordenadas"). As demais acoes (1-4 e
// 6-16) sao INTERPOLADAS a partir dessas ancoras: geometria horizontal canonica das colunas
// + passo vertical 6.84%/linha (pag.1: a0=56.8 -> a5=91.0). A pag.2 usa o mesmo passo
// ancorado em a17. Para recalibrar, arraste na tela e cole o array de volta aqui.
import type { CampoForm as Campo, CheckForm as Check } from "@/components/FormularioOverlay";
import type { RaasState, RaasAcao } from "@/lib/raas/raas-layout";

// 18 acoes por folha: 6 na pagina 1 + 12 na pagina 2.
export const ACOES_PAGINA_1 = 6;
export const ACOES_PAGINA_2 = 12;
export const ACOES_POR_FOLHA = ACOES_PAGINA_1 + ACOES_PAGINA_2;

export const CAMPOS: Campo[] = [
  { key: "estab_nome", top: 10.9, left: 5.5, width: 70.2, height: 1.5, upper: true },
  { key: "estab_cnes", top: 10.7, left: 77.7, width: 16.4, height: 1.6, celulas: 7 },
  { key: "prontuario", top: 15.7, left: 5.5, width: 14, height: 1.7, num: true, maxLen: 10 },
  { key: "paciente_nome", top: 15.7, left: 21.4, width: 72.5, height: 1.6, upper: true },
  { key: "cns", top: 18.5, left: 5.8, width: 44, height: 1.5, celulas: 15 },
  { key: "nascimento", top: 18.5, left: 60.1, width: 14, height: 1.5, data: true },
  { key: "nacionalidade", top: 18.3, left: 76.1, width: 17.7, height: 1.6, num: true, maxLen: 3 },
  { key: "raca", top: 21.5, left: 5.5, width: 13.8, height: 1.5, num: true, maxLen: 2 },
  { key: "etnia", top: 21.5, left: 21, width: 22.8, height: 1.5, num: true, maxLen: 4 },
  { key: "mae", top: 21.5, left: 46, width: 48.1, height: 1.7, upper: true },
  { key: "responsavel", top: 24.3, left: 5.5, width: 39, height: 1.7, upper: true },
  { key: "municipio", top: 24.5, left: 45.6, width: 42, height: 1.7, upper: true },
  { key: "uf", top: 24.6, left: 88.7, width: 5.4, height: 1.5, letras: true, celulas: 2 },
  { key: "ibge", top: 27.1, left: 5.5, width: 13.5, height: 1.7, celulas: 7 },
  { key: "cep", top: 27.1, left: 20.4, width: 14.9, height: 1.6, celulas: 8 },
  { key: "endereco", top: 27.1, left: 36.5, width: 57.6, height: 1.6, upper: true },
  { key: "complemento", top: 29.9, left: 5.5, width: 34.2, height: 1.8, upper: true },
  { key: "cel_ddd", top: 30.6, left: 41, width: 5, height: 1.2, celulas: 2 },
  { key: "cel_num", top: 30.6, left: 46.1, width: 20.9, height: 1.2, celulas: 9 },
  { key: "contato_ddd", top: 30.6, left: 68.3, width: 4.8, height: 1.2, celulas: 2 },
  { key: "contato_num", top: 30.5, left: 73.5, width: 21, celulas: 9 },
  { key: "admissao", top: 35.5, left: 6.2, width: 13.3, height: 1.5, data: true },
  { key: "mes_atend", top: 35.4, left: 23.5, width: 11.5, height: 1.6, celulas: 6 },
  { key: "autorizacao", top: 35.5, left: 43, width: 51.3, height: 1.5, celulas: 13 },
  { key: "cid_principal", top: 42.9, left: 5.5, width: 10, height: 1.5, upper: true, letras: true, celulas: 4 },
  { key: "cid_principal_desc", top: 42.8, left: 16.7, width: 77.2, height: 1.7, upper: true },
  { key: "cid_causas", top: 46.1, left: 5.5, width: 10, height: 1.5, upper: true, letras: true, celulas: 4 },
  { key: "cid_causas_desc", top: 45.8, left: 16.8, width: 77.2, height: 1.5, upper: true },
  { key: "esf_cnes", top: 48.4, left: 53.3, width: 16, height: 1.5, celulas: 7 },
  { key: "conclusao", top: 51, left: 81.3, width: 12.9, height: 1.5, data: true },
  { key: "a0_cod", top: 56.8, left: 6.7, width: 47.4, height: 1.6, celulas: 10, pagina: 1 },
  { key: "a0_qtd", top: 56.5, left: 55.9, width: 4.9, height: 1.9, num: true, maxLen: 6, pagina: 1 },
  { key: "a0_data", top: 56.7, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 1 },
  { key: "a0_srv", top: 56.5, left: 73.1, width: 8.6, height: 1.8, celulas: 3, pagina: 1 },
  { key: "a0_cls", top: 56.7, left: 84, width: 8.9, height: 1.8, celulas: 3, pagina: 1 },
  { key: "a0_cbo", top: 59.8, left: 6.7, width: 17.9, height: 1.7, celulas: 6, pagina: 1 },
  { key: "a0_cns", top: 59.8, left: 27.1, width: 43.3, height: 1.8, celulas: 15, pagina: 1 },
  { key: "a1_cod", top: 63.64, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 1 },
  { key: "a1_qtd", top: 63.64, left: 56, width: 4.8, height: 1.8, num: true, maxLen: 6, pagina: 1 },
  { key: "a1_data", top: 63.64, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 1 },
  { key: "a1_srv", top: 63.5, left: 73.1, width: 8.5, height: 1.8, celulas: 3, pagina: 1 },
  { key: "a1_cls", top: 63.7, left: 84.1, width: 8.9, height: 1.6, celulas: 3, pagina: 1 },
  { key: "a1_cbo", top: 66.64, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 1 },
  { key: "a1_cns", top: 66.64, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 1 },
  { key: "a2_cod", top: 70.48, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 1 },
  { key: "a2_qtd", top: 70.3, left: 56, width: 4.8, height: 1.8, num: true, maxLen: 6, pagina: 1 },
  { key: "a2_data", top: 70.4, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 1 },
  { key: "a2_srv", top: 70.3, left: 73.1, width: 8.6, height: 1.7, celulas: 3, pagina: 1 },
  { key: "a2_cls", top: 70.4, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 1 },
  { key: "a2_cbo", top: 73.48, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 1 },
  { key: "a2_cns", top: 73.48, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 1 },
  { key: "a3_cod", top: 77.32, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 1 },
  { key: "a3_qtd", top: 77.2, left: 56, width: 4.8, height: 1.8, num: true, maxLen: 6, pagina: 1 },
  { key: "a3_data", top: 77.32, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 1 },
  { key: "a3_srv", top: 77.32, left: 73.2, width: 8.6, height: 1.7, celulas: 3, pagina: 1 },
  { key: "a3_cls", top: 77.32, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 1 },
  { key: "a3_cbo", top: 80.32, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 1 },
  { key: "a3_cns", top: 80.32, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 1 },
  { key: "a4_cod", top: 84.16, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 1 },
  { key: "a4_qtd", top: 84.2, left: 56, width: 4.8, height: 1.5, num: true, maxLen: 6, pagina: 1 },
  { key: "a4_data", top: 84.2, left: 63.2, width: 7.7, height: 1.5, celulas: 4, pagina: 1 },
  { key: "a4_srv", top: 84, left: 73.2, width: 8.6, height: 1.6, celulas: 3, pagina: 1 },
  { key: "a4_cls", top: 84.2, left: 84.1, width: 9, height: 1.4, celulas: 3, pagina: 1 },
  { key: "a4_cbo", top: 87.16, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 1 },
  { key: "a4_cns", top: 87.16, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 1 },
  { key: "a5_cod", top: 91, left: 6.8, width: 47.4, height: 1.8, celulas: 10, pagina: 1 },
  { key: "a5_qtd", top: 90.9, left: 56.1, width: 4.7, height: 1.7, num: true, maxLen: 6, pagina: 1 },
  { key: "a5_data", top: 90.9, left: 63.2, width: 7.9, height: 1.8, celulas: 4, pagina: 1 },
  { key: "a5_srv", top: 90.9, left: 73.2, width: 8.7, height: 1.7, celulas: 3, pagina: 1 },
  { key: "a5_cls", top: 90.9, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 1 },
  { key: "a5_cbo", top: 94, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 1 },
  { key: "a5_cns", top: 94.1, left: 26.8, width: 43.5, height: 1.7, celulas: 15, pagina: 1 },
  { key: "a6_cod", top: 13.06, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 2 },
  { key: "a6_qtd", top: 13.1, left: 56, width: 4.8, height: 1.6, num: true, maxLen: 6, pagina: 2 },
  { key: "a6_data", top: 13.1, left: 63.2, width: 7.8, height: 1.6, celulas: 4, pagina: 2 },
  { key: "a6_srv", top: 12.9, left: 73.1, width: 8.8, height: 1.6, celulas: 3, pagina: 2 },
  { key: "a6_cls", top: 12.9, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a6_cbo", top: 16.26, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 2 },
  { key: "a6_cns", top: 16.1, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 2 },
  { key: "a7_cod", top: 19.9, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 2 },
  { key: "a7_qtd", top: 19.9, left: 56, width: 4.8, height: 1.8, num: true, maxLen: 6, pagina: 2 },
  { key: "a7_data", top: 19.9, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 2 },
  { key: "a7_srv", top: 19.8, left: 73.2, width: 8.6, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a7_cls", top: 19.8, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a7_cbo", top: 23.1, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 2 },
  { key: "a7_cns", top: 23, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 2 },
  { key: "a8_cod", top: 26.6, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 2 },
  { key: "a8_qtd", top: 26.6, left: 56, width: 4.8, height: 1.8, num: true, maxLen: 6, pagina: 2 },
  { key: "a8_data", top: 26.5, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 2 },
  { key: "a8_srv", top: 26.5, left: 73.2, width: 8.6, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a8_cls", top: 26.5, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a8_cbo", top: 29.8, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 2 },
  { key: "a8_cns", top: 29.7, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 2 },
  { key: "a9_cod", top: 33.5, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 2 },
  { key: "a9_qtd", top: 33.4, left: 56, width: 4.8, height: 1.8, num: true, maxLen: 6, pagina: 2 },
  { key: "a9_data", top: 33.4, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 2 },
  { key: "a9_srv", top: 33.4, left: 73.2, width: 8.6, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a9_cls", top: 33.4, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a9_cbo", top: 36.7, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 2 },
  { key: "a9_cns", top: 36.7, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 2 },
  { key: "a10_cod", top: 40.42, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 2 },
  { key: "a10_qtd", top: 40.42, left: 56, width: 4.8, height: 1.8, num: true, maxLen: 6, pagina: 2 },
  { key: "a10_data", top: 40.42, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 2 },
  { key: "a10_srv", top: 40.1, left: 73.2, width: 8.6, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a10_cls", top: 40.2, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a10_cbo", top: 43.3, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 2 },
  { key: "a10_cns", top: 43.4, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 2 },
  { key: "a11_cod", top: 47.26, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 2 },
  { key: "a11_qtd", top: 47.26, left: 56, width: 4.8, height: 1.8, num: true, maxLen: 6, pagina: 2 },
  { key: "a11_data", top: 47.26, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 2 },
  { key: "a11_srv", top: 47.26, left: 73.2, width: 8.6, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a11_cls", top: 47.26, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a11_cbo", top: 50.46, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 2 },
  { key: "a11_cns", top: 50.46, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 2 },
  { key: "a12_cod", top: 54.1, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 2 },
  { key: "a12_qtd", top: 54.1, left: 56, width: 4.8, height: 1.8, num: true, maxLen: 6, pagina: 2 },
  { key: "a12_data", top: 54.1, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 2 },
  { key: "a12_srv", top: 54.1, left: 73.2, width: 8.6, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a12_cls", top: 54.1, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a12_cbo", top: 57.3, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 2 },
  { key: "a12_cns", top: 57.3, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 2 },
  { key: "a13_cod", top: 60.94, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 2 },
  { key: "a13_qtd", top: 60.94, left: 56, width: 4.8, height: 1.8, num: true, maxLen: 6, pagina: 2 },
  { key: "a13_data", top: 60.94, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 2 },
  { key: "a13_srv", top: 60.94, left: 73.2, width: 8.6, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a13_cls", top: 60.94, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a13_cbo", top: 64.14, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 2 },
  { key: "a13_cns", top: 64.14, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 2 },
  { key: "a14_cod", top: 67.78, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 2 },
  { key: "a14_qtd", top: 67.78, left: 56, width: 4.8, height: 1.8, num: true, maxLen: 6, pagina: 2 },
  { key: "a14_data", top: 67.78, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 2 },
  { key: "a14_srv", top: 67.78, left: 73.2, width: 8.6, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a14_cls", top: 67.78, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a14_cbo", top: 70.98, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 2 },
  { key: "a14_cns", top: 70.98, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 2 },
  { key: "a15_cod", top: 74.62, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 2 },
  { key: "a15_qtd", top: 74.62, left: 56, width: 4.8, height: 1.8, num: true, maxLen: 6, pagina: 2 },
  { key: "a15_data", top: 74.62, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 2 },
  { key: "a15_srv", top: 74.62, left: 73.2, width: 8.6, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a15_cls", top: 74.62, left: 84.1, width: 9, height: 1.7, celulas: 3, pagina: 2 },
  { key: "a15_cbo", top: 77.82, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 2 },
  { key: "a15_cns", top: 77.82, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 2 },
  { key: "a16_cod", top: 81.4, left: 6.7, width: 47.5, height: 1.7, celulas: 10, pagina: 2 },
  { key: "a16_qtd", top: 81.5, left: 56, width: 4.8, height: 1.6, num: true, maxLen: 6, pagina: 2 },
  { key: "a16_data", top: 81.46, left: 63.2, width: 7.8, height: 1.8, celulas: 4, pagina: 2 },
  { key: "a16_srv", top: 81.5, left: 73.2, width: 8.8, height: 1.5, celulas: 3, pagina: 2 },
  { key: "a16_cls", top: 81.5, left: 84.1, width: 9, height: 1.4, celulas: 3, pagina: 2 },
  { key: "a16_cbo", top: 84.66, left: 6.8, width: 17.8, height: 1.7, celulas: 6, pagina: 2 },
  { key: "a16_cns", top: 84.66, left: 27, width: 43.4, height: 1.7, celulas: 15, pagina: 2 },
  { key: "a17_cod", top: 88.2, left: 6.6, width: 47.8, height: 1.8, celulas: 10, pagina: 2 },
  { key: "a17_qtd", top: 88.3, left: 56, width: 4.9, height: 1.8, num: true, maxLen: 6, pagina: 2 },
  { key: "a17_data", top: 88.4, left: 63.2, width: 7.7, height: 1.7, celulas: 4, pagina: 2 },
  { key: "a17_srv", top: 88.4, left: 73.2, width: 8.6, height: 1.6, celulas: 3, pagina: 2 },
  { key: "a17_cls", top: 88.4, left: 84.1, width: 9, height: 1.6, celulas: 3, pagina: 2 },
  { key: "a17_cbo", top: 91.5, left: 6.9, width: 17.7, height: 1.6, celulas: 6, pagina: 2 },
  { key: "a17_cns", top: 91.5, left: 27, width: 43.3, height: 1.6, celulas: 15, pagina: 2 },
];

export const CHECKS: Check[] = [
  { key: "sexo_m", top: 18.6, left: 52.6, grupo: "sexo" },
  { key: "sexo_f", top: 18.6, left: 56.7, grupo: "sexo" },
  { key: "droga_nao", top: 39.5, left: 9.4, grupo: "droga" },
  { key: "droga_sim", top: 39.5, left: 15, grupo: "droga" },
  { key: "droga_alcool", top: 39.7, left: 39.4 },
  { key: "droga_crack", top: 39.8, left: 45.6 },
  { key: "droga_outras", top: 39.7, left: 52.3 },
  { key: "origem_01", top: 38.9, left: 59.3, grupo: "origem" },
  { key: "origem_02", top: 38.8, left: 72.3, grupo: "origem" },
  { key: "origem_03", top: 38.9, left: 82.2, grupo: "origem" },
  { key: "origem_04", top: 40.3, left: 59.3, grupo: "origem" },
  { key: "origem_05", top: 40.2, left: 72.3, grupo: "origem" },
  { key: "origem_06", top: 40.3, left: 82.3, grupo: "origem" },
  { key: "esf_sim", top: 48.6, left: 37.2, grupo: "esf" },
  { key: "esf_nao", top: 48.5, left: 44.7, grupo: "esf" },
  { key: "encam_01", top: 51.3, left: 6.2, grupo: "encam" },
  { key: "encam_02", top: 51.3, left: 34, grupo: "encam" },
  { key: "encam_03", top: 51.3, left: 64.7, grupo: "encam" },
  { key: "encam_04", top: 51.3, left: 72.1, grupo: "encam" },
  { key: "a0_caps", top: 60.2, left: 73.8, grupo: "a0_local", pagina: 1 },
  { key: "a0_terr", top: 60.1, left: 85.1, grupo: "a0_local", pagina: 1 },
  { key: "a1_caps", top: 67.1, left: 74, grupo: "a1_local", pagina: 1 },
  { key: "a1_terr", top: 66.9, left: 85.2, grupo: "a1_local", pagina: 1 },
  { key: "a2_caps", top: 73.78, left: 73.9, grupo: "a2_local", pagina: 1 },
  { key: "a2_terr", top: 73.78, left: 85.1, grupo: "a2_local", pagina: 1 },
  { key: "a3_caps", top: 80.62, left: 73.9, grupo: "a3_local", pagina: 1 },
  { key: "a3_terr", top: 80.62, left: 85.1, grupo: "a3_local", pagina: 1 },
  { key: "a4_caps", top: 87.46, left: 73.9, grupo: "a4_local", pagina: 1 },
  { key: "a4_terr", top: 87.46, left: 85.1, grupo: "a4_local", pagina: 1 },
  { key: "a5_caps", top: 94.3, left: 73.9, grupo: "a5_local", pagina: 1 },
  { key: "a5_terr", top: 94.3, left: 85.1, grupo: "a5_local", pagina: 1 },
  { key: "a6_caps", top: 16.3, left: 73.8, grupo: "a6_local", pagina: 2 },
  { key: "a6_terr", top: 16.3, left: 85.1, grupo: "a6_local", pagina: 2 },
  { key: "a7_caps", top: 23.1, left: 73.9, grupo: "a7_local", pagina: 2 },
  { key: "a7_terr", top: 23.1, left: 85.1, grupo: "a7_local", pagina: 2 },
  { key: "a8_caps", top: 29.9, left: 73.8, grupo: "a8_local", pagina: 2 },
  { key: "a8_terr", top: 29.9, left: 85.1, grupo: "a8_local", pagina: 2 },
  { key: "a9_caps", top: 36.8, left: 73.8, grupo: "a9_local", pagina: 2 },
  { key: "a9_terr", top: 36.7, left: 85.1, grupo: "a9_local", pagina: 2 },
  { key: "a10_caps", top: 43.6, left: 73.8, grupo: "a10_local", pagina: 2 },
  { key: "a10_terr", top: 43.5, left: 85.1, grupo: "a10_local", pagina: 2 },
  { key: "a11_caps", top: 50.6, left: 73.8, grupo: "a11_local", pagina: 2 },
  { key: "a11_terr", top: 50.4, left: 85.1, grupo: "a11_local", pagina: 2 },
  { key: "a12_caps", top: 57.5, left: 73.7, grupo: "a12_local", pagina: 2 },
  { key: "a12_terr", top: 57.4, left: 85.1, grupo: "a12_local", pagina: 2 },
  { key: "a13_caps", top: 64.3, left: 73.7, grupo: "a13_local", pagina: 2 },
  { key: "a13_terr", top: 64.1, left: 85.1, grupo: "a13_local", pagina: 2 },
  { key: "a14_caps", top: 71.1, left: 73.7, grupo: "a14_local", pagina: 2 },
  { key: "a14_terr", top: 71, left: 85.1, grupo: "a14_local", pagina: 2 },
  { key: "a15_caps", top: 78, left: 73.7, grupo: "a15_local", pagina: 2 },
  { key: "a15_terr", top: 77.9, left: 85.1, grupo: "a15_local", pagina: 2 },
  { key: "a16_caps", top: 84.7, left: 73.7, grupo: "a16_local", pagina: 2 },
  { key: "a16_terr", top: 84.7, left: 85.1, grupo: "a16_local", pagina: 2 },
  { key: "a17_caps", top: 91.7, left: 73.7, grupo: "a17_local", pagina: 2 },
  { key: "a17_terr", top: 91.6, left: 85, grupo: "a17_local", pagina: 2 },
];

// ---------------- Conversao RaasState -> valores do overlay ----------------
type Overlay = { txt: Record<string, string>; chk: Record<string, boolean> };

const soDig = (s: string) => (s || "").replace(/\D/g, "");
// Celula: um caractere por caixa ("2510332" -> "2|5|1|0|3|3|2").
const cel = (s: string) => (s || "").split("").join("|");
// Data "YYYY-MM-DD" -> "DD|MM|YYYY" (segmentos do campo data). Vazio se incompleto.
function dataDDMMYYYY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}|${m[2]}|${m[1]}` : "";
}
// Data "YYYY-MM-DD" -> "D|D|M|M" (celula de 4 caixas, DD/MM da acao). Vazio se incompleto.
function dataDDMM(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[2][0]}|${m[2][1]}|${m[1][0]}|${m[1][1]}` : "";
}

function acaoParaOverlay(a: RaasAcao, n: number, o: Overlay) {
  o.txt[`a${n}_cod`] = cel(soDig(a.procedimento));
  o.txt[`a${n}_qtd`] = soDig(a.quantidade);
  o.txt[`a${n}_data`] = dataDDMM(a.dataExec);
  o.txt[`a${n}_srv`] = cel(soDig(a.servico));
  o.txt[`a${n}_cls`] = cel(soDig(a.classificacao));
  o.txt[`a${n}_cbo`] = cel(soDig(a.cbo));
  o.txt[`a${n}_cns`] = cel(soDig(a.cnsExecutante));
  o.chk[`a${n}_caps`] = a.localRealizacao === "C";
  o.chk[`a${n}_terr`] = a.localRealizacao === "T";
}

export function raasStateParaOverlay(s: RaasState): Overlay {
  const o: Overlay = { txt: {}, chk: {} };

  o.txt.estab_nome = s.estabelecimentoNome || "";
  o.txt.estab_cnes = cel(soDig(s.cnes));

  o.txt.prontuario = soDig(s.prontuario);
  o.txt.paciente_nome = s.nomePaciente || "";
  o.txt.cns = cel(soDig(s.cnsPaciente));
  o.txt.nascimento = dataDDMMYYYY(s.dataNascimento);
  o.txt.nacionalidade = soDig(s.nacionalidade);
  o.txt.raca = soDig(s.raca);
  o.txt.etnia = soDig(s.etnia);
  o.txt.mae = s.nomeMae || "";
  o.txt.responsavel = s.nomeResponsavel || "";
  // Municipio (nome) e UF (sigla) nao sao guardados no RaasState — so o codigo IBGE. Ficam
  // em branco na folha (preenchimento manual/calibracao); o IBGE tem caixas proprias.
  o.txt.municipio = "";
  o.txt.uf = "";
  o.txt.ibge = cel(soDig(s.municipioIbge));
  o.txt.cep = cel(soDig(s.cep));
  o.txt.endereco = [s.logradouro, s.numero].filter(Boolean).join(", ");
  o.txt.complemento = s.complemento || "";
  const cel11 = soDig(s.celular);
  o.txt.cel_ddd = cel(cel11.slice(0, 2));
  o.txt.cel_num = cel(cel11.slice(2));
  const con11 = soDig(s.telefone);
  o.txt.contato_ddd = cel(con11.slice(0, 2));
  o.txt.contato_num = cel(con11.slice(2));

  o.txt.mes_atend = cel(/^\d{6}$/.test(s.competencia) ? s.competencia.slice(4) + s.competencia.slice(0, 4) : "");
  o.txt.autorizacao = cel(soDig(s.autorizacao));
  o.txt.cid_principal = cel((s.cidPrincipal || "").toUpperCase());
  o.txt.cid_causas = cel((s.cidCausas || "").toUpperCase());
  o.txt.esf_cnes = cel(soDig(s.cnesEsf));
  o.txt.conclusao = dataDDMMYYYY(s.dataObitoAlta);

  // Checks
  o.chk.sexo_m = s.sexo === "M";
  o.chk.sexo_f = s.sexo === "F";
  o.chk.droga_sim = s.usuarioDroga === "S";
  o.chk.droga_nao = s.usuarioDroga === "N";
  o.chk.droga_alcool = s.tiposDroga.includes("A");
  o.chk.droga_crack = s.tiposDroga.includes("C");
  o.chk.droga_outras = s.tiposDroga.includes("O");
  for (let i = 1; i <= 6; i++) o.chk[`origem_0${i}`] = s.origemPaciente === `0${i}`;
  for (let i = 1; i <= 4; i++) o.chk[`encam_0${i}`] = s.destinoPaciente === `0${i}`;
  o.chk.esf_sim = s.coberturaEsf === "S";
  o.chk.esf_nao = s.coberturaEsf === "N";

  // Acoes (ate 18 na folha; excedente vai numa folha futura).
  s.acoes.slice(0, ACOES_POR_FOLHA).forEach((a, i) => acaoParaOverlay(a, i, o));

  return o;
}
