-- Perfil AGREGADO dos pacientes ATENDIDOS num recorte (unidade/competência/tipo), a partir
-- da produção BPA-I (uma seq por paciente) e RAAS (uma ficha por paciente). Cada paciente
-- conta UMA vez (distinct por CNS). BPA-C fica de fora (não registra paciente).
-- SECURITY INVOKER: respeita a RLS de `fichas`. Devolve só contagens (LGPD).
-- _cnes: lista de CNES a incluir (NULL/vazia = todas). _de/_ate: mês de produção (AAAAMM).
-- _tipo: 'todos' | 'BPA-I' | 'RAAS' (BPA-C não tem paciente).
create or replace function public.perfil_atendidos_agregado(_cnes text[], _de text, _ate text, _tipo text default 'todos')
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  with pac as (
    -- BPA-I: paciente por sequência. Campos do paciente são arrays de dígitos (jdig) ou strings.
    select
      jdig(s.r -> 'cnsPac') as cns,
      upper(coalesce(s.r ->> 'sexo', '')) as sexo,
      coalesce(s.r ->> 'racaCor', '') as raca,
      upper(coalesce(nullif(s.r ->> 'situacaoRua', ''), 'N')) as situacao_rua,
      case when jdig(s.r -> 'dataNasc') ~ '^\d{8}$' then to_date(jdig(s.r -> 'dataNasc'), 'DDMMYYYY') end as nasc
    from public.fichas f
      cross join lateral jsonb_array_elements(coalesce(f.dados -> 'seqs', '[]'::jsonb)) s(r)
    where f.tipo = 'BPA-I' and f.excluida_em is null and f.substituida_por is null
      and (_tipo = 'todos' or _tipo = 'BPA-I')
      and f.mes_producao between _de and _ate
      and (_cnes is null or array_length(_cnes, 1) is null or f.cnes = any(_cnes))
      and jdig(s.r -> 'cnsPac') <> ''
    union all
    -- RAAS: paciente por ficha. Campos são strings simples.
    select
      regexp_replace(coalesce(f.dados ->> 'cnsPaciente', ''), '[^0-9]', '', 'g') as cns,
      upper(coalesce(f.dados ->> 'sexo', '')) as sexo,
      coalesce(f.dados ->> 'raca', '') as raca,
      upper(coalesce(nullif(f.dados ->> 'situacaoRua', ''), 'N')) as situacao_rua,
      case when coalesce(f.dados ->> 'dataNascimento', '') ~ '^\d{4}-\d{2}-\d{2}$' then (f.dados ->> 'dataNascimento')::date end as nasc
    from public.fichas f
    where f.tipo = 'RAAS' and f.excluida_em is null and f.substituida_por is null
      and (_tipo = 'todos' or _tipo = 'RAAS')
      and f.mes_producao between _de and _ate
      and (_cnes is null or array_length(_cnes, 1) is null or f.cnes = any(_cnes))
      and regexp_replace(coalesce(f.dados ->> 'cnsPaciente', ''), '[^0-9]', '', 'g') <> ''
  ),
  dedup as (
    -- Um registro por paciente (CNS). Prefere a linha com data de nascimento preenchida.
    select distinct on (cns) cns, sexo, raca, situacao_rua, nasc
    from pac
    order by cns, (nasc is null)
  ),
  base as (
    select
      coalesce(nullif(sexo, ''), '-') as sexo,
      raca, situacao_rua,
      case when nasc is null then 'Sem info' else (
        case
          when date_part('year', age(nasc)) < 5  then '0-4'
          when date_part('year', age(nasc)) < 10 then '5-9'
          when date_part('year', age(nasc)) < 15 then '10-14'
          when date_part('year', age(nasc)) < 20 then '15-19'
          when date_part('year', age(nasc)) < 30 then '20-29'
          when date_part('year', age(nasc)) < 40 then '30-39'
          when date_part('year', age(nasc)) < 50 then '40-49'
          when date_part('year', age(nasc)) < 60 then '50-59'
          when date_part('year', age(nasc)) < 70 then '60-69'
          else '70+'
        end
      ) end as faixa
    from dedup
  )
  select jsonb_build_object(
    'total', (select count(*) from dedup),
    'faixa_sexo', (
      select coalesce(jsonb_agg(jsonb_build_object('faixa', faixa, 'sexo', sexo, 'n', n)), '[]'::jsonb)
      from (select faixa, sexo, count(*) n from base group by faixa, sexo) t
    ),
    'raca', (
      select coalesce(jsonb_agg(jsonb_build_object('raca', coalesce(nullif(raca,''),'-'), 'n', n)), '[]'::jsonb)
      from (select raca, count(*) n from base group by raca) t
    ),
    'situacao_rua', (
      select coalesce(jsonb_agg(jsonb_build_object('sit', situacao_rua, 'n', n)), '[]'::jsonb)
      from (select situacao_rua, count(*) n from base group by situacao_rua) t
    )
  );
$$;

grant execute on function public.perfil_atendidos_agregado(text[], text, text, text) to authenticated;
