-- FPO (Ficha de Programação Orçamentária): teto orçado por (CNES + procedimento +
-- competência), para comparar com a produção real (fichas). Carga inicial via importação
-- do arquivo do estado (HTML disfarçado de .xls); depois editável no painel.
--
-- Código do procedimento: a FPO traz 9 dígitos (sem o dígito verificador); nossas fichas
-- usam o SIGTAP de 10 dígitos. Guardamos SEMPRE o 10 díg. resolvido em `procedimento`
-- (para casar com a produção); o 9 díg. original fica em `codigo_fpo` para rastreio. Quando
-- não resolve no SIGTAP, `procedimento` recebe o próprio código FPO e `resolvido=false`.

create table if not exists public.fpo_teto (
  cnes            text    not null,
  procedimento    text    not null,               -- SIGTAP 10 díg. (ou código FPO se não resolvido)
  competencia     text    not null check (competencia ~ '^[0-9]{6}$'),
  qtd_orcada      integer not null default 0 check (qtd_orcada >= 0),
  valor_unitario  numeric(12,2) not null default 0 check (valor_unitario >= 0),
  codigo_fpo      text,                            -- código original do arquivo (9 díg.)
  descricao_fpo   text,                            -- descrição do arquivo (referência)
  resolvido       boolean not null default true,   -- false = código não casou no SIGTAP
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid,
  primary key (cnes, procedimento, competencia)
);

alter table public.fpo_teto enable row level security;

-- VER: quem enxerga as fichas da unidade (mesma visibilidade das fichas, sem o ramo "dono").
drop policy if exists fpo_teto_select on public.fpo_teto;
create policy fpo_teto_select on public.fpo_teto for select to authenticated
using (
  tem_permissao(cnes, 'ver_fichas_da_unidade')
  or exists (
    select 1 from public.estabelecimentos e
    where e.cnes = fpo_teto.cnes and tem_permissao_no_org(e.organizacao_id, 'ver_fichas_do_municipio')
  )
);

-- EDITAR (insert/update/delete): permissão dedicada `editar_fpo`.
drop policy if exists fpo_teto_insert on public.fpo_teto;
create policy fpo_teto_insert on public.fpo_teto for insert to authenticated
with check (tem_permissao(cnes, 'editar_fpo'));
drop policy if exists fpo_teto_update on public.fpo_teto;
create policy fpo_teto_update on public.fpo_teto for update to authenticated
using (tem_permissao(cnes, 'editar_fpo')) with check (tem_permissao(cnes, 'editar_fpo'));
drop policy if exists fpo_teto_delete on public.fpo_teto;
create policy fpo_teto_delete on public.fpo_teto for delete to authenticated
using (tem_permissao(cnes, 'editar_fpo'));

-- Nova permissão + concessão aos papéis (secretário, coordenador, responsável por produção).
insert into public.permissoes (codigo, descricao, escopo)
values ('editar_fpo', 'Editar os tetos da FPO (Programação Orçamentária)', 'cnes')
on conflict (codigo) do nothing;

insert into public.papel_permissoes (papel, permissao)
values ('coordenador', 'editar_fpo'),
       ('operador_remessa', 'editar_fpo'),
       ('secretario_municipal', 'editar_fpo')
on conflict do nothing;

-- Resolve códigos FPO -> SIGTAP. Aceita 9 díg. (casa por prefixo, sem o DV) ou 10 díg.
-- (casa exato). Retorna NULL quando não existe procedimento correspondente.
create or replace function public.resolver_procedimentos_fpo(_codigos text[])
returns table(codigo_fpo text, codigo_sigtap text)
language sql stable security definer set search_path to 'public'
as $function$
  select c.cod as codigo_fpo,
    (select p.codigo from public.procedimentos_sigtap p
      where (length(c.cod) = 10 and p.codigo = c.cod)
         or (length(c.cod) = 9  and left(p.codigo, 9) = c.cod)
      limit 1) as codigo_sigtap
  from unnest(_codigos) as c(cod)
$function$;

grant execute on function public.resolver_procedimentos_fpo(text[]) to anon, authenticated;
