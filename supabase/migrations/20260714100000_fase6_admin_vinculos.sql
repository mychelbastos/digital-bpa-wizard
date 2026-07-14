-- FASE 6 — Administração de vínculos (UI gated por 'gerenciar_vinculos').
-- Criação de usuário segue por SQL (decisão de arquitetura); aqui: ver os vínculos da
-- organização e conceder/revogar permissões por vínculo (override sobre o papel). Também
-- expõe o log de leitura LGPD (Fase 4) para os gestores.

-- Lista os vínculos das organizações que o usuário administra, com as permissões EFETIVAS
-- (papel + overrides concedidos − overrides revogados, vigentes).
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
  order by u.email, v.cnes;
$$;

-- Define uma permissão de um vínculo: true = concede (override), false = revoga (override),
-- null = limpa o override (volta ao padrão do papel).
create or replace function public.admin_definir_permissao(_vinculo_id uuid, _permissao text, _concedida boolean)
  returns void language plpgsql security definer set search_path = public as $$
declare _org uuid; _uid uuid;
begin
  select organizacao_id, user_id into _org, _uid from public.vinculos where id = _vinculo_id;
  if _org is null then raise exception 'Vínculo inexistente'; end if;
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para gerenciar vínculos nesta organização' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.permissoes where codigo = _permissao) then
    raise exception 'Permissão % inexistente', _permissao;
  end if;
  -- Guarda contra auto-lockout: não remover/revogar a própria 'gerenciar_vinculos'.
  if _permissao = 'gerenciar_vinculos' and _uid = (select auth.uid()) and coalesce(_concedida, false) = false then
    raise exception 'Você não pode remover a própria permissão de gerenciar vínculos';
  end if;
  delete from public.vinculo_permissoes where vinculo_id = _vinculo_id and permissao = _permissao;
  if _concedida is not null then
    insert into public.vinculo_permissoes(vinculo_id, permissao, concedida, concedido_por)
      values (_vinculo_id, _permissao, _concedida, (select auth.uid()));
  end if;
end $$;

-- Log de leitura LGPD (Fase 4) com e-mail/título, só para gestores. Ordena do mais recente.
create or replace function public.admin_leituras_recentes(_limite int default 100)
  returns table (lida_em timestamptz, email text, cnes text, ficha_id uuid, titulo text)
  language sql stable security definer set search_path = public as $$
  select l.lida_em, u.email::text, l.cnes, l.ficha_id, f.titulo
  from public.leituras_ficha l
  join auth.users u on u.id = l.lida_por
  join public.fichas f on f.id = l.ficha_id
  join public.estabelecimentos e on e.cnes = l.cnes
  where public.tem_permissao_no_org(e.organizacao_id, 'gerenciar_vinculos')
  order by l.lida_em desc
  limit greatest(1, least(_limite, 500));
$$;

grant execute on function public.admin_listar_vinculos() to authenticated;
grant execute on function public.admin_definir_permissao(uuid, text, boolean) to authenticated;
grant execute on function public.admin_leituras_recentes(int) to authenticated;

-- Catálogo de permissões (para a UI montar os toggles). Leitura pública p/ autenticados.
grant select on public.permissoes to authenticated;
