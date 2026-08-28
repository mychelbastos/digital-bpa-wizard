-- Backfill: fichas BPA-I importadas gravaram o Cód. IBGE do município com 6 dígitos (sem o
-- dígito verificador), o que gera o erro "Cód. IBGE incompleto (7 dígitos)". Acrescenta o DV
-- calculado (algoritmo oficial do IBGE) a cada seq com IBGE de 6 dígitos, preservando a ordem.
create or replace function public.ibge_dv(seis text) returns text language plpgsql immutable as $f$
declare pesos int[] := array[1,2,1,2,1,2]; s int := 0; p int; i int;
begin
  if seis !~ '^[0-9]{6}$' then return null; end if;
  for i in 1..6 loop
    p := (substr(seis,i,1))::int * pesos[i];
    if p > 9 then p := p - 9; end if;
    s := s + p;
  end loop;
  return ((10 - (s % 10)) % 10)::text;
end $f$;

update public.fichas f
set dados = jsonb_set(f.dados, '{seqs}', (
  select jsonb_agg(
    case
      when jsonb_typeof(x.r->'ibge')='array' and jsonb_array_length(x.r->'ibge')=6
        and public.ibge_dv((select string_agg(e, '') from jsonb_array_elements_text(x.r->'ibge') e)) is not null
      then jsonb_set(x.r, '{ibge}', (x.r->'ibge') || to_jsonb(public.ibge_dv((select string_agg(e, '') from jsonb_array_elements_text(x.r->'ibge') e))))
      else x.r
    end
    order by x.ord)
  from jsonb_array_elements(f.dados->'seqs') with ordinality x(r, ord)
))
where f.tipo='BPA-I'
  and exists (select 1 from jsonb_array_elements(coalesce(f.dados->'seqs','[]'::jsonb)) x(r)
              where jsonb_typeof(x.r->'ibge')='array' and jsonb_array_length(x.r->'ibge')=6);

-- Passe residual: casos com array de 7 posições mas um dígito vazio (concatenam 6 dígitos).
-- Reconstrói o IBGE apenas com os dígitos + DV.
update public.fichas f
set dados = jsonb_set(f.dados,'{seqs}',(
  select jsonb_agg(
    case when length(regexp_replace(coalesce((select string_agg(e,'') from jsonb_array_elements_text(x.r->'ibge') e),''),'[^0-9]','','g'))=6
      and public.ibge_dv(regexp_replace((select string_agg(e,'') from jsonb_array_elements_text(x.r->'ibge') e),'[^0-9]','','g')) is not null
    then jsonb_set(x.r,'{ibge}', to_jsonb(regexp_split_to_array(
           regexp_replace((select string_agg(e,'') from jsonb_array_elements_text(x.r->'ibge') e),'[^0-9]','','g')
           || public.ibge_dv(regexp_replace((select string_agg(e,'') from jsonb_array_elements_text(x.r->'ibge') e),'[^0-9]','','g')), '')))
    else x.r end order by x.ord)
  from jsonb_array_elements(f.dados->'seqs') with ordinality x(r,ord)
))
where f.tipo='BPA-I' and exists(select 1 from jsonb_array_elements(coalesce(f.dados->'seqs','[]'::jsonb)) x(r)
  where length(regexp_replace(coalesce((select string_agg(e,'') from jsonb_array_elements_text(x.r->'ibge') e),''),'[^0-9]','','g'))=6);
