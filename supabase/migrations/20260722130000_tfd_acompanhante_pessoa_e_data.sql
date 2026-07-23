-- TFD: o ACOMPANHANTE passa a ser uma PESSOA CADASTRADA (mesmos campos do paciente/BPA-I),
-- referenciada por FK, porque as sequências BPA-I dele precisam de dados completos e coerentes
-- (senão o BPA Magnético rejeita na importação). Também guardamos a DATA DE ATENDIMENTO de
-- referência, que vira o campo "data de atendimento" das sequências geradas.
-- As colunas antigas de acompanhante (texto solto) saem — a tabela ainda não tem registros.
-- Idempotente.

alter table public.tfd add column if not exists acompanhante_id uuid references public.pacientes(id);
alter table public.tfd add column if not exists data_atendimento date;
alter table public.tfd drop column if exists acompanhante_nome;
alter table public.tfd drop column if exists acompanhante_cns;
