-- TFD: um paciente pode ter um ACOMPANHANTE HABITUAL (também uma pessoa cadastrada).
-- Ao selecionar o paciente num novo TFD, o acompanhante habitual já vem preenchido (removível).
alter table public.pacientes add column if not exists acompanhante_id uuid references public.pacientes(id);
