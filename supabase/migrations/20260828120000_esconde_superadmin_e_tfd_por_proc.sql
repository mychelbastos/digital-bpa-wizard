-- 1) Super-admins (contas coringa/master) NÃO aparecem na lista de pessoas da organização —
-- eles são operadores do sistema, não membros da prefeitura.
create or replace function public.admin_listar_pessoas()
returns table(user_id uuid, email text, organizacao_id uuid, org_nome text, papeis text[], cnes text[], vinculo_ids uuid[], total_vinculos integer, perms jsonb)
language sql stable security definer set search_path to 'public'
as $function$
  with managed as (
    select v.* from public.vinculos v
    where public.tem_permissao_no_org(v.organizacao_id, 'gerenciar_vinculos')
      and not public.is_super_admin_user(v.user_id)
  ),
  ativos as (select * from managed where inicio <= current_date and (fim is null or fim >= current_date)),
  ex as (select a.user_id, a.organizacao_id, unnest(public.perms_efetivas_vinculo(a.id)) as perm from ativos a),
  agg as (
    select user_id, organizacao_id, jsonb_object_agg(perm, cnt) as perms
    from (select user_id, organizacao_id, perm, count(*) as cnt from ex group by 1, 2, 3) z group by 1, 2
  ),
  pessoas as (select distinct user_id, organizacao_id from managed)
  select p.user_id, u.email::text, p.organizacao_id, o.nome,
    coalesce(array_agg(distinct a.papel) filter (where a.id is not null), '{}'),
    coalesce(array_agg(distinct a.cnes order by a.cnes) filter (where a.id is not null), '{}'),
    coalesce(array_agg(a.id) filter (where a.id is not null), '{}'),
    count(a.id)::int,
    coalesce((select ag.perms from agg ag where ag.user_id = p.user_id and ag.organizacao_id = p.organizacao_id), '{}'::jsonb)
  from pessoas p
  join auth.users u on u.id = p.user_id
  join public.organizacoes o on o.id = p.organizacao_id
  left join ativos a on a.user_id = p.user_id and a.organizacao_id = p.organizacao_id
  group by p.user_id, u.email, p.organizacao_id, o.nome;
$function$;

-- 2) RELAÇÃO por procedimento agora inclui TFD (procedimentos 0803...): pacientes com linha de
-- TFD no procedimento/período/unidade. TFD vive em tfd/tfd_linhas (não em fichas). _tipo 'todos'
-- inclui TFD; 'TFD' isola só TFD.
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
    -- TFD (tfd_linhas → tfd → pacientes)
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

-- 3) TABULAÇÃO por procedimento inclui TFD (soma quantidade das linhas de TFD; demografia do
-- cadastro do paciente).
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
