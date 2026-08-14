-- Conta DONO DO SISTEMA (super-admin): a "conta coringa".
--   1) Acima de TODAS as permissões — passa em qualquer gate operacional (CNES), não só nos
--      gates de organização (que já bypassavam). Navega por todas as prefeituras/unidades.
--   2) OCULTA para quem não é super-admin — não aparece nas listagens de usuários/vínculos
--      nem no banner "Dono do sistema".
--   3) INTOCÁVEL por quem não é super-admin — nenhuma mutação de vínculo/cargo/permissão pode
--      alterar o dono, a menos que o autor também seja super-admin.

-- Helper: o user_id ALVO é super-admin? (o is_super_admin() existente só testa o AUTOR.)
create or replace function public.is_super_admin_user(_uid uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins s where s.user_id = _uid);
$$;
grant execute on function public.is_super_admin_user(uuid) to authenticated;

-- (1) Super-admin passa em QUALQUER permissão operacional (CNES). Antes só os gates de
-- organização (tem_permissao_no_org) bypassavam; o dono não tinha as permissões de CNES.
create or replace function public.tem_permissao(_cnes text, _perm text)
  returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.vinculos v
    where v.user_id = (select auth.uid())
      and v.cnes = _cnes
      and v.inicio <= current_date
      and (v.fim is null or v.fim >= current_date)
      and not exists (
        select 1 from public.vinculo_permissoes vp
        where vp.vinculo_id = v.id and vp.permissao = _perm
          and vp.concedida = false and (vp.ate is null or vp.ate >= current_date)
      )
      and (
        exists (select 1 from public.papel_permissoes pp where pp.papel = v.papel and pp.permissao = _perm)
        or exists (
          select 1 from public.vinculo_permissoes vp
          where vp.vinculo_id = v.id and vp.permissao = _perm
            and vp.concedida = true and (vp.ate is null or vp.ate >= current_date)
        )
      )
  )
$$;

-- (2a) Banner "Dono do sistema": só super-admin enxerga os donos (antes: qualquer sou_admin).
create or replace function public.donos_do_sistema()
returns table (user_id uuid, email text)
language sql security definer set search_path = public as $$
  select sa.user_id, u.email::text
  from public.super_admins sa
  join auth.users u on u.id = sa.user_id
  where public.is_super_admin();
$$;

-- (2b) Lista de pessoas: esconde o dono de quem não é super-admin.
create or replace function public.admin_listar_pessoas()
  returns table (
    user_id uuid, email text, organizacao_id uuid, org_nome text,
    papeis text[], cnes text[], vinculo_ids uuid[], total_vinculos int, perms jsonb
  )
  language sql stable security definer set search_path = public as $$
  with managed as (
    select v.* from public.vinculos v
    where public.tem_permissao_no_org(v.organizacao_id, 'gerenciar_vinculos')
      and (public.is_super_admin() or not public.is_super_admin_user(v.user_id))
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

-- (2c) Lista de vínculos: esconde os vínculos do dono de quem não é super-admin.
create or replace function public.admin_listar_vinculos()
  returns table (
    vinculo_id uuid, user_id uuid, email text, organizacao_id uuid, org_nome text,
    cnes text, papel text, inicio date, fim date, permissoes text[]
  )
  language sql stable security definer set search_path = public as $$
  select v.id, v.user_id, u.email::text, v.organizacao_id, o.nome, v.cnes, v.papel, v.inicio, v.fim,
    (
      select coalesce(array_agg(distinct base.p order by base.p), '{}')
      from (
        select pp.permissao as p from public.papel_permissoes pp where pp.papel = v.papel
        union
        select vp.permissao from public.vinculo_permissoes vp
          where vp.vinculo_id = v.id and vp.concedida and (vp.ate is null or vp.ate >= current_date)
      ) base
      where base.p not in (
        select vp.permissao from public.vinculo_permissoes vp
          where vp.vinculo_id = v.id and not vp.concedida and (vp.ate is null or vp.ate >= current_date)
      )
    ) as permissoes
  from public.vinculos v
  join public.organizacoes o on o.id = v.organizacao_id
  join auth.users u on u.id = v.user_id
  where public.tem_permissao_no_org(v.organizacao_id, 'gerenciar_vinculos')
    and (public.is_super_admin() or not public.is_super_admin_user(v.user_id))
  order by u.email, v.cnes;
$$;

-- (3) Mutações: bloqueiam alterar o dono quando o autor não é super-admin.

create or replace function public.admin_definir_permissao_pessoa(_user_id uuid, _org uuid, _permissao text, _concedida boolean)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para gerenciar vínculos nesta organização' using errcode = 'insufficient_privilege';
  end if;
  if public.is_super_admin_user(_user_id) and not public.is_super_admin() then
    raise exception 'Conta do dono do sistema — protegida.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.permissoes where codigo = _permissao) then
    raise exception 'Permissão % inexistente', _permissao;
  end if;
  if _permissao = 'gerenciar_vinculos' and _user_id = (select auth.uid()) and coalesce(_concedida, false) = false then
    raise exception 'Você não pode remover a própria permissão de gerenciar vínculos';
  end if;
  delete from public.vinculo_permissoes vp
    using public.vinculos v
    where vp.vinculo_id = v.id and v.user_id = _user_id and v.organizacao_id = _org and vp.permissao = _permissao;
  if _concedida is not null then
    insert into public.vinculo_permissoes(vinculo_id, permissao, concedida, concedido_por)
      select v.id, _permissao, _concedida, (select auth.uid())
      from public.vinculos v where v.user_id = _user_id and v.organizacao_id = _org;
  end if;
end $$;

create or replace function public.admin_trocar_cargo_pessoa(_user_id uuid, _org uuid, _papel text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para gerenciar vínculos nesta organização' using errcode = 'insufficient_privilege';
  end if;
  if public.is_super_admin_user(_user_id) and not public.is_super_admin() then
    raise exception 'Conta do dono do sistema — protegida.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.papel_permissoes where papel = _papel) then
    raise exception 'Cargo % inexistente', _papel;
  end if;
  update public.vinculos set papel = _papel where user_id = _user_id and organizacao_id = _org;
  delete from public.vinculo_permissoes vp
    using public.vinculos v, public.permissoes p
    where vp.vinculo_id = v.id and v.user_id = _user_id and v.organizacao_id = _org
      and vp.permissao = p.codigo and p.escopo = 'cnes';
end $$;

create or replace function public.admin_definir_permissao(_vinculo_id uuid, _permissao text, _concedida boolean)
  returns void language plpgsql security definer set search_path = public as $$
declare _org uuid; _uid uuid;
begin
  select organizacao_id, user_id into _org, _uid from public.vinculos where id = _vinculo_id;
  if _org is null then raise exception 'Vínculo inexistente'; end if;
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para gerenciar vínculos nesta organização' using errcode = 'insufficient_privilege';
  end if;
  if public.is_super_admin_user(_uid) and not public.is_super_admin() then
    raise exception 'Conta do dono do sistema — protegida.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.permissoes where codigo = _permissao) then
    raise exception 'Permissão % inexistente', _permissao;
  end if;
  if _permissao = 'gerenciar_vinculos' and _uid = (select auth.uid()) and coalesce(_concedida, false) = false then
    raise exception 'Você não pode remover a própria permissão de gerenciar vínculos';
  end if;
  delete from public.vinculo_permissoes where vinculo_id = _vinculo_id and permissao = _permissao;
  if _concedida is not null then
    insert into public.vinculo_permissoes(vinculo_id, permissao, concedida, concedido_por)
      values (_vinculo_id, _permissao, _concedida, (select auth.uid()));
  end if;
end $$;

create or replace function public.admin_vincular_unidade(_user_id uuid, _org uuid, _cnes text, _papel text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para gerenciar vínculos nesta organização' using errcode = 'insufficient_privilege';
  end if;
  if public.is_super_admin_user(_user_id) and not public.is_super_admin() then
    raise exception 'Conta do dono do sistema — protegida.' using errcode = 'insufficient_privilege';
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
  if _papel = 'digitador' and exists (
    select 1 from public.vinculos v where v.user_id = _user_id and v.papel = 'digitador' and v.fim is null
  ) then
    raise exception 'Esta pessoa já é digitador em outra unidade (um digitador atua em uma só unidade). Encerre o vínculo atual ou escolha outro cargo.';
  end if;
  insert into public.vinculos (user_id, organizacao_id, cnes, papel, concedido_por)
    values (_user_id, _org, _cnes, _papel, (select auth.uid()));
end $$;

create or replace function public.admin_desvincular_unidade(_user_id uuid, _org uuid, _cnes text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para gerenciar vínculos nesta organização' using errcode = 'insufficient_privilege';
  end if;
  if public.is_super_admin_user(_user_id) and not public.is_super_admin() then
    raise exception 'Conta do dono do sistema — protegida.' using errcode = 'insufficient_privilege';
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
