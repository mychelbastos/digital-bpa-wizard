-- RAAS (Registro das Ações Ambulatoriais de Saúde — Atenção Psicossocial / CAPS)
-- Passo 1 da adoção: permitir gravar fichas do tipo 'RAAS'.
-- O layout DATASUS do RAAS (registros 01/15/16) é distinto do BPA (01/02/03); nesta fase
-- o RAAS só é digitado e salvo (aparece em Minhas Fichas). O arquivo magnético e a
-- entrada na view producao_dashboard ficam para uma fase posterior.
alter table public.fichas
  drop constraint if exists fichas_tipo_check,
  add constraint fichas_tipo_check check (tipo in ('BPA-C', 'BPA-I', 'RAAS'));
