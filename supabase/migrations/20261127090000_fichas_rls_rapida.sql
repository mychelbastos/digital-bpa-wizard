-- Desempenho de "Minhas fichas" (27/11/2026): a policy fichas_select chamava
-- tem_permissao(cnes, 'ver_fichas_da_unidade') UMA VEZ POR FICHA (~6.400 chamadas por consulta,
-- ~0,9 s por página de 1.000). Equivalência usada:
--   tem_permissao(c, p)  ≡  is_super_admin()  OR  c IN cnes_com_permissao(p)
-- onde cnes_com_permissao(p) é exatamente o EXISTS de tem_permissao sem o filtro v.cnes = _cnes.
-- Com (select …) o Postgres calcula as duas coisas UMA vez por consulta (InitPlan/hashed).
-- A regra de quem vê o quê NÃO muda (conferido usuário a usuário antes de aplicar).

create or replace function public.cnes_com_permissao(_perm text)
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
revoke all on function public.cnes_com_permissao(text) from public;
-- anon pode executar (devolve vazio: auth.uid() nulo) para a policy dar "0 fichas" e não erro, como antes.
grant execute on function public.cnes_com_permissao(text) to authenticated, anon;

drop policy if exists fichas_select on public.fichas;
create policy fichas_select on public.fichas for select using (
  (select public.is_super_admin())
  or cnes in (select public.cnes_com_permissao('ver_fichas_da_unidade'))
  or ((user_id = (select auth.uid())) and (cnes in (select c.cnes from public.cnes_visiveis() c(cnes))))
  or exists (select 1 from public.estabelecimentos e
             where e.cnes = fichas.cnes and public.tem_permissao_no_org(e.organizacao_id, 'ver_fichas_do_municipio'))
);
