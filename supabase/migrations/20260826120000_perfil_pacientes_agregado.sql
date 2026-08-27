-- Relatório de PERFIL do cadastro de pacientes — AGREGADO e ANONIMIZADO (LGPD art. 12).
-- SECURITY INVOKER: roda como o usuário, então respeita a RLS de `pacientes` (só o escopo dele).
-- Devolve SÓ CONTAGENS (nunca nome/CNS/CPF/nascimento/endereço). A supressão de células
-- pequenas (< 5) é aplicada na exibição do relatório; aqui vêm as contagens brutas.
create or replace function public.perfil_pacientes_agregado()
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  with base as (
    select
      p.sexo,
      p.raca_cor,
      coalesce(nullif(upper(p.situacao_rua), ''), 'N') as situacao_rua,
      case
        when p.nascimento is null then 'Sem info'
        else (
          case
            when date_part('year', age(p.nascimento)) < 5  then '0-4'
            when date_part('year', age(p.nascimento)) < 10 then '5-9'
            when date_part('year', age(p.nascimento)) < 15 then '10-14'
            when date_part('year', age(p.nascimento)) < 20 then '15-19'
            when date_part('year', age(p.nascimento)) < 30 then '20-29'
            when date_part('year', age(p.nascimento)) < 40 then '30-39'
            when date_part('year', age(p.nascimento)) < 50 then '40-49'
            when date_part('year', age(p.nascimento)) < 60 then '50-59'
            when date_part('year', age(p.nascimento)) < 70 then '60-69'
            else '70+'
          end
        )
      end as faixa
    from public.pacientes p
    where p.excluido_em is null
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'faixa_sexo', (
      select coalesce(jsonb_agg(jsonb_build_object('faixa', faixa, 'sexo', coalesce(nullif(sexo,''),'-'), 'n', n)), '[]'::jsonb)
      from (select faixa, sexo, count(*) n from base group by faixa, sexo) t
    ),
    'raca', (
      select coalesce(jsonb_agg(jsonb_build_object('raca', coalesce(nullif(raca_cor,''),'-'), 'n', n)), '[]'::jsonb)
      from (select raca_cor, count(*) n from base group by raca_cor) t
    ),
    'situacao_rua', (
      select coalesce(jsonb_agg(jsonb_build_object('sit', situacao_rua, 'n', n)), '[]'::jsonb)
      from (select situacao_rua, count(*) n from base group by situacao_rua) t
    )
  );
$$;

grant execute on function public.perfil_pacientes_agregado() to authenticated;
