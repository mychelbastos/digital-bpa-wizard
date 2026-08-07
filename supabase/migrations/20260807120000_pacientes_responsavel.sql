-- Responsável do paciente no cadastro compartilhado.
-- nome_responsavel: nome de quem responde pelo paciente (usado no RAAS, ras_nomresp).
-- responsavel_tipo: como o nome é preenchido — 'paciente' (o próprio), 'mae' (nome da mãe)
--   ou 'outro' (digitado à mão). Guardar o tipo permite reidratar o nome automaticamente.
alter table public.pacientes
  add column if not exists nome_responsavel text;
alter table public.pacientes
  add column if not exists responsavel_tipo text; -- 'paciente' | 'mae' | 'outro'

comment on column public.pacientes.nome_responsavel is 'Nome do responsável pelo paciente (RAAS ras_nomresp).';
comment on column public.pacientes.responsavel_tipo is 'Origem do nome do responsável: paciente | mae | outro.';
