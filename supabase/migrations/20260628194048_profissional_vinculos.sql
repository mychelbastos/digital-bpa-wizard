-- CBO por VÍNCULO (CNS + CNES) — vem do VinculacaoProfissionalService (pareia CBO ao estabelecimento).
-- Um profissional pode ter CBOs diferentes por estabelecimento, e mais de um no mesmo.
create table if not exists public.profissional_vinculos (
  cns text not null,
  cnes text not null,
  cbo_codigo text not null,          -- '__NONE__' = consultado e sem vínculo (sentinela p/ cache)
  cbo_descricao text,
  atualizado_em timestamptz not null default now(),
  primary key (cns, cnes, cbo_codigo)
);
create index if not exists idx_vinc_cns_cnes on public.profissional_vinculos (cns, cnes);
alter table public.profissional_vinculos enable row level security;
drop policy if exists vinc_select on public.profissional_vinculos;
create policy vinc_select on public.profissional_vinculos for select to anon, authenticated using (true);

-- O CBO por CNS isolado estava errado (ignora o estabelecimento) — remove.
alter table public.profissionais drop column if exists cbo_codigo;
alter table public.profissionais drop column if exists cbo_descricao;
