// Laudo AIH (Laudo para Solicitação de Autorização de Internação Hospitalar) — SESAB/SUS
// Portaria 1.734/2006. Coordenadas em % da imagem de fundo (1544×2204).
//
// Calibradas sobre a imagem (linhas horizontais detectadas + arestas dos quadradinhos +
// verificação por overlay). Campos "area" são textarea (blocos grandes da Justificativa).

export interface Campo {
  key: string;
  top: number;
  left: number;
  width: number;
  height?: number; // % — default 1.3 (linha única)
  area?: boolean;  // textarea (multi-linha)
  upper?: boolean; // exibe em MAIÚSCULAS
}

export interface Check {
  key: string;
  top: number;
  left: number;
}

export const CAMPOS: Campo[] = [
  { key: "data_emissao", top: 3.3, left: 21.9, width: 9.5, height: 1 },
  { key: "hora_emissao", top: 3.2, left: 85.5, width: 4.6, height: 1 },
  { key: "estab_solicitante_nome", top: 6.4, left: 1, width: 71, height: 1.2, upper: true },
  { key: "estab_solicitante_cnes", top: 6.3, left: 73.6, width: 25 },
  { key: "estab_executante_nome", top: 8.9, left: 1, width: 71, upper: true },
  { key: "estab_executante_cnes", top: 8.9, left: 74, width: 24 },
  { key: "pac_nome", top: 12.3, left: 1, width: 60, upper: true },
  { key: "pac_apelido", top: 12.3, left: 61.4, width: 19.8, upper: true },
  { key: "pac_prontuario", top: 12.4, left: 81.9, width: 16.9, height: 1.2 },
  { key: "pac_cns", top: 14.9, left: 1, width: 30.5, height: 1.1 },
  { key: "pac_nascimento", top: 14.9, left: 32.3, width: 15.1, height: 1.1 },
  { key: "pac_mae", top: 17.3, left: 1.1, width: 69.8, height: 1.2, upper: true },
  { key: "pac_ddd", top: 17.3, left: 71.5, width: 5.6, height: 1.2 },
  { key: "pac_telefone", top: 17.2, left: 77.7, width: 21.1 },
  { key: "mun_nascimento", top: 19.7, left: 1.2, width: 15.8, height: 1.2, upper: true },
  { key: "uf_nascimento", top: 19.7, left: 17.6, width: 3.2, height: 1.2, upper: true },
  { key: "nacionalidade", top: 19.7, left: 21.6, width: 10, height: 1.2, upper: true },
  { key: "endereco", top: 19.7, left: 32.3, width: 66.4, height: 1.1, upper: true },
  { key: "numero", top: 22.1, left: 1.2, width: 7.5, height: 1.1 },
  { key: "bairro", top: 22.1, left: 9.1, width: 18.4, height: 1.1, upper: true },
  { key: "mun_residencia", top: 22.1, left: 28, width: 19.4, height: 1.1, upper: true },
  { key: "ibge", top: 22.2, left: 48, width: 24.7, height: 1 },
  { key: "uf_residencia", top: 22.2, left: 73.3, width: 4, height: 1, upper: true },
  { key: "cep", top: 22.1, left: 77.8, width: 21, height: 1.2 },
  { key: "ponto_referencia", top: 24.4, left: 1.3, width: 34.3, upper: true },
  { key: "documento_numero", top: 24.8, left: 45.4, width: 53.3, height: 1 },
  { key: "diretor_nome", top: 28, left: 1.2, width: 26.3, upper: true },
  { key: "diretor_conselho", top: 27.9, left: 27.9, width: 11.5 },
  { key: "diretor_cpf", top: 27.8, left: 39.7, width: 31.1 },
  { key: "sinais_sintomas", top: 31.5, left: 1.5, width: 96.9, height: 6.3, area: true, upper: true },
  { key: "resultados_provas", top: 39.1, left: 1.6, width: 96.5, height: 6.3, area: true, upper: true },
  { key: "condicoes", top: 46.9, left: 1.1, width: 97.7, height: 5.7, area: true, upper: true },
  { key: "diagnostico_inicial", top: 53.9, left: 1, width: 28, upper: true },
  { key: "cid_principal", top: 53.9, left: 30.1, width: 9 },
  { key: "cid_secundario", top: 53.9, left: 39.7, width: 21 },
  { key: "cid_causas", top: 53.9, left: 61.3, width: 16 },
  { key: "notif_compulsoria", top: 53.9, left: 77.7, width: 21 },
  { key: "proc_descricao", top: 56.9, left: 1, width: 69.8, height: 1.5, upper: true },
  { key: "proc_codigo", top: 57, left: 71.4, width: 27.4, height: 1.4 },
  { key: "carater_codigo", top: 59.4, left: 1.5, width: 3.4 },
  { key: "clinica", top: 59.4, left: 21.5, width: 45.3, upper: true },
  { key: "leito_complementar", top: 59.4, left: 67.4, width: 31.3, height: 1.2, upper: true },
  { key: "equipamentos", top: 61.8, left: 1.1, width: 98, height: 1.5, upper: true },
  { key: "prof_nome", top: 65, left: 1, width: 98, height: 1.5, upper: true },
  { key: "prof_num_documento", top: 67.5, left: 25.7, width: 49.6 },
  { key: "prof_conselho", top: 67.5, left: 75.8, width: 22.9 },
  { key: "data_solicitacao", top: 69.6, left: 1.3, width: 14, height: 1.8 },
  { key: "data_desejada", top: 69.8, left: 75.9, width: 22.9, height: 1.6 },
  { key: "cnpj_seguradora", top: 73.4, left: 21.5, width: 28, height: 1.4, upper: true },
  { key: "numero_bilhete", top: 73.3, left: 50.1, width: 28.8, height: 1.4 },
  { key: "serie", top: 73.4, left: 80, width: 18.6, height: 1.4 },
  { key: "cnpj_empresa", top: 75.9, left: 21.6, width: 27 },
  { key: "cnae_empresa", top: 75.9, left: 50, width: 26 },
  { key: "cbor", top: 75.8, left: 79.9, width: 18.1 },
  { key: "autorizador_nome", top: 80.8, left: 1, width: 38, height: 3.8, upper: true },
  { key: "autorizador_num_doc", top: 86.1, left: 13.5, width: 25.6, height: 3.1 },
  { key: "orgao_emissor", top: 90.8, left: 17.8, width: 21.3, height: 3.1 },
  { key: "data_autorizacao", top: 90.7, left: 1.3, width: 15.5, height: 3 },
  { key: "registro_conselho", top: 95.1, left: 1.2, width: 15.9, height: 2.8 },
];

export const CHECKS: Check[] = [
  { key: "sexo_masculino", top: 15, left: 55.2 },
  { key: "sexo_feminino", top: 14.9, left: 71.3 },
  { key: "convenio_sim", top: 14.8, left: 77.8 },
  { key: "convenio_nao", top: 14.8, left: 90.5 },
  { key: "doc_cpf", top: 23.4, left: 43.8 },
  { key: "doc_rg", top: 23.4, left: 55.8 },
  { key: "doc_rcivil", top: 23.4, left: 67.2 },
  { key: "doc_pispasep", top: 23.4, left: 79.9 },
  { key: "doc_ignorado", top: 23.4, left: 90.4 },
  { key: "carater_ue", top: 59.5, left: 7 },
  { key: "carater_eletivo", top: 59.5, left: 13.5 },
  { key: "prof_doc_cns", top: 67.8, left: 3.4 },
  { key: "prof_doc_cpf", top: 67.7, left: 13.5 },
  { key: "ac_transito", top: 72.5, left: 1.5 },
  { key: "acid_trab_tipico", top: 73.6, left: 1.4 },
  { key: "ac_trab_trajeto", top: 75, left: 1.6 },
  { key: "vinc_empregado", top: 77.6, left: 19.4 },
  { key: "vinc_empregador", top: 77.5, left: 34.2 },
  { key: "vinc_autonomo", top: 77.5, left: 48.2 },
  { key: "vinc_desempregado", top: 77.5, left: 61.4 },
  { key: "vinc_aposentado", top: 77.6, left: 75 },
  { key: "vinc_nao_segurado", top: 77.5, left: 87.2 },
  { key: "aut_doc_cns", top: 86.4, left: 1.3 },
  { key: "aut_doc_cpf", top: 86.7, left: 7.3 },
];

export type LaudoState = Record<string, string> & { _checks?: Record<string, boolean> };
