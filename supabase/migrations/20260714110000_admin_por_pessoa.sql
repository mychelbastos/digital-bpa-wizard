-- Admin de vínculos, revisão: agrupar por PESSOA (não por vínculo) e separar o ESCOPO da
-- permissão. 'gerenciar_vinculos' é da ORGANIZAÇÃO (uma vez por pessoa); as demais são do
-- CNES (por unidade, mas editadas uma vez e aplicadas a todos os vínculos da pessoa por
-- padrão). O modelo de dados não muda (1 vínculo por CNES) — muda a apresentação e as RPCs.

-- 1) Escopo de cada permissão.
alter table public.permissoes add column if not exists escopo text not null default 'cnes'
  check (escopo in ('organizacao', 'cnes'));
update public.permissoes set escopo = 'organizacao' where codigo = 'gerenciar_vinculos';

-- 2) Permissões EFETIVAS de um vínculo (papel + overrides concedidos − revogados), sem
--    depender de auth.uid() (resolve p/ QUALQUER vínculo, não só o do usuário atual).
create or replace function public.perms_efetivas_vinculo(_vid uuid)
  returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct base.p order by base.p), '{}')
  from (
    select pp.permissao as p
      from public.papel_permissoes pp
      join public.vinculos v on v.id = _vid and v.papel = pp.papel
    union
    select vp.permissao
      from public.vinculo_permissoes vp
      where vp.vinculo_id = _vid and vp.concedida and (vp.ate is null or vp.ate >= current_date)
  ) base
  where base.p not in (
    select vp.permissao from public.vinculo_permissoes vp
      where vp.vinculo_id = _vid and not vp.concedida and (vp.ate is null or vp.ate >= current_date)
  )
$$;

-- 3) Lista PESSOAS (user × organização) que o usuário administra, com: papéis, unidades,
--    total de vínculos e, por permissão, quantos vínculos a têm (a UI deriva on/parcial/off).
create or replace function public.admin_listar_pessoas()
  returns table (
    user_id uuid, email text, organizacao_id uuid, org_nome text,
    papeis text[], cnes text[], vinculo_ids uuid[], total_vinculos int, perms jsonb
  )
  language sql stable security definer set search_path = public as $$
  with mine as (
    select v.* from public.vinculos v
    where public.tem_permissao_no_org(v.organizacao_id, 'gerenciar_vinculos')
  ),
  ex as (
    select m.user_id, m.organizacao_id, unnest(public.perms_efetivas_vinculo(m.id)) as perm
    from mine m
  ),
  agg as (
    select user_id, organizacao_id, jsonb_object_agg(perm, cnt) as perms
    from (select user_id, organizacao_id, perm, count(*) as cnt from ex group by 1, 2, 3) z
    group by 1, 2
  )
  select m.user_id, u.email::text, m.organizacao_id, o.nome,
    array_agg(distinct m.papel),
    array_agg(distinct m.cnes order by m.cnes),
    array_agg(m.id),
    count(*)::int,
    coalesce((select a.perms from agg a where a.user_id = m.user_id and a.organizacao_id = m.organizacao_id), '{}'::jsonb)
  from mine m
  join auth.users u on u.id = m.user_id
  join public.organizacoes o on o.id = m.organizacao_id
  group by m.user_id, u.email, m.organizacao_id, o.nome;
$$;

-- 4) Define uma permissão PARA A PESSOA — aplica a TODOS os vínculos dela na organização
--    (org-scoped e cnes-scoped por padrão são editadas "uma vez"). true=concede,
--    false=revoga, null=limpa o override (volta ao papel). Coerente por construção.
create or replace function public.admin_definir_permissao_pessoa(_user_id uuid, _org uuid, _permissao text, _concedida boolean)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para gerenciar vínculos nesta organização' using errcode = 'insufficient_privilege';
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

-- 5) Troca o CARGO da pessoa em TODOS os vínculos dela na organização, e limpa os overrides
--    CNES-scoped (recomeça do pacote do cargo). Overrides de organização (gerenciar_vinculos)
--    são preservados.
create or replace function public.admin_trocar_cargo_pessoa(_user_id uuid, _org uuid, _papel text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para gerenciar vínculos nesta organização' using errcode = 'insufficient_privilege';
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

grant execute on function public.admin_listar_pessoas() to authenticated;
grant execute on function public.admin_definir_permissao_pessoa(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.admin_trocar_cargo_pessoa(uuid, uuid, text) to authenticated;
grant select on public.papel_permissoes to authenticated; -- a UI mostra "≠ padrão do cargo"
