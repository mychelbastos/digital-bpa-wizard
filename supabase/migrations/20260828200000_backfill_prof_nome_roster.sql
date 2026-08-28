-- Backfill: fichas BPA-I com CNS do profissional válido (15 díg.) mas NOME vazio — o arquivo
-- importado não trouxe o nome. Preenche o nome pelo cadastro SCNES (tabela profissionais),
-- que resolve o CNS -> nome (mesmo que a ficha aberta mostra ao vivo). Só quando o CNS bate
-- num profissional do cadastro (nome consistente por CNS).
update public.fichas f
set dados = jsonb_set(f.dados, '{profNome}', to_jsonb(m.nome))
from (select cns, min(nome) nome from public.profissionais where nome is not null and nome<>'' group by cns) m
where f.tipo='BPA-I'
  and coalesce(f.dados->>'profNome','') = ''
  and regexp_replace((select string_agg(e,'') from jsonb_array_elements_text(case when jsonb_typeof(f.dados->'profCns')='array' then f.dados->'profCns' else '[]'::jsonb end) e),'[^0-9]','','g') = m.cns;
