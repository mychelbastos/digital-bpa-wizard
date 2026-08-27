-- Permissões de MENU (acesso às páginas) e de EMISSÃO DE RELATÓRIOS, escopo organização.
-- Política escolhida: TUDO LIBERADO POR PADRÃO — todos os cargos recebem estas permissões;
-- o admin BLOQUEIA por pessoa (override concedida=false) na Administração. Elas aparecem
-- automaticamente na grade de permissões do admin (que lista de `permissoes`).

-- 1) Catálogo
insert into public.permissoes (codigo, descricao, escopo) values
  ('ver_dashboard',        'Menu · Início (dashboard)',                 'organizacao'),
  ('ver_minhas_fichas',    'Menu · Minhas fichas',                      'organizacao'),
  ('ver_relatorios',       'Menu · Relatórios',                         'organizacao'),
  ('ver_fpo',              'Menu · FPO (Orçamento)',                    'organizacao'),
  ('ver_exportar',         'Menu · Exportar produção',                  'organizacao'),
  ('ver_importar',         'Menu · Importar produção',                  'organizacao'),
  ('ver_formularios',      'Menu · Formulários',                        'organizacao'),
  ('emitir_rel_producao',     'Relatório · Produção',                   'organizacao'),
  ('emitir_rel_consistencia', 'Relatório · Consistência da produção',   'organizacao'),
  ('emitir_rel_inativos',     'Relatório · Profissionais sem produção', 'organizacao'),
  ('emitir_rel_fpo',          'Relatório · FPO × Produção',             'organizacao'),
  ('emitir_rel_tfd',          'Relatório · TFD',                        'organizacao'),
  ('emitir_rel_perfil',       'Relatório · Perfil de pacientes',        'organizacao')
on conflict (codigo) do nothing;

-- 2) Default: concede a TODOS os cargos (tudo liberado por padrão).
insert into public.papel_permissoes (papel, permissao)
select p.papel, c.codigo
from (select distinct papel from public.papel_permissoes) p
cross join (values
  ('ver_dashboard'),('ver_minhas_fichas'),('ver_relatorios'),('ver_fpo'),('ver_exportar'),
  ('ver_importar'),('ver_formularios'),('emitir_rel_producao'),('emitir_rel_consistencia'),
  ('emitir_rel_inativos'),('emitir_rel_fpo'),('emitir_rel_tfd'),('emitir_rel_perfil')
) c(codigo)
on conflict do nothing;

-- 3) RPC: todas as permissões EFETIVAS do usuário (union entre os vínculos ativos), já
-- considerando revogações. Super-admin recebe o catálogo inteiro. Usada pelo front para
-- decidir menu (cadeado) e relatórios (bloqueio).
create or replace function public.minhas_permissoes()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.is_super_admin()
    then coalesce((select array_agg(codigo) from public.permissoes), '{}')
    else coalesce((
      select array_agg(distinct pcode) from (
        -- defaults do cargo (não revogados por override)
        select pp.permissao as pcode
        from public.vinculos v
        join public.papel_permissoes pp on pp.papel = v.papel
        where v.user_id = (select auth.uid())
          and v.inicio <= current_date and (v.fim is null or v.fim >= current_date)
          and not exists (
            select 1 from public.vinculo_permissoes vp
            where vp.vinculo_id = v.id and vp.permissao = pp.permissao
              and vp.concedida = false and (vp.ate is null or vp.ate >= current_date)
          )
        union
        -- overrides concedidos
        select vp.permissao
        from public.vinculos v
        join public.vinculo_permissoes vp on vp.vinculo_id = v.id
        where v.user_id = (select auth.uid())
          and v.inicio <= current_date and (v.fim is null or v.fim >= current_date)
          and vp.concedida = true and (vp.ate is null or vp.ate >= current_date)
      ) t
    ), '{}')
  end
$$;

grant execute on function public.minhas_permissoes() to authenticated;
