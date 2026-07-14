-- FASE 2b — Produção como ENTIDADE, POR MUNICÍPIO (organização).
-- Confirmado contra PA292720.MAR: um arquivo por MUNICÍPIO, contendo vários CNES
-- (4 no arquivo real), header sem CNES, competência do header = apresentação.
-- Logo: producao = (organizacao, mes_producao). Um .txt por município/mês.

create table if not exists public.producoes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id),
  mes_producao text not null check (mes_producao ~ '^[0-9]{6}$'),
  status text not null default 'aberta' check (status in ('aberta','exportada','transmitida')),
  gerado_em timestamptz,
  gerado_por uuid references auth.users(id),
  arquivo_nome text,
  criado_em timestamptz not null default now(),
  unique (organizacao_id, mes_producao)
);

-- Vínculo ficha -> produção (a ficha entra na produção do seu mês, da sua organização).
-- O wiring das transições de status (em_producao/exportada/freeze) fica para o próximo
-- passo, junto com o ciclo de vida da ficha (a ser confirmado).
alter table public.fichas
  add column if not exists producao_id uuid references public.producoes(id);

-- Permissão de gerar produção AO NÍVEL DA ORGANIZAÇÃO: tem gerar_producao em ao menos
-- um CNES da org. (O arquivo é municipal; quem fecha precisa poder fechar a produção do
-- município — normalmente o operador de remessa, com vínculo nos CNES.)
create or replace function public.pode_gerar_no_org(_org uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vinculos v
    where v.user_id = (select auth.uid())
      and v.organizacao_id = _org
      and (v.fim is null or v.fim >= current_date)
      and public.tem_permissao(v.cnes, 'gerar_producao')
  )
$$;

alter table public.producoes enable row level security;
-- Ver: quem tem vínculo ativo na organização.
create policy producoes_select on public.producoes for select using (
  exists (select 1 from public.vinculos v where v.user_id = (select auth.uid())
          and v.organizacao_id = producoes.organizacao_id
          and (v.fim is null or v.fim >= current_date))
);
-- Criar/alterar produção: só quem pode gerar_producao na organização.
create policy producoes_insert on public.producoes for insert with check (public.pode_gerar_no_org(organizacao_id));
create policy producoes_update on public.producoes for update using (public.pode_gerar_no_org(organizacao_id)) with check (public.pode_gerar_no_org(organizacao_id));
