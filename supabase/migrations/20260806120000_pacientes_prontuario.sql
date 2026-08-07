-- Nº do prontuário (CAPS) por paciente.
-- Usado no RAAS Psicossocial (campo ras_prontuario, offset 78:88 do arquivo .AAS).
-- Texto livre: aceita dígitos e "/" (ex.: 0909090909/12). Preenchido no cadastro do
-- paciente e reidratado na ficha RAAS ao vincular o paciente.
alter table public.pacientes
  add column if not exists prontuario text;

comment on column public.pacientes.prontuario is
  'Nº do prontuário do paciente no CAPS (RAAS PSI). Texto livre (dígitos e "/").';
