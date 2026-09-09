-- Crivo de duplicidade do BPA-I ENTRE FOLHAS (mesma unidade + competência).
--
-- Dado o conjunto de chaves `documento|procedimento|data` das sequências da ficha em edição,
-- devolve em QUAL outra folha cada chave já foi digitada (a de menor número). Serve para o
-- aviso "esse paciente com esse procedimento e essa data já está na folha X" + link p/ abrir.
--
-- SECURITY INVOKER: respeita a RLS de `fichas` (o usuário só enxerga o que já pode ver — a
-- unidade, via ver_fichas_da_unidade). Assim o link "abrir" sempre aponta p/ uma ficha legível.
-- A chave espelha `pacienteChave` do front: documento = CNS (11/15 díg.) ou CPF (11 díg.).

create or replace function public.duplicatas_bpai_outras_folhas(
  _cnes text, _competencia text, _id_atual uuid, _chaves text[]
) returns table(chave text, ficha_id uuid, folha text, titulo text)
language sql stable security invoker set search_path to public as $$
  select distinct on (chave) chave, ficha_id, folha, titulo
  from (
    select
      f.id as ficha_id,
      f.titulo,
      regexp_replace(coalesce(array_to_string(array(select jsonb_array_elements_text(f.dados->'profFolha')), ''), ''), '\D', '', 'g') as folha,
      (case
         when length(regexp_replace(array_to_string(array(select jsonb_array_elements_text(seq->'cnsPac')), ''), '\D', '', 'g')) in (11, 15)
           then regexp_replace(array_to_string(array(select jsonb_array_elements_text(seq->'cnsPac')), ''), '\D', '', 'g')
         when length(regexp_replace(array_to_string(array(select jsonb_array_elements_text(seq->'cpfPac')), ''), '\D', '', 'g')) = 11
           then regexp_replace(array_to_string(array(select jsonb_array_elements_text(seq->'cpfPac')), ''), '\D', '', 'g')
         else ''
       end)
      || '|' ||
      regexp_replace(array_to_string(array(select jsonb_array_elements_text(seq->'codProc')), ''), '\D', '', 'g')
      || '|' ||
      regexp_replace(array_to_string(array(select jsonb_array_elements_text(seq->'dataAtend')), ''), '\D', '', 'g')
      as chave
    from fichas f
    cross join lateral jsonb_array_elements(f.dados->'seqs') seq
    where f.tipo = 'BPA-I' and f.excluida_em is null
      and f.cnes = _cnes and f.competencia = _competencia
      and (_id_atual is null or f.id <> _id_atual)
  ) x
  where x.chave = any(_chaves)
  order by chave, coalesce(nullif(x.folha, '')::int, 999999);
$$;
