-- Gráfico "Últimos 6 meses" (28/11/2026): meses GUARDADOS já somados, recalculados só quando
-- algo daquele mês muda. Mês fechado nunca muda → sai do guardado, sem recalcular nada.
--
-- • dashboard_serie_meses: quais meses estão guardados (e quando foram gerados).
-- • dashboard_serie_cache: soma por mês × tipo × CNES × CRIADOR da ficha × profissional ×
--   procedimento. O criador (user_id) fica guardado para aplicar a MESMA regra de visibilidade
--   da policy fichas_select (que só depende de cnes e user_id).
-- • Invalidação (tempo real): qualquer insert/update/delete em fichas descarta o(s) mês(es)
--   envolvido(s); mudança de status em producoes descarta os meses das fichas dela; mudança em
--   profissionais (nome usado como fallback) descarta tudo. O mês descartado é recalculado na
--   próxima consulta (sob lock, um de cada vez).
-- • As tabelas não têm policy: só a função (security definer) as lê/escreve.

create table if not exists public.dashboard_serie_meses (
  mes_producao text primary key,
  gerado_em timestamptz not null default now()
);
create table if not exists public.dashboard_serie_cache (
  mes_producao text not null,
  tipo text not null,
  cnes text,
  user_id uuid,
  profissional_cns text,
  profissional_nome text,
  cbo text,
  procedimento text,
  quantidade bigint not null
);
create index if not exists dashboard_serie_cache_mes_idx on public.dashboard_serie_cache (mes_producao);
alter table public.dashboard_serie_meses enable row level security;
alter table public.dashboard_serie_cache enable row level security;
revoke all on public.dashboard_serie_meses, public.dashboard_serie_cache from anon, authenticated;

-- Descarta meses do guardado.
create or replace function public.dashboard_serie_invalidar(_meses text[])
returns void language sql security definer set search_path = public as $$
  delete from public.dashboard_serie_meses where mes_producao = any(_meses);
  delete from public.dashboard_serie_cache where mes_producao = any(_meses);
$$;
revoke all on function public.dashboard_serie_invalidar(text[]) from public, anon, authenticated;

create or replace function public.dashboard_serie_trg_fichas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.dashboard_serie_invalidar(array_remove(array[
    case when TG_OP <> 'INSERT' then OLD.mes_producao end,
    case when TG_OP <> 'DELETE' then NEW.mes_producao end], null));
  return null;
end $$;
drop trigger if exists dashboard_serie_trg_fichas on public.fichas;
create trigger dashboard_serie_trg_fichas after insert or update or delete on public.fichas
  for each row execute function public.dashboard_serie_trg_fichas();

create or replace function public.dashboard_serie_trg_producoes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status is distinct from OLD.status then
    perform public.dashboard_serie_invalidar(array(
      select distinct f.mes_producao from public.fichas f where f.producao_id = NEW.id and f.mes_producao is not null));
  end if;
  return null;
end $$;
drop trigger if exists dashboard_serie_trg_producoes on public.producoes;
create trigger dashboard_serie_trg_producoes after update on public.producoes
  for each row execute function public.dashboard_serie_trg_producoes();

create or replace function public.dashboard_serie_trg_profissionais()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.dashboard_serie_meses;
  delete from public.dashboard_serie_cache;
  return null;
end $$;
drop trigger if exists dashboard_serie_trg_profissionais on public.profissionais;
create trigger dashboard_serie_trg_profissionais after insert or update or delete on public.profissionais
  for each statement execute function public.dashboard_serie_trg_profissionais();

-- A consulta do gráfico. Mesmo nome/assinatura/colunas de antes (o app não muda).
drop function if exists public.dashboard_serie_mensal(text, text);
create function public.dashboard_serie_mensal(_de text, _ate text)
returns table (mes_producao text, tipo text, cnes text, profissional_cns text, profissional_nome text,
               cbo text, procedimento text, quantidade bigint)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  m text;
  ini text := least(_de, _ate);
  fim text := greatest(_de, _ate);
begin
  if auth.uid() is null then return; end if;
  -- Gera (uma vez) os meses que ainda não estão guardados.
  for m in
    select to_char(g, 'YYYYMM')
    from generate_series(to_date(ini, 'YYYYMM'), to_date(fim, 'YYYYMM'), interval '1 month') g
  loop
    if not exists (select 1 from public.dashboard_serie_meses s where s.mes_producao = m) then
      perform pg_advisory_xact_lock(hashtext('dashboard_serie:' || m));
      if not exists (select 1 from public.dashboard_serie_meses s where s.mes_producao = m) then
        delete from public.dashboard_serie_cache c where c.mes_producao = m;
        insert into public.dashboard_serie_cache
          (mes_producao, tipo, cnes, user_id, profissional_cns, profissional_nome, cbo, procedimento, quantidade)
        select d.mes_producao, d.tipo, d.cnes, f.user_id, d.profissional_cns, d.profissional_nome, d.cbo, d.procedimento,
               sum(d.quantidade)::bigint
        from public.producao_dashboard d
        join public.fichas f on f.id = d.ficha_id
        where d.mes_producao = m
        group by 1, 2, 3, 4, 5, 6, 7, 8;
        insert into public.dashboard_serie_meses (mes_producao) values (m) on conflict do nothing;
      end if;
    end if;
  end loop;

  -- Devolve só o que o usuário pode ver (MESMA regra da policy fichas_select).
  return query
  select c.mes_producao, c.tipo, c.cnes, c.profissional_cns, c.profissional_nome, c.cbo, c.procedimento,
         sum(c.quantidade)::bigint
  from public.dashboard_serie_cache c
  where c.mes_producao between ini and fim
    and (
      (select public.is_super_admin())
      or c.cnes in (select public.rls_cnes_com_permissao('ver_fichas_da_unidade'))
      or (c.user_id = (select auth.uid()) and c.cnes in (select v.cnes from public.cnes_visiveis() v(cnes)))
      or exists (select 1 from public.estabelecimentos e
                 where e.cnes = c.cnes and public.tem_permissao_no_org(e.organizacao_id, 'ver_fichas_do_municipio'))
    )
  group by 1, 2, 3, 4, 5, 6, 7;
end $$;
revoke all on function public.dashboard_serie_mensal(text, text) from public, anon;
grant execute on function public.dashboard_serie_mensal(text, text) to authenticated;
