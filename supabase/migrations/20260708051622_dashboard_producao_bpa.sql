-- Fundação da Dashboard de produção BPA.
--
-- Importante: PDF/TXT continuam sendo arquivos baixados no computador do usuário.
-- A nuvem guarda somente dados estruturados da ficha e linhas resumidas de produção.

alter table public.fichas
  add column if not exists tipo text not null default 'BPA-I' check (tipo in ('BPA-C', 'BPA-I')),
  add column if not exists cnes text,
  add column if not exists profissional_cns text,
  add column if not exists profissional_nome text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists fichas_tipo_competencia_idx on public.fichas (tipo, competencia);
create index if not exists fichas_cnes_idx on public.fichas (cnes);

create table if not exists public.dashboard_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'profissional' check (role in ('profissional', 'supervisor')),
  cnes text,
  municipio_ibge text,
  nome text,
  updated_at timestamptz not null default now()
);

alter table public.dashboard_user_profiles enable row level security;

drop policy if exists dashboard_profiles_own_select on public.dashboard_user_profiles;
create policy dashboard_profiles_own_select on public.dashboard_user_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Ajuda as policies sem depender de user_metadata, que é editável pelo próprio usuário.
-- A função só retorna dados do usuário autenticado atual.
create or replace function public.dashboard_profile()
returns public.dashboard_user_profiles
language sql
stable
security definer
set search_path = public
as $$
  select p
  from public.dashboard_user_profiles p
  where p.user_id = (select auth.uid())
  limit 1
$$;

revoke all on function public.dashboard_profile() from public;
grant execute on function public.dashboard_profile() to authenticated;

create table if not exists public.producao_bpa (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  ficha_id uuid references public.fichas(id) on delete set null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('BPA-C', 'BPA-I')),
  competencia text not null check (competencia ~ '^[0-9]{6}$'),
  data_atendimento date,
  cnes text,
  estabelecimento_nome text,
  municipio_ibge text,
  profissional_cns text,
  profissional_nome text,
  cbo text,
  procedimento text not null,
  quantidade integer not null default 1 check (quantidade > 0),
  servico text,
  classificacao text,
  cid text,
  carater text,
  idade integer,
  ultimo_formato text not null check (ultimo_formato in ('pdf', 'txt')),
  gerado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.producao_bpa enable row level security;

drop policy if exists producao_insert_own on public.producao_bpa;
create policy producao_insert_own on public.producao_bpa
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists producao_update_own on public.producao_bpa;
create policy producao_update_own on public.producao_bpa
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists producao_select_dashboard on public.producao_bpa;
create policy producao_select_dashboard on public.producao_bpa
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or cnes = ((public.dashboard_profile()).cnes)
    or (
      ((public.dashboard_profile()).role = 'supervisor')
      and (
        ((public.dashboard_profile()).municipio_ibge is null)
        or municipio_ibge = ((public.dashboard_profile()).municipio_ibge)
      )
    )
  );

create index if not exists producao_competencia_idx on public.producao_bpa (competencia);
create index if not exists producao_cnes_competencia_idx on public.producao_bpa (cnes, competencia);
create index if not exists producao_profissional_idx on public.producao_bpa (profissional_cns, competencia);
create index if not exists producao_procedimento_idx on public.producao_bpa (procedimento, competencia);
create index if not exists producao_user_competencia_idx on public.producao_bpa (user_id, competencia);
