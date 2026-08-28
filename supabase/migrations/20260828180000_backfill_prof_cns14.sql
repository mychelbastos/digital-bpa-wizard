-- Backfill: fichas BPA-I importadas com CNS do profissional truncado em 14 díg. (perdeu o
-- último dígito na importação/digitação). Corrige apenas quando o cadastro SCNES tem EXATAMENTE
-- um profissional de 15 díg. que começa com esses 14 (match único = seguro). Preenche também o
-- nome do profissional (do SCNES) quando estiver vazio.
with alvo as (
  select f.id,
    regexp_replace((select string_agg(e,'') from jsonb_array_elements_text(f.dados->'profCns') e),'[^0-9]','','g') as cns14
  from public.fichas f
  where f.tipo='BPA-I' and f.origem='importado'
    and length(regexp_replace((select string_agg(e,'') from jsonb_array_elements_text(f.dados->'profCns') e),'[^0-9]','','g'))=14
),
mapa as (
  select a.id, a.cns14,
    (select p.cns from public.profissionais p where p.cns like a.cns14 || '_' group by p.cns limit 1) as cns15,
    (select min(p.nome) from public.profissionais p where p.cns like a.cns14 || '_') as nome
  from alvo a
  where (select count(distinct p2.cns) from public.profissionais p2 where p2.cns like a.cns14 || '_') = 1
)
update public.fichas f
set dados = f.dados
  || jsonb_build_object('profCns', to_jsonb(array(select substr(m.cns15, g, 1) from generate_series(1, 15) g)))
  || (case when coalesce(f.dados->>'profNome','') = '' then jsonb_build_object('profNome', m.nome) else '{}'::jsonb end)
from mapa m
where m.id = f.id and m.cns15 is not null;
