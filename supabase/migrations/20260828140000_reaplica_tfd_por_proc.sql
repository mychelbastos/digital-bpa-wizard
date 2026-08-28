-- RE-APLICA o TFD nos relatórios por procedimento. Verificado que NÃO duplica: as fichas 0803
-- são de competências onde o TFD já foi gerado (deixa de existir na tabela `tfd`), e o TFD
-- ainda agendado vive só em tfd/tfd_linhas — os conjuntos são disjuntos. Assim a produção de
-- TFD (ex.: competência 07) passa a aparecer no "por procedimento".
create or replace function public.relacao_pacientes_producao(_cnes text[], _de text, _ate text, _tipo text default 'todos', _procs text[] default null)
returns table(nome text, documento text, nascimento text, sexo text, raca text, bairro text)
language sql stable security invoker set search_path to 'public' as $$
  with linhas as (
    select s.r ->> 'nomePac' as nome,
      coalesce(nullif(jdig(s.r->'cnsPac'),''), nullif(jdig(s.r->'cpfPac'),''), '') as documento,
      case when jdig(s.r->'dataNasc') ~ '^\d{8}$' then to_char(to_date(jdig(s.r->'dataNasc'),'DDMMYYYY'),'DD/MM/YYYY') else '' end as nascimento,
      upper(coalesce(s.r->>'sexo','')) as sexo, coalesce(s.r->>'racaCor','') as raca, coalesce(s.r->>'bairro','') as bairro,
      jdig(s.r->'cnsPac') as cns
    from public.fichas f cross join lateral jsonb_array_elements(coalesce(f.dados->'seqs','[]'::jsonb)) s(r)
    where f.tipo='BPA-I' and f.excluida_em is null and f.substituida_por is null
      and (_tipo='todos' or _tipo='BPA-I') and f.mes_producao between _de and _ate
      and (_cnes is null or array_length(_cnes,1) is null or f.cnes = any(_cnes))
      and jdig(s.r->'cnsPac') <> ''
      and (_procs is null or array_length(_procs,1) is null or jdig(s.r->'codProc') = any(_procs))
    union all
    select f.dados->>'nomePaciente',
      coalesce(nullif(regexp_replace(coalesce(f.dados->>'cnsPaciente',''),'[^0-9]','','g'),''), nullif(regexp_replace(coalesce(f.dados->>'cpfPaciente',''),'[^0-9]','','g'),''), ''),
      case when coalesce(f.dados->>'dataNascimento','') ~ '^\d{4}-\d{2}-\d{2}$' then to_char((f.dados->>'dataNascimento')::date,'DD/MM/YYYY') else '' end,
      upper(coalesce(f.dados->>'sexo','')), coalesce(f.dados->>'raca',''), coalesce(f.dados->>'bairro',''),
      regexp_replace(coalesce(f.dados->>'cnsPaciente',''),'[^0-9]','','g')
    from public.fichas f
    where f.tipo='RAAS' and f.excluida_em is null and f.substituida_por is null
      and (_tipo='todos' or _tipo='RAAS') and f.mes_producao between _de and _ate
      and (_cnes is null or array_length(_cnes,1) is null or f.cnes = any(_cnes))
      and regexp_replace(coalesce(f.dados->>'cnsPaciente',''),'[^0-9]','','g') <> ''
      and (_procs is null or array_length(_procs,1) is null or exists (
        select 1 from jsonb_array_elements(coalesce(f.dados->'acoes','[]'::jsonb)) a(r)
        where regexp_replace(coalesce(a.r->>'procedimento',''),'[^0-9]','','g') = any(_procs)))
    union all
    select p.nome,
      coalesce(nullif(regexp_replace(coalesce(p.cns,''),'[^0-9]','','g'),''), nullif(regexp_replace(coalesce(p.cpf,''),'[^0-9]','','g'),''), ''),
      case when p.nascimento is not null then to_char(p.nascimento,'DD/MM/YYYY') else '' end,
      upper(coalesce(p.sexo,'')), coalesce(p.raca_cor,''), coalesce(p.bairro,''),
      coalesce(nullif(regexp_replace(coalesce(p.cns,''),'[^0-9]','','g'),''), 'tfd:'||p.id::text)
    from public.tfd t
    join public.tfd_linhas tl on tl.tfd_id = t.id
    join public.pacientes p on p.id = t.paciente_id
    where p.excluido_em is null
      and (_tipo='todos' or _tipo='TFD') and t.competencia between _de and _ate
      and (_cnes is null or array_length(_cnes,1) is null or t.cnes = any(_cnes))
      and (_procs is null or array_length(_procs,1) is null or tl.codigo = any(_procs))
  )
  select distinct on (cns) nome, documento, nascimento, sexo, raca, bairro
  from linhas order by cns, (nascimento = '');
$$;

create or replace function public.tabulacao_producao(_cnes text[], _de text, _ate text, _tipo text default 'todos', _procs text[] default null)
returns jsonb language sql stable security invoker set search_path to 'public' as $$
  with linhas as (
    select coalesce((nullif(jdig(s.r->'qtde'),''))::int,0) as qtd,
      upper(coalesce(s.r->>'sexo','')) as sexo, coalesce(s.r->>'racaCor','') as raca,
      coalesce(nullif(upper(trim(s.r->>'bairro')),''),'(sem bairro)') as bairro,
      case when jdig(s.r->'dataNasc') ~ '^\d{8}$' then to_date(jdig(s.r->'dataNasc'),'DDMMYYYY') end as nasc
    from public.fichas f cross join lateral jsonb_array_elements(coalesce(f.dados->'seqs','[]'::jsonb)) s(r)
    where f.tipo='BPA-I' and f.excluida_em is null and f.substituida_por is null
      and (_tipo='todos' or _tipo='BPA-I') and f.mes_producao between _de and _ate
      and (_cnes is null or array_length(_cnes,1) is null or f.cnes = any(_cnes))
      and (_procs is null or array_length(_procs,1) is null or jdig(s.r->'codProc') = any(_procs))
    union all
    select coalesce((nullif(regexp_replace(coalesce(a.r->>'quantidade',''),'[^0-9]','','g'),''))::int,0),
      upper(coalesce(f.dados->>'sexo','')), coalesce(f.dados->>'raca',''),
      coalesce(nullif(upper(trim(f.dados->>'bairro')),''),'(sem bairro)'),
      case when coalesce(f.dados->>'dataNascimento','') ~ '^\d{4}-\d{2}-\d{2}$' then (f.dados->>'dataNascimento')::date end
    from public.fichas f cross join lateral jsonb_array_elements(coalesce(f.dados->'acoes','[]'::jsonb)) a(r)
    where f.tipo='RAAS' and f.excluida_em is null and f.substituida_por is null
      and (_tipo='todos' or _tipo='RAAS') and f.mes_producao between _de and _ate
      and (_cnes is null or array_length(_cnes,1) is null or f.cnes = any(_cnes))
      and (_procs is null or array_length(_procs,1) is null or regexp_replace(coalesce(a.r->>'procedimento',''),'[^0-9]','','g') = any(_procs))
    union all
    select coalesce(tl.quantidade,0),
      upper(coalesce(p.sexo,'')), coalesce(p.raca_cor,''),
      coalesce(nullif(upper(trim(p.bairro)),''),'(sem bairro)'), p.nascimento
    from public.tfd t
    join public.tfd_linhas tl on tl.tfd_id = t.id
    join public.pacientes p on p.id = t.paciente_id
    where p.excluido_em is null
      and (_tipo='todos' or _tipo='TFD') and t.competencia between _de and _ate
      and (_cnes is null or array_length(_cnes,1) is null or t.cnes = any(_cnes))
      and (_procs is null or array_length(_procs,1) is null or tl.codigo = any(_procs))
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
