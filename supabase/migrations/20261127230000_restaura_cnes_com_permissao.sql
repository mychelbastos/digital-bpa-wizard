-- CORREÇÃO (27/11/2026): a migration 20261127090000 (otimização de Minhas fichas) criou por
-- engano uma função com o MESMO NOME de uma que já existia — public.cnes_com_permissao(_perm),
-- usada pelo app (Fechamento, FPO, TFD, mês de faturamento) e por definir_movimento_faturamento —
-- e trocou o formato da resposta (table(cnes) → setof text). O app passou a receber lista vazia
-- ("sem permissão"). Aqui:
--   1) o helper da policy ganha nome próprio: rls_cnes_com_permissao (mesma lógica de ontem);
--   2) a policy fichas_select passa a usá-lo (regra idêntica — conferida usuário a usuário);
--   3) a cnes_com_permissao ORIGINAL (de 20260714040000) volta exatamente como era.

create or replace function public.rls_cnes_com_permissao(_perm text)
returns setof text language sql stable security definer set search_path = public as $$
  select distinct v.cnes from public.vinculos v
  where v.user_id = (select auth.uid())
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
$$;
revoke all on function public.rls_cnes_com_permissao(text) from public;
grant execute on function public.rls_cnes_com_permissao(text) to authenticated, anon;

drop policy if exists fichas_select on public.fichas;
create policy fichas_select on public.fichas for select using (
  (select public.is_super_admin())
  or cnes in (select public.rls_cnes_com_permissao('ver_fichas_da_unidade'))
  or ((user_id = (select auth.uid())) and (cnes in (select c.cnes from public.cnes_visiveis() c(cnes))))
  or exists (select 1 from public.estabelecimentos e
             where e.cnes = fichas.cnes and public.tem_permissao_no_org(e.organizacao_id, 'ver_fichas_do_municipio'))
);

drop function if exists public.cnes_com_permissao(text);
create function public.cnes_com_permissao(_perm text)
  returns table(cnes text)
  language sql stable security definer set search_path = public as $$
  select c.cnes from public.cnes_visiveis() c
  where public.tem_permissao(c.cnes, _perm)
$$;
grant execute on function public.cnes_com_permissao(text) to authenticated;
