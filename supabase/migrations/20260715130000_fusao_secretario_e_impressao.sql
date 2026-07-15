-- Fusão de cargos + Secretário municipal (visão org-scoped) + log de impressão.
--
-- (1) Aposenta admin_org e administrador_geral, funde no cargo "Secretário municipal"
--     (secretario_municipal): escopo organização, vê tudo do município e gerencia as
--     contas dele — sempre restrito à PRÓPRIA organização (isolamento já garantido pelas
--     funções SECURITY DEFINER + RLS existentes; nada muda ali).
-- (2) Nova permissão org-scoped ver_fichas_do_municipio: em vez de vincular o secretário a
--     cada CNES (dívida de sincronização), UMA regra dá visão de qualquer CNES presente ou
--     futuro do município. A RLS de fichas passa a honrá-la.
-- (3) Log F4 (leituras_ficha) ganha motivo: 'leitura' (abertura) vs 'impressao' (dado saindo
--     pro papel — o momento mais sensível pra LGPD).

-- ---------------------------------------------------------------------------
-- (2) Permissão org-scoped: ver as fichas de todos os CNES do município.
insert into public.permissoes (codigo, descricao, escopo)
values ('ver_fichas_do_municipio', 'Ver as fichas de todos os CNES do município', 'organizacao')
on conflict (codigo) do nothing;

-- (1) Cargo secretario_municipal = superset de tudo (todas as permissões do catálogo,
--     inclusive gerenciar_vinculos e a nova ver_fichas_do_municipio).
insert into public.papel_permissoes (papel, permissao)
select 'secretario_municipal', p.codigo from public.permissoes p
on conflict do nothing;

-- Migra os vínculos dos cargos aposentados (hoje só teste@bpa.com.br, 8 vínculos).
-- Nenhum acesso é perdido: o secretário mantém tudo que administrador_geral tinha, mais a
-- visão de município.
update public.vinculos set papel = 'secretario_municipal'
where papel in ('admin_org', 'administrador_geral');

-- Aposenta os cargos antigos do catálogo (impede novas atribuições; já sem vínculos).
delete from public.papel_permissoes where papel in ('admin_org', 'administrador_geral');

-- ---------------------------------------------------------------------------
-- (2) RLS de fichas: além da visão por CNES (ver_fichas_da_unidade) e da própria ficha,
--     honra ver_fichas_do_municipio — visão de TODOS os CNES do município do secretário.
--     Mapeia ficha -> organização por estabelecimentos.cnes; cobre CNES futuros de graça.
alter policy fichas_select on public.fichas using (
  public.tem_permissao(cnes, 'ver_fichas_da_unidade')
  or (
    (user_id = (select auth.uid()))
    and (cnes in (select c.cnes from public.cnes_visiveis() c))
  )
  or exists (
    select 1 from public.estabelecimentos e
    where e.cnes = fichas.cnes
      and public.tem_permissao_no_org(e.organizacao_id, 'ver_fichas_do_municipio')
  )
);

-- ---------------------------------------------------------------------------
-- (3) Log F4: motivo da leitura ('leitura' = abertura; 'impressao' = geração de PDF/impressão).
alter table public.leituras_ficha add column if not exists motivo text not null default 'leitura';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leituras_ficha_motivo_check') then
    alter table public.leituras_ficha
      add constraint leituras_ficha_motivo_check check (motivo in ('leitura', 'impressao'));
  end if;
end $$;

-- RPC ganha _motivo (default 'leitura', p/ chamadas antigas). Continua só-BPA-I (PII).
drop function if exists public.registrar_leitura_ficha(uuid);
create function public.registrar_leitura_ficha(_ficha_id uuid, _motivo text default 'leitura')
returns void language plpgsql security definer set search_path = public as $$
declare _tipo text; _cnes text;
begin
  if (select auth.uid()) is null then return; end if;
  select tipo, cnes into _tipo, _cnes from public.fichas where id = _ficha_id;
  if _tipo is null then return; end if;      -- ficha inexistente
  if _tipo <> 'BPA-I' then return; end if;   -- só BPA-I tem PII de paciente
  insert into public.leituras_ficha (ficha_id, cnes, motivo)
    values (_ficha_id, _cnes, case when _motivo = 'impressao' then 'impressao' else 'leitura' end);
end $$;
grant execute on function public.registrar_leitura_ficha(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Auditoria na UI: lista os "Donos do sistema" (super-admins) com e-mail. Visível a quem
-- já é admin (sou_admin); não expõe nada a mais. Não é atribuível pela tela.
create or replace function public.donos_do_sistema()
returns table (user_id uuid, email text)
language sql security definer set search_path = public as $$
  select sa.user_id, u.email::text
  from public.super_admins sa
  join auth.users u on u.id = sa.user_id
  where public.sou_admin();
$$;
grant execute on function public.donos_do_sistema() to authenticated;
