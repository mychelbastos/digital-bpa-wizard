-- Dashboard (28/11/2026): os DADOS DETALHADOS de um mês (números do topo, cards, detalhe do
-- profissional) também ficam GUARDADOS e só são recalculados quando algo daquele mês muda —
-- mesma ideia do gráfico (20261128010000). Usado pelo app só para meses ANTERIORES ao mês de
-- faturamento atual (o mês corrente muda o tempo todo e segue ao vivo pela view).
--
-- • dashboard_mes_meses: quais meses estão guardados. • dashboard_mes_rows: as linhas da view
--   producao_dashboard + o CRIADOR da ficha (user_id), p/ aplicar a MESMA regra da policy
--   fichas_select. Sem policy: só as funções (security definer) acessam.
-- • Invalidação: a mesma função dashboard_serie_invalidar (triggers de fichas/producoes/
--   profissionais) agora só APAGA O MARCADOR dos meses (barato no salvar da ficha); as linhas
--   antigas são trocadas quando o mês é recalculado, na próxima consulta.

create table if not exists public.dashboard_mes_meses (
  mes_producao text primary key,
  gerado_em timestamptz not null default now()
);
create table if not exists public.dashboard_mes_rows (
  id text not null,
  ficha_id uuid,
  user_id uuid,
  tipo text, cnes text, mes_producao text not null, competencia text, estabelecimento_nome text,
  profissional_cns text, profissional_nome text, cbo text, procedimento text, quantidade integer,
  servico text, classificacao text, cid text, carater text, idade integer
);
create index if not exists dashboard_mes_rows_mes_idx on public.dashboard_mes_rows (mes_producao, id);
alter table public.dashboard_mes_meses enable row level security;
alter table public.dashboard_mes_rows enable row level security;
revoke all on public.dashboard_mes_meses, public.dashboard_mes_rows from anon, authenticated;

-- Invalidação barata (só marcadores) — vale para o gráfico e para os dados do mês.
create or replace function public.dashboard_serie_invalidar(_meses text[])
returns void language sql security definer set search_path = public as $$
  delete from public.dashboard_serie_meses where mes_producao = any(_meses);
  delete from public.dashboard_mes_meses where mes_producao = any(_meses);
$$;
revoke all on function public.dashboard_serie_invalidar(text[]) from public, anon, authenticated;

create or replace function public.dashboard_serie_trg_profissionais()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.dashboard_serie_meses;
  delete from public.dashboard_mes_meses;
  return null;
end $$;

-- Linhas de UM mês, já no escopo do usuário (mesma regra da policy fichas_select).
create or replace function public.dashboard_producao_mes(_mes text)
returns table (id text, ficha_id uuid, tipo text, competencia text, mes_producao text, cnes text,
               estabelecimento_nome text, profissional_cns text, profissional_nome text, cbo text,
               procedimento text, quantidade integer, servico text, classificacao text, cid text,
               carater text, idade integer)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null or _mes !~ '^\d{6}$' then return; end if;
  if not exists (select 1 from public.dashboard_mes_meses s where s.mes_producao = _mes) then
    perform pg_advisory_xact_lock(hashtext('dashboard_mes:' || _mes));
    if not exists (select 1 from public.dashboard_mes_meses s where s.mes_producao = _mes) then
      delete from public.dashboard_mes_rows r where r.mes_producao = _mes;
      insert into public.dashboard_mes_rows
        (id, ficha_id, user_id, tipo, cnes, mes_producao, competencia, estabelecimento_nome, profissional_cns,
         profissional_nome, cbo, procedimento, quantidade, servico, classificacao, cid, carater, idade)
      select d.id, d.ficha_id, f.user_id, d.tipo, d.cnes, d.mes_producao, d.competencia, d.estabelecimento_nome,
             d.profissional_cns, d.profissional_nome, d.cbo, d.procedimento, d.quantidade, d.servico,
             d.classificacao, d.cid, d.carater, d.idade
      from public.producao_dashboard d
      join public.fichas f on f.id = d.ficha_id
      where d.mes_producao = _mes;
      insert into public.dashboard_mes_meses (mes_producao) values (_mes) on conflict do nothing;
    end if;
  end if;

  return query
  select r.id, r.ficha_id, r.tipo, r.competencia, r.mes_producao, r.cnes, r.estabelecimento_nome,
         r.profissional_cns, r.profissional_nome, r.cbo, r.procedimento, r.quantidade, r.servico,
         r.classificacao, r.cid, r.carater, r.idade
  from public.dashboard_mes_rows r
  where r.mes_producao = _mes
    and (
      (select public.is_super_admin())
      or r.cnes in (select public.rls_cnes_com_permissao('ver_fichas_da_unidade'))
      or (r.user_id = (select auth.uid()) and r.cnes in (select v.cnes from public.cnes_visiveis() v(cnes)))
      or exists (select 1 from public.estabelecimentos e
                 where e.cnes = r.cnes and public.tem_permissao_no_org(e.organizacao_id, 'ver_fichas_do_municipio'))
    )
  order by r.id;
end $$;
revoke all on function public.dashboard_producao_mes(text) from public, anon;
grant execute on function public.dashboard_producao_mes(text) to authenticated;
