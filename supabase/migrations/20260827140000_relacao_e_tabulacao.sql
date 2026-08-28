-- Relatórios pedidos: (1) RELAÇÃO NOMINAL de pacientes (com nome, uso interno/conferência) e
-- (2) TABULAÇÃO por procedimento (agregada/anonimizada). Todas SECURITY INVOKER (respeitam RLS).

-- ============ 1) RELAÇÃO NOMINAL — GERAL (cadastro) ============
create or replace function public.relacao_pacientes_geral()
returns table(nome text, documento text, nascimento text, sexo text, raca text, bairro text, municipio text)
language sql stable security invoker set search_path to 'public' as $$
  select p.nome,
    coalesce(nullif(p.cns,''), nullif(p.cpf,''), '') ,
    to_char(p.nascimento, 'DD/MM/YYYY'),
    coalesce(p.sexo,''), coalesce(p.raca_cor,''), coalesce(p.bairro,''), coalesce(p.municipio_nome,'')
  from public.pacientes p
  where p.excluido_em is null
  order by p.nome;
$$;

-- ============ 1) RELAÇÃO NOMINAL — TFD (pacientes com TFD no período) ============
create or replace function public.relacao_pacientes_tfd(_de text, _ate text)
returns table(nome text, documento text, nascimento text, sexo text, raca text, bairro text, municipio text)
language sql stable security invoker set search_path to 'public' as $$
  select distinct p.nome,
    coalesce(nullif(p.cns,''), nullif(p.cpf,''), ''),
    to_char(p.nascimento, 'DD/MM/YYYY'),
    coalesce(p.sexo,''), coalesce(p.raca_cor,''), coalesce(p.bairro,''), coalesce(p.municipio_nome,'')
  from public.tfd t
  join public.pacientes p on p.id = t.paciente_id
  where p.excluido_em is null
    and (_de is null or t.competencia >= _de) and (_ate is null or t.competencia <= _ate)
  order by p.nome;
$$;

-- ============ 1) RELAÇÃO NOMINAL — PRODUÇÃO (RAAS / por procedimento), distinct por CNS ============
-- _proc: código do procedimento (10 díg) ou NULL para todos. _tipo: 'todos'|'BPA-I'|'RAAS'.
create or replace function public.relacao_pacientes_producao(_cnes text[], _de text, _ate text, _tipo text default 'todos', _proc text default null)
returns table(nome text, documento text, nascimento text, sexo text, raca text, bairro text)
language sql stable security invoker set search_path to 'public' as $$
  with linhas as (
    -- BPA-I (por seq)
    select
      s.r ->> 'nomePac' as nome,
      coalesce(nullif(jdig(s.r->'cnsPac'),''), nullif(jdig(s.r->'cpfPac'),''), '') as documento,
      case when jdig(s.r->'dataNasc') ~ '^\d{8}$' then to_char(to_date(jdig(s.r->'dataNasc'),'DDMMYYYY'),'DD/MM/YYYY') else '' end as nascimento,
      upper(coalesce(s.r->>'sexo','')) as sexo, coalesce(s.r->>'racaCor','') as raca, coalesce(s.r->>'bairro','') as bairro,
      jdig(s.r->'cnsPac') as cns
    from public.fichas f cross join lateral jsonb_array_elements(coalesce(f.dados->'seqs','[]'::jsonb)) s(r)
    where f.tipo='BPA-I' and f.excluida_em is null and f.substituida_por is null
      and (_tipo='todos' or _tipo='BPA-I') and f.mes_producao between _de and _ate
      and (_cnes is null or array_length(_cnes,1) is null or f.cnes = any(_cnes))
      and jdig(s.r->'cnsPac') <> ''
      and (_proc is null or jdig(s.r->'codProc') = _proc)
    union all
    -- RAAS (por ficha; filtro de proc olha as ações)
    select
      f.dados->>'nomePaciente',
      coalesce(nullif(regexp_replace(coalesce(f.dados->>'cnsPaciente',''),'[^0-9]','','g'),''), nullif(regexp_replace(coalesce(f.dados->>'cpfPaciente',''),'[^0-9]','','g'),''), ''),
      case when coalesce(f.dados->>'dataNascimento','') ~ '^\d{4}-\d{2}-\d{2}$' then to_char((f.dados->>'dataNascimento')::date,'DD/MM/YYYY') else '' end,
      upper(coalesce(f.dados->>'sexo','')), coalesce(f.dados->>'raca',''), coalesce(f.dados->>'bairro',''),
      regexp_replace(coalesce(f.dados->>'cnsPaciente',''),'[^0-9]','','g')
    from public.fichas f
    where f.tipo='RAAS' and f.excluida_em is null and f.substituida_por is null
      and (_tipo='todos' or _tipo='RAAS') and f.mes_producao between _de and _ate
      and (_cnes is null or array_length(_cnes,1) is null or f.cnes = any(_cnes))
      and regexp_replace(coalesce(f.dados->>'cnsPaciente',''),'[^0-9]','','g') <> ''
      and (_proc is null or exists (
        select 1 from jsonb_array_elements(coalesce(f.dados->'acoes','[]'::jsonb)) a(r)
        where regexp_replace(coalesce(a.r->>'procedimento',''),'[^0-9]','','g') = _proc))
  )
  select distinct on (cns) nome, documento, nascimento, sexo, raca, bairro
  from linhas order by cns, (nascimento = '');
$$;

-- ============ 2) TABULAÇÃO por procedimento (agregada, por ATENDIMENTO/quantidade) ============
-- Soma a quantidade por faixa etária, sexo, raça/cor e bairro. _proc filtra um procedimento
-- (NULL = todos). Faixa etária: buckets padrão.
create or replace function public.tabulacao_producao(_cnes text[], _de text, _ate text, _tipo text default 'todos', _proc text default null)
returns jsonb language sql stable security invoker set search_path to 'public' as $$
  with linhas as (
    -- BPA-I: uma linha por seq, quantidade = qtde
    select
      coalesce((nullif(jdig(s.r->'qtde'),''))::int,0) as qtd,
      upper(coalesce(s.r->>'sexo','')) as sexo, coalesce(s.r->>'racaCor','') as raca,
      coalesce(nullif(upper(trim(s.r->>'bairro')),''),'(sem bairro)') as bairro,
      case when jdig(s.r->'dataNasc') ~ '^\d{8}$' then to_date(jdig(s.r->'dataNasc'),'DDMMYYYY') end as nasc
    from public.fichas f cross join lateral jsonb_array_elements(coalesce(f.dados->'seqs','[]'::jsonb)) s(r)
    where f.tipo='BPA-I' and f.excluida_em is null and f.substituida_por is null
      and (_tipo='todos' or _tipo='BPA-I') and f.mes_producao between _de and _ate
      and (_cnes is null or array_length(_cnes,1) is null or f.cnes = any(_cnes))
      and (_proc is null or jdig(s.r->'codProc') = _proc)
    union all
    -- RAAS: uma linha por ação; demografia vem da ficha
    select
      coalesce((nullif(regexp_replace(coalesce(a.r->>'quantidade',''),'[^0-9]','','g'),''))::int,0),
      upper(coalesce(f.dados->>'sexo','')), coalesce(f.dados->>'raca',''),
      coalesce(nullif(upper(trim(f.dados->>'bairro')),''),'(sem bairro)'),
      case when coalesce(f.dados->>'dataNascimento','') ~ '^\d{4}-\d{2}-\d{2}$' then (f.dados->>'dataNascimento')::date end
    from public.fichas f cross join lateral jsonb_array_elements(coalesce(f.dados->'acoes','[]'::jsonb)) a(r)
    where f.tipo='RAAS' and f.excluida_em is null and f.substituida_por is null
      and (_tipo='todos' or _tipo='RAAS') and f.mes_producao between _de and _ate
      and (_cnes is null or array_length(_cnes,1) is null or f.cnes = any(_cnes))
      and (_proc is null or regexp_replace(coalesce(a.r->>'procedimento',''),'[^0-9]','','g') = _proc)
  ),
  b as (
    select qtd, coalesce(nullif(sexo,''),'-') as sexo, raca, bairro,
      case when nasc is null then 'Sem info' else (case
        when date_part('year',age(nasc))<5 then '0-4' when date_part('year',age(nasc))<10 then '5-9'
        when date_part('year',age(nasc))<15 then '10-14' when date_part('year',age(nasc))<20 then '15-19'
        when date_part('year',age(nasc))<30 then '20-29' when date_part('year',age(nasc))<40 then '30-39'
        when date_part('year',age(nasc))<50 then '40-49' when date_part('year',age(nasc))<60 then '50-59'
        when date_part('year',age(nasc))<70 then '60-69' else '70+' end) end as faixa
    from linhas
  )
  select jsonb_build_object(
    'total', (select coalesce(sum(qtd),0) from b),
    'faixa', (select coalesce(jsonb_agg(jsonb_build_object('k',faixa,'n',n)),'[]') from (select faixa, sum(qtd) n from b group by faixa) t),
    'sexo',  (select coalesce(jsonb_agg(jsonb_build_object('k',sexo,'n',n)),'[]')  from (select sexo, sum(qtd) n from b group by sexo) t),
    'raca',  (select coalesce(jsonb_agg(jsonb_build_object('k',coalesce(nullif(raca,''),'-'),'n',n)),'[]') from (select raca, sum(qtd) n from b group by raca) t),
    'bairro',(select coalesce(jsonb_agg(jsonb_build_object('k',bairro,'n',n)),'[]') from (select bairro, sum(qtd) n from b group by bairro) t),
    'faixa_sexo', (select coalesce(jsonb_agg(jsonb_build_object('faixa',faixa,'sexo',sexo,'n',n)),'[]') from (select faixa, sexo, sum(qtd) n from b group by faixa, sexo) t)
  );
$$;

grant execute on function public.relacao_pacientes_geral() to authenticated;
grant execute on function public.relacao_pacientes_tfd(text, text) to authenticated;
grant execute on function public.relacao_pacientes_producao(text[], text, text, text, text) to authenticated;
grant execute on function public.tabulacao_producao(text[], text, text, text, text) to authenticated;
