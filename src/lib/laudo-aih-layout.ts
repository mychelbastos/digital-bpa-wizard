// Laudo AIH (Laudo para Solicitação de Autorização de Internação Hospitalar) — SESAB/SUS
// Portaria 1.734/2006. Coordenadas em % da imagem de fundo (1544×2204).
//
// Os TOPOS vêm das linhas horizontais reais detectadas na imagem (precisas); os LEFTS/larguras
// são um 1º passe estimado a partir do layout visual — calibrar por screenshot (como nos
// demais formulários). Campos "area" são textarea (blocos grandes da Justificativa).

export interface Campo {
  key: string;
  top: number;
  left: number;
  width: number;
  height?: number; // % — default 1.7 (linha única)
  area?: boolean;  // textarea (multi-linha)
  upper?: boolean; // exibe em MAIÚSCULAS
}

export interface Check {
  key: string;
  top: number;
  left: number;
}

// Todos os campos de texto/numéricos, por seção (topo → base).
export const CAMPOS: Campo[] = [
  // Emissão
  { key: "data_emissao", top: 4.5, left: 20.5, width: 13 },
  { key: "hora_emissao", top: 4.5, left: 83.5, width: 8 },

  // Identificação do estabelecimento
  { key: "estab_solicitante_nome", top: 8.7, left: 1, width: 62, height: 2, upper: true },
  { key: "estab_solicitante_cnes", top: 8.7, left: 65.5, width: 33 },
  { key: "estab_executante_nome", top: 11.6, left: 1, width: 62, height: 2, upper: true },
  { key: "estab_executante_cnes", top: 11.6, left: 65.5, width: 33 },

  // Identificação do paciente
  { key: "pac_nome", top: 14.6, left: 1, width: 52, height: 1.8, upper: true },
  { key: "pac_apelido", top: 14.6, left: 54, width: 22, upper: true },
  { key: "pac_prontuario", top: 14.6, left: 78, width: 21 },
  { key: "pac_cns", top: 17.1, left: 1, width: 34 },
  { key: "pac_nascimento", top: 17.1, left: 36, width: 19 },
  { key: "pac_mae", top: 19.5, left: 1, width: 64, height: 1.8, upper: true },
  { key: "pac_ddd", top: 19.5, left: 66, width: 8 },
  { key: "pac_telefone", top: 19.5, left: 74, width: 25 },
  { key: "mun_nascimento", top: 22.0, left: 1, width: 16, upper: true },
  { key: "uf_nascimento", top: 22.0, left: 18, width: 8, upper: true },
  { key: "nacionalidade", top: 22.0, left: 28, width: 18, upper: true },
  { key: "endereco", top: 22.0, left: 47, width: 52, height: 1.8, upper: true },
  { key: "numero", top: 24.5, left: 1, width: 8 },
  { key: "bairro", top: 24.5, left: 10, width: 25, upper: true },
  { key: "mun_residencia", top: 24.5, left: 36, width: 26, upper: true },
  { key: "ibge", top: 24.5, left: 63, width: 14 },
  { key: "uf_residencia", top: 24.5, left: 77, width: 6, upper: true },
  { key: "cep", top: 24.5, left: 84, width: 15 },
  { key: "ponto_referencia", top: 26.7, left: 1, width: 33, upper: true },
  { key: "documento_numero", top: 27.4, left: 40, width: 20 },

  // Diretor clínico
  { key: "diretor_nome", top: 31.0, left: 1, width: 26, height: 1.8, upper: true },
  { key: "diretor_conselho", top: 31.0, left: 27, width: 15 },
  { key: "diretor_cpf", top: 31.0, left: 42, width: 30 },

  // Justificativa da internação (blocos grandes)
  { key: "sinais_sintomas", top: 33.0, left: 1, width: 98, height: 4.7, area: true },
  { key: "resultados_provas", top: 40.0, left: 1, width: 98, height: 5.3, area: true },
  { key: "condicoes", top: 47.5, left: 1, width: 98, height: 4.9, area: true },
  { key: "diagnostico_inicial", top: 53.4, left: 1, width: 28, height: 1.8, upper: true },
  { key: "cid_principal", top: 53.4, left: 29.7, width: 9 },
  { key: "cid_secundario", top: 53.4, left: 39.5, width: 21 },
  { key: "cid_causas", top: 53.4, left: 61.2, width: 16 },
  { key: "notif_compulsoria", top: 53.4, left: 77.5, width: 21 },

  // Procedimento solicitado
  { key: "proc_descricao", top: 56.4, left: 1, width: 66, height: 1.8, upper: true },
  { key: "proc_codigo", top: 56.4, left: 68, width: 31 },
  { key: "clinica", top: 58.8, left: 17, width: 50, upper: true },
  { key: "leito_complementar", top: 58.8, left: 68, width: 31, upper: true },
  { key: "equipamentos", top: 61.0, left: 1, width: 98, height: 2, upper: true },

  // Profissional solicitante
  { key: "prof_nome", top: 64.5, left: 1, width: 98, height: 1.8, upper: true },
  { key: "prof_num_documento", top: 67.0, left: 24, width: 44 },
  { key: "prof_conselho", top: 67.0, left: 78, width: 21 },
  { key: "data_solicitacao", top: 69.3, left: 1, width: 16 },
  { key: "data_desejada", top: 69.3, left: 78, width: 21 },

  // Causas externas
  { key: "cnpj_seguradora", top: 74.0, left: 20, width: 44, upper: true },
  { key: "numero_bilhete", top: 74.0, left: 64, width: 20 },
  { key: "serie", top: 74.0, left: 84, width: 15 },
  { key: "cnpj_empresa", top: 76.2, left: 20, width: 27 },
  { key: "cnae_empresa", top: 76.2, left: 47, width: 26 },
  { key: "cbor", top: 76.2, left: 84, width: 15 },

  // Autorização
  { key: "autorizador_nome", top: 80.5, left: 1, width: 38, height: 1.8, upper: true },
  { key: "autorizador_num_doc", top: 86.0, left: 13, width: 26 },
  { key: "data_autorizacao", top: 91.0, left: 1, width: 15 },
  { key: "orgao_emissor", top: 91.0, left: 16, width: 23 },
  { key: "registro_conselho", top: 95.5, left: 1, width: 15 },
];

// Checkboxes (quadradinhos) — marca "X". Estimados; calibrar.
export const CHECKS: Check[] = [
  { key: "sexo_masculino", top: 17.6, left: 55.0 },
  { key: "sexo_feminino", top: 17.6, left: 70.5 },
  { key: "convenio_sim", top: 17.2, left: 78.5 },
  { key: "convenio_nao", top: 17.2, left: 90.5 },
  { key: "doc_cpf", top: 26.7, left: 42.0 },
  { key: "doc_rg", top: 26.7, left: 53.5 },
  { key: "doc_rcivil", top: 26.7, left: 64.5 },
  { key: "doc_pispasep", top: 26.7, left: 76.0 },
  { key: "doc_ignorado", top: 26.7, left: 90.5 },
  { key: "carater_ue", top: 59.2, left: 6.5 },
  { key: "carater_eletivo", top: 59.2, left: 13.0 },
  { key: "prof_doc_cns", top: 67.6, left: 3.0 },
  { key: "prof_doc_cpf", top: 67.6, left: 13.5 },
  { key: "ac_transito", top: 71.8, left: 1.2 },
  { key: "acid_trab_tipico", top: 73.0, left: 1.2 },
  { key: "ac_trab_trajeto", top: 74.2, left: 1.2 },
  { key: "vinc_empregado", top: 77.6, left: 24.5 },
  { key: "vinc_empregador", top: 77.6, left: 40.5 },
  { key: "vinc_autonomo", top: 77.6, left: 55.5 },
  { key: "vinc_desempregado", top: 77.6, left: 68.5 },
  { key: "vinc_aposentado", top: 77.6, left: 82.5 },
  { key: "vinc_nao_segurado", top: 77.6, left: 95.5 },
  { key: "aut_doc_cns", top: 87.0, left: 3.0 },
  { key: "aut_doc_cpf", top: 87.0, left: 9.5 },
];

export type LaudoState = Record<string, string> & { _checks?: Record<string, boolean> };
