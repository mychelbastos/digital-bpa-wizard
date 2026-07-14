-- Dois níveis de administração:
--  (1) SUPER-ADMIN global (operador do sistema): gerencia TODAS as prefeituras e cria org nova.
--  (2) admin por prefeitura: quem tem 'gerenciar_vinculos' na org (já existia).
-- O super-admin ganha o gate de ADMINISTRAÇÃO em qualquer org (tem_permissao_no_org), mas NÃO
-- os poderes OPERACIONAIS (tem_permissao por CNES depende de vínculo) — separação preservada.

create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id)
);
alter table public.super_admins enable row level security;
do $$ begin
  create policy super_admins_leitura on public.super_admins for select
    using (exists (select 1 from public.super_admins s where s.user_id = (select auth.uid())));
exception when duplicate_object then null; end $$;

create or replace function public.is_super_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins s where s.user_id = (select auth.uid()));
$$;

-- Gate de ADMINISTRAÇÃO por org: super-admin passa em qualquer org.
create or replace function public.tem_permissao_no_org(_org uuid, _perm text)
  returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.vinculos v
    where v.user_id = (select auth.uid())
      and v.organizacao_id = _org
      and (v.fim is null or v.fim >= current_date)
      and public.tem_permissao(v.cnes, _perm)
  )
$$;

-- Vê a página de administração? (super-admin OU tem gerenciar_vinculos em alguma unidade)
create or replace function public.sou_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.vinculos v
    where v.user_id = (select auth.uid()) and (v.fim is null or v.fim >= current_date)
      and public.tem_permissao(v.cnes, 'gerenciar_vinculos')
  );
$$;

-- Cria uma prefeitura (organização) nova — só super-admin (onboarding de município é do operador).
create or replace function public.admin_criar_organizacao(_nome text, _ibge text, _uf text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Apenas o super-admin do sistema pode criar prefeituras' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(_nome), '') = '' then raise exception 'Nome da prefeitura é obrigatório'; end if;
  insert into public.organizacoes (nome, municipio_ibge, uf)
    values (btrim(_nome), nullif(btrim(_ibge), ''), nullif(btrim(_uf), ''))
    returning id into _id;
  return _id;
end $$;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.sou_admin() to authenticated;
grant execute on function public.admin_criar_organizacao(text, text, text) to authenticated;

-- Seed inicial: a conta admin atual vira super-admin (troque depois pela conta definitiva).
insert into public.super_admins (user_id)
  select id from auth.users where email = 'teste@bpa.com.br'
  on conflict (user_id) do nothing;
