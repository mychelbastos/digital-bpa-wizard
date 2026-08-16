-- Permite fichas do tipo AIH (Laudo de Solicitação de Internação Hospitalar) na tabela
-- `fichas`, para salvar/editar/excluir na nuvem como os demais tipos.
alter table public.fichas drop constraint if exists fichas_tipo_check;
alter table public.fichas
  add constraint fichas_tipo_check check (tipo = any (array['BPA-C', 'BPA-I', 'RAAS', 'APAC', 'AIH']));
