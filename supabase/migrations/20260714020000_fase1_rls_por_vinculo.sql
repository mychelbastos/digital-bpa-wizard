-- ============================================================================
-- FASE 1 — Visibilidade por VÍNCULO (RLS) + dashboard sem PII + escopo por org.
-- Substitui a RLS "dono-apenas" de fichas pela regra do doc (seção 4.3):
--   "tenho vínculo ativo com o CNES desta ficha?" + filtro por PERMISSÃO.
-- ============================================================================

-- ---------- fichas: RLS por vínculo/permissão ----------
drop policy if exists fichas_owner_select on public.fichas;
drop policy if exists fichas_owner_insert on public.fichas;
drop policy if exists fichas_owner_update on public.fichas;

-- Ver: coordenador/operador (ver_fichas_da_unidade) vê tudo do CNES; digitador vê só
-- as próprias, e mesmo assim só enquanto tem vínculo ativo naquele CNES.
create policy fichas_select on public.fichas for select using (
  public.tem_permissao(cnes, 'ver_fichas_da_unidade')
  or (user_id = (select auth.uid()) and cnes in (select c.cnes from public.cnes_visiveis() c))
);
-- Criar: precisa de criar_ficha no CNES e ser o autor.
create policy fichas_insert on public.fichas for insert with check (
  user_id = (select auth.uid()) and public.tem_permissao(cnes, 'criar_ficha')
);
-- Editar: a própria ficha, com editar_ficha_propria no CNES. (A trava de imutabilidade
-- pós-exportação entra na Fase 3, via status/trigger.)
create policy fichas_update on public.fichas for update using (
  user_id = (select auth.uid()) and public.tem_permissao(cnes, 'editar_ficha_propria')
) with check (
  user_id = (select auth.uid()) and public.tem_permissao(cnes, 'editar_ficha_propria')
);

-- ---------- estabelecimentos / profissionais / vínculos-profissional: escopo por org ----------
-- Sai o "authenticated-only" do hotfix; entra o isolamento por organização (tenant).
alter policy estab_select on public.estabelecimentos using (
  exists (select 1 from public.vinculos v where v.user_id = (select auth.uid())
          and v.organizacao_id = estabelecimentos.organizacao_id
          and (v.fim is null or v.fim >= current_date))
);
alter policy prof_select on public.profissionais using (
  exists (select 1 from public.estabelecimentos e
          join public.vinculos v on v.organizacao_id = e.organizacao_id
          where e.cnes = profissionais.cnes and v.user_id = (select auth.uid())
            and (v.fim is null or v.fim >= current_date))
);
alter policy vinc_select on public.profissional_vinculos using (
  exists (select 1 from public.estabelecimentos e
          join public.vinculos v on v.organizacao_id = e.organizacao_id
          where e.cnes = profissional_vinculos.cnes and v.user_id = (select auth.uid())
            and (v.fim is null or v.fim >= current_date))
);

-- ============================================================================
-- Dashboard: produção achatada SEM PII do paciente.
-- View com security_invoker => aplica a RLS de fichas de quem consulta. O
-- coordenador vê a produção de todo o CNES; o digitador, só a própria — e em
-- NENHUM caso trafega nome/CNS/endereço de paciente (a view não os projeta).
-- ============================================================================

-- Concatena um array jsonb de dígitos (["0","2",...]) em texto ("02...").
create or replace function public.jdig(arr jsonb)
  returns text language sql immutable as $$
  select coalesce(string_agg(x, ''), '') from jsonb_array_elements_text(coalesce(arr, '[]'::jsonb)) x
$$;

create or replace view public.producao_dashboard with (security_invoker = on) as
-- BPA-C (consolidado; sem paciente): uma linha por procedimento preenchido.
select
  f.id::text || '-c' || ord::text                             as id,
  f.id                                                        as ficha_id,
  'BPA-C'::text                                               as tipo,
  f.cnes                                                      as cnes,
  f.mes_producao                                              as mes_producao,
  public.jdig(f.dados->'ano') || public.jdig(f.dados->'mes')  as competencia,
  nullif(f.dados->>'nome','')                                 as estabelecimento_nome,
  null::text                                                  as profissional_cns,
  null::text                                                  as profissional_nome,
  nullif(public.jdig(r->'cbo'),'')                            as cbo,
  public.jdig(r->'procedimento')                             as procedimento,
  coalesce(nullif(public.jdig(r->'quantidade'),'')::int, 0)   as quantidade,
  null::text as servico, null::text as classificacao, null::text as cid, null::text as carater,
  nullif(public.jdig(r->'idade'),'')::int                     as idade
from public.fichas f
cross join lateral jsonb_array_elements(coalesce(f.dados->'rows','[]'::jsonb)) with ordinality as t(r, ord)
where f.tipo = 'BPA-C'
  and public.jdig(r->'procedimento') <> ''
  and coalesce(nullif(public.jdig(r->'quantidade'),'')::int, 0) > 0
union all
-- BPA-I: uma linha por sequência preenchida; competência = data de atendimento.
select
  f.id::text || '-i' || ord::text,
  f.id,
  'BPA-I'::text,
  f.cnes,
  f.mes_producao,
  case when length(public.jdig(s->'dataAtend')) = 8
       then substr(public.jdig(s->'dataAtend'),5,4) || substr(public.jdig(s->'dataAtend'),3,2)
       else public.jdig(f.dados->'profAno') || public.jdig(f.dados->'profMes') end,
  nullif(f.dados->>'nomeEstab',''),
  nullif(public.jdig(f.dados->'profCns'),''),
  nullif(f.dados->>'profNome',''),
  nullif(public.jdig(f.dados->'profCbo'),''),
  public.jdig(s->'codProc'),
  coalesce(nullif(public.jdig(s->'qtde'),'')::int, 0),
  nullif(public.jdig(s->'servico'),''),
  nullif(public.jdig(s->'classProc'),''),
  nullif(trim(public.jdig(s->'cid')),''),
  nullif(public.jdig(s->'carater'),''),
  null::int
from public.fichas f
cross join lateral jsonb_array_elements(coalesce(f.dados->'seqs','[]'::jsonb)) with ordinality as t(s, ord)
where f.tipo = 'BPA-I'
  and public.jdig(s->'codProc') <> '';
