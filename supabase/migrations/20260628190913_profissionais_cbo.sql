-- CBO do profissional (vem da operação singular consultarProfissionalSaude, buscada sob demanda).
alter table public.profissionais add column if not exists cbo_codigo text;
alter table public.profissionais add column if not exists cbo_descricao text;
