-- Vincular/desvincular UNIDADES (CNES) de uma pessoa pelo painel. "Desvincular" = encerrar a
-- vigência (fim = ontem → acesso cai na hora); o vínculo fica no histórico (rastreabilidade de
-- quem digitou o quê) e pode ser re-vinculado depois. Nunca apaga ficha. Modelo inalterado.

-- 1) admin_listar_pessoas: a pessoa continua listada mesmo sem vínculo ativo (para poder
--    re-vincular), mas cnes/papeis/perms/total refletem apenas os vínculos VIGENTES.
create or replace function public.admin_listar_pessoas()
  returns table (
    user_id uuid, email text, organizacao_id uuid, org_nome text,
    papeis text[], cnes text[], vinculo_ids uuid[], total_vinculos int, perms jsonb
  )
  language sql stable security definer set search_path = public as $$
  with managed as (
    select v.* from public.vinculos v
    where public.tem_permissao_no_org(v.organizacao_id, 'gerenciar_vinculos')
  ),
  ativos as (
    select * from managed where inicio <= current_date and (fim is null or fim >= current_date)
  ),
  ex as (
    select a.user_id, a.organizacao_id, unnest(public.perms_efetivas_vinculo(a.id)) as perm
    from ativos a
  ),
  agg as (
    select user_id, organizacao_id, jsonb_object_agg(perm, cnt) as perms
    from (select user_id, organizacao_id, perm, count(*) as cnt from ex group by 1, 2, 3) z
    group by 1, 2
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
$$;

-- 2) Estabelecimentos da organização (para o seletor "adicionar unidade").
create or replace function public.admin_estabelecimentos_org(_org uuid)
  returns table (cnes text, nome text)
  language sql stable security definer set search_path = public as $$
  select e.cnes, e.nome from public.estabelecimentos e
  where e.organizacao_id = _org
    and public.tem_permissao_no_org(_org, 'gerenciar_vinculos')
  order by e.cnes;
$$;

-- 3) Vincular a pessoa a um CNES (novo vínculo vigente). Recusa duplicar vínculo ativo.
create or replace function public.admin_vincular_unidade(_user_id uuid, _org uuid, _cnes text, _papel text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para gerenciar vínculos nesta organização' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.estabelecimentos e where e.cnes = _cnes and e.organizacao_id = _org) then
    raise exception 'CNES % não pertence a esta organização', _cnes;
  end if;
  if not exists (select 1 from public.papel_permissoes where papel = _papel) then
    raise exception 'Cargo % inexistente', _papel;
  end if;
  if exists (
    select 1 from public.vinculos v
    where v.user_id = _user_id and v.organizacao_id = _org and v.cnes = _cnes
      and v.inicio <= current_date and (v.fim is null or v.fim >= current_date)
  ) then
    raise exception 'A pessoa já tem um vínculo ativo neste CNES';
  end if;
  -- Regra: um digitador atua em UMA única unidade (índice vinculos_um_digitador_ativo).
  if _papel = 'digitador' and exists (
    select 1 from public.vinculos v where v.user_id = _user_id and v.papel = 'digitador' and v.fim is null
  ) then
    raise exception 'Esta pessoa já é digitador em outra unidade (um digitador atua em uma só unidade). Encerre o vínculo atual ou escolha outro cargo.';
  end if;
  insert into public.vinculos (user_id, organizacao_id, cnes, papel, concedido_por)
    values (_user_id, _org, _cnes, _papel, (select auth.uid()));
end $$;

-- 4) Desvincular = encerrar a vigência dos vínculos ativos da pessoa nesse CNES. Anti-lockout:
--    o admin não pode encerrar sua última porta de 'gerenciar_vinculos' na organização.
create or replace function public.admin_desvincular_unidade(_user_id uuid, _org uuid, _cnes text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para gerenciar vínculos nesta organização' using errcode = 'insufficient_privilege';
  end if;
  if _user_id = (select auth.uid()) and not exists (
    select 1 from public.vinculos v
    where v.user_id = _user_id and v.organizacao_id = _org and v.cnes <> _cnes
      and v.inicio <= current_date and (v.fim is null or v.fim >= current_date)
      and public.perms_efetivas_vinculo(v.id) @> array['gerenciar_vinculos']
  ) then
    raise exception 'Você não pode remover seu último vínculo com acesso de gerenciar vínculos';
  end if;
  update public.vinculos
    set fim = current_date - 1
  where user_id = _user_id and organizacao_id = _org and cnes = _cnes
    and inicio <= current_date and (fim is null or fim >= current_date);
end $$;

grant execute on function public.admin_estabelecimentos_org(uuid) to authenticated;
grant execute on function public.admin_vincular_unidade(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_desvincular_unidade(uuid, uuid, text) to authenticated;
