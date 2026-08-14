-- Permite fichas do tipo APAC (Laudo de Solicitação/Autorização) na tabela `fichas`, para
-- salvar/editar/excluir na nuvem como os demais tipos (BPA-C, BPA-I, RAAS).
alter table public.fichas drop constraint if exists fichas_tipo_check;
alter table public.fichas
  add constraint fichas_tipo_check check (tipo = any (array['BPA-C', 'BPA-I', 'RAAS', 'APAC']));
