-- Redesign da Administração (27/11/2026): a lista de pessoas passa a trazer também o NOME,
-- o CNS e a unidade de cadastro (cnes_base) do perfil (auth.users.raw_user_meta_data).
-- Só ACRESCENTA colunas no fim — quem lia as antigas continua igual. Mesma regra de quem vê.
-- (Mudar o tipo de retorno exige drop + create; grants = os padrões de antes.)
begin;
drop function if exists public.admin_listar_pessoas();
create function public.admin_listar_pessoas()
 returns table(user_id uuid, email text, organizacao_id uuid, org_nome text, papeis text[], cnes text[],
               vinculo_ids uuid[], total_vinculos integer, perms jsonb,
               nome text, cns text, cnes_base text)
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
    coalesce((select ag.perms from agg ag where ag.user_id = p.user_id and ag.organizacao_id = p.organizacao_id), '{}'::jsonb),
    nullif(btrim(u.raw_user_meta_data->>'nome'), ''),
    nullif(regexp_replace(coalesce(u.raw_user_meta_data->>'cns', ''), '\D', '', 'g'), ''),
    nullif(regexp_replace(coalesce(u.raw_user_meta_data->>'cnes_base', ''), '\D', '', 'g'), '')
  from pessoas p
  join auth.users u on u.id = p.user_id
  join public.organizacoes o on o.id = p.organizacao_id
  left join ativos a on a.user_id = p.user_id and a.organizacao_id = p.organizacao_id
  group by p.user_id, u.email, u.raw_user_meta_data, p.organizacao_id, o.nome;
$function$;
commit;
