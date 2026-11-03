-- Produções RAAS (.AAS) — histórico das gerações do arquivo .AAS por mês, SEPARADO do BPA.
-- O .AAS vai para outro programa (RAAS-PAD/SIA) e, por decisão de produto, é "só registro":
-- NÃO congela fichas (o fechamento do BPA já congela as fichas do mês, inclusive as RAAS).
-- Uma linha por (organização, mês); "Baixar" na tela regenera os .AAS a partir das fichas.
-- Espelha a tabela public.producoes (Fase 2b) no que diz respeito a RLS e derivação de org.

create table if not exists public.producoes_raas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id),
  mes_producao text not null check (mes_producao ~ '^[0-9]{6}$'),
  gerado_em timestamptz not null default now(),
  gerado_por uuid references auth.users(id),
  qtd_unidades int not null default 0,
  qtd_fichas int not null default 0,
  qtd_acoes int not null default 0,
  criado_em timestamptz not null default now(),
  unique (organizacao_id, mes_producao)
);

alter table public.producoes_raas enable row level security;

-- Ver: quem tem vínculo ativo na organização (mesma regra de public.producoes).
create policy producoes_raas_select on public.producoes_raas for select using (
  exists (select 1 from public.vinculos v where v.user_id = (select auth.uid())
          and v.organizacao_id = producoes_raas.organizacao_id
          and (v.fim is null or v.fim >= current_date))
);
-- Criar/alterar: só quem pode gerar_producao na organização (reusa pode_gerar_no_org).
create policy producoes_raas_insert on public.producoes_raas for insert with check (public.pode_gerar_no_org(organizacao_id));
create policy producoes_raas_update on public.producoes_raas for update using (public.pode_gerar_no_org(organizacao_id)) with check (public.pode_gerar_no_org(organizacao_id));

-- RPC de registro: deriva a organização do vínculo do usuário (produção é por município,
-- igual ao exportar_producao), faz upsert do registro do mês. NÃO toca em fichas.
create or replace function public.registrar_producao_raas(_mes text, _unidades int, _fichas int, _acoes int)
  returns uuid language plpgsql security definer set search_path = public as $$
declare _org uuid; _orgs uuid[]; _pid uuid;
begin
  if _mes !~ '^[0-9]{6}$' then raise exception 'Mês de produção inválido (AAAAMM)'; end if;
  select array_agg(distinct v.organizacao_id) into _orgs
    from public.vinculos v
    where v.user_id = (select auth.uid())
      and (v.fim is null or v.fim >= current_date)
      and public.tem_permissao(v.cnes, 'gerar_producao');
  if _orgs is null or array_length(_orgs, 1) is null then
    raise exception 'Sem permissão para registrar produção RAAS' using errcode = 'insufficient_privilege';
  end if;
  if array_length(_orgs, 1) > 1 then
    raise exception 'Você gera produção em mais de uma organização; especifique qual';
  end if;
  _org := _orgs[1];

  insert into public.producoes_raas(organizacao_id, mes_producao, gerado_por, qtd_unidades, qtd_fichas, qtd_acoes)
    values (_org, _mes, (select auth.uid()), coalesce(_unidades, 0), coalesce(_fichas, 0), coalesce(_acoes, 0))
    on conflict (organizacao_id, mes_producao) do update
      set gerado_em = now(),
          gerado_por = (select auth.uid()),
          qtd_unidades = excluded.qtd_unidades,
          qtd_fichas = excluded.qtd_fichas,
          qtd_acoes = excluded.qtd_acoes
    returning id into _pid;

  return _pid;
end $$;
grant execute on function public.registrar_producao_raas(text, int, int, int) to authenticated;
