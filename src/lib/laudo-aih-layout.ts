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
  // Emissão
  { key: "data_emissao", top: 3.3, left: 21, width: 12, height: 0.95 },
  { key: "hora_emissao", top: 3.3, left: 84, width: 7, height: 0.95 },

  // Identificação do estabelecimento
  { key: "estab_solicitante_nome", top: 6.4, left: 1, width: 71, height: 1.2, upper: true },
  { key: "estab_solicitante_cnes", top: 6.4, left: 74, width: 24, height: 1.2 },
  { key: "estab_executante_nome", top: 8.9, left: 1, width: 71, height: 1.3, upper: true },
  { key: "estab_executante_cnes", top: 8.9, left: 74, width: 24, height: 1.3 },

  // Identificação do paciente
  { key: "pac_nome", top: 12.5, left: 1, width: 60, height: 1.1, upper: true },
  { key: "pac_apelido", top: 12.5, left: 62, width: 18, height: 1.1, upper: true },
  { key: "pac_prontuario", top: 12.5, left: 81, width: 18, height: 1.1 },
  { key: "pac_cns", top: 14.9, left: 1, width: 30, height: 1.1 },
  { key: "pac_nascimento", top: 14.9, left: 33, width: 18, height: 1.1 },
  { key: "pac_mae", top: 17.4, left: 1, width: 63, height: 1.1, upper: true },
  { key: "pac_ddd", top: 17.4, left: 66, width: 7, height: 1.1 },
  { key: "pac_telefone", top: 17.4, left: 74, width: 25, height: 1.1 },
  { key: "mun_nascimento", top: 19.9, left: 1, width: 15, height: 1.1, upper: true },
  { key: "uf_nascimento", top: 19.9, left: 18, width: 8, height: 1.1, upper: true },
  { key: "nacionalidade", top: 19.9, left: 28, width: 18, height: 1.1, upper: true },
  { key: "endereco", top: 19.9, left: 48, width: 51, height: 1.1, upper: true },
  { key: "numero", top: 22.4, left: 1, width: 8, height: 1.0 },
  { key: "bairro", top: 22.4, left: 10, width: 25, height: 1.0, upper: true },
  { key: "mun_residencia", top: 22.4, left: 36, width: 21, height: 1.0, upper: true },
  { key: "ibge", top: 22.4, left: 58, width: 18, height: 1.0 },
  { key: "uf_residencia", top: 22.4, left: 77, width: 6, height: 1.0, upper: true },
  { key: "cep", top: 22.4, left: 84, width: 15, height: 1.0 },
  { key: "ponto_referencia", top: 25.1, left: 1, width: 33, height: 1.0, upper: true },
  { key: "documento_numero", top: 25.6, left: 40, width: 20, height: 1.0 },

  // Diretor clínico (linha estreita — inputs pequenos abaixo dos rótulos)
  { key: "diretor_nome", top: 30.0, left: 1, width: 26, height: 0.6, upper: true },
  { key: "diretor_conselho", top: 30.0, left: 27, width: 15, height: 0.6 },
  { key: "diretor_cpf", top: 30.0, left: 42, width: 30, height: 0.6 },

  // Justificativa da internação (blocos grandes)
  { key: "sinais_sintomas", top: 33.0, left: 1, width: 98, height: 4.7, area: true, upper: true },
  { key: "resultados_provas", top: 40.0, left: 1, width: 98, height: 5.3, area: true, upper: true },
  { key: "condicoes", top: 47.5, left: 1, width: 98, height: 4.9, area: true, upper: true },
  { key: "diagnostico_inicial", top: 53.9, left: 1, width: 28, upper: true },
  { key: "cid_principal", top: 53.9, left: 29.7, width: 9 },
  { key: "cid_secundario", top: 53.9, left: 39.5, width: 21 },
  { key: "cid_causas", top: 53.9, left: 61.2, width: 16 },
  { key: "notif_compulsoria", top: 53.9, left: 77.5, width: 21 },

  // Procedimento solicitado
  { key: "proc_descricao", top: 56.9, left: 1, width: 66, upper: true },
  { key: "proc_codigo", top: 56.9, left: 68, width: 31 },
  { key: "carater_codigo", top: 59.2, left: 1, width: 5 },
  { key: "clinica", top: 59.2, left: 17, width: 50, upper: true },
  { key: "leito_complementar", top: 59.2, left: 68, width: 31, upper: true },
  { key: "equipamentos", top: 61.5, left: 1, width: 98, height: 1.5, upper: true },

  // Profissional solicitante
  { key: "prof_nome", top: 64.9, left: 1, width: 98, height: 1.5, upper: true },
  { key: "prof_num_documento", top: 67.3, left: 24, width: 44 },
  { key: "prof_conselho", top: 67.3, left: 78, width: 21 },
  { key: "data_solicitacao", top: 69.5, left: 2, width: 18 },
  { key: "data_desejada", top: 69.5, left: 78, width: 21 },

  // Causas externas
  { key: "cnpj_seguradora", top: 74.2, left: 20, width: 44, upper: true },
  { key: "numero_bilhete", top: 74.2, left: 64, width: 20 },
  { key: "serie", top: 74.2, left: 84, width: 15 },
  { key: "cnpj_empresa", top: 76.7, left: 20, width: 27 },
  { key: "cnae_empresa", top: 76.7, left: 47, width: 26 },
  { key: "cbor", top: 76.7, left: 84, width: 15 },

  // Autorização
  { key: "autorizador_nome", top: 81.0, left: 1, width: 38, height: 1.5, upper: true },
  { key: "autorizador_num_doc", top: 86.5, left: 26, width: 30 },
  { key: "orgao_emissor", top: 89.5, left: 26, width: 30 },
  { key: "data_autorizacao", top: 92.0, left: 2, width: 20 },
  { key: "registro_conselho", top: 96.0, left: 2, width: 20 },
];

export const CHECKS: Check[] = [
  { key: "sexo_masculino", top: 15.2, left: 55.5 },
  { key: "sexo_feminino", top: 15.2, left: 70.5 },
  { key: "convenio_sim", top: 15.1, left: 73.0 },
  { key: "convenio_nao", top: 15.1, left: 90.5 },
  { key: "doc_cpf", top: 24.3, left: 42.5 },
  { key: "doc_rg", top: 24.3, left: 53.5 },
  { key: "doc_rcivil", top: 24.3, left: 64.5 },
  { key: "doc_pispasep", top: 24.3, left: 76.5 },
  { key: "doc_ignorado", top: 24.3, left: 91.5 },
  { key: "carater_ue", top: 59.5, left: 7.0 },
  { key: "carater_eletivo", top: 59.5, left: 13.5 },
  { key: "prof_doc_cns", top: 67.7, left: 3.5 },
  { key: "prof_doc_cpf", top: 67.7, left: 14.0 },
  { key: "ac_transito", top: 72.4, left: 1.2 },
  { key: "acid_trab_tipico", top: 73.6, left: 1.2 },
  { key: "ac_trab_trajeto", top: 74.8, left: 1.2 },
  { key: "vinc_empregado", top: 77.7, left: 19.4 },
  { key: "vinc_empregador", top: 77.7, left: 34.1 },
  { key: "vinc_autonomo", top: 77.7, left: 48.1 },
  { key: "vinc_desempregado", top: 77.7, left: 61.3 },
  { key: "vinc_aposentado", top: 77.7, left: 74.9 },
  { key: "vinc_nao_segurado", top: 77.7, left: 87.0 },
  { key: "aut_doc_cns", top: 87.0, left: 3.5 },
  { key: "aut_doc_cpf", top: 87.0, left: 11.5 },
];

export type LaudoState = Record<string, string> & { _checks?: Record<string, boolean> };
