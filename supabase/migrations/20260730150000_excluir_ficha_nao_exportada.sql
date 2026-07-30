-- Exclusão (soft-delete) de fichas DIGITADAS que ainda NÃO foram exportadas.
--
-- Regra de arquitetura: produção nunca é apagada de verdade (histórico/imutabilidade — há um
-- trigger que bloqueia DELETE). Aqui fazemos SOFT-DELETE (marca `excluida_em`/`excluida_por`)
-- e um LOG (fichas_exclusoes: quem + quando + motivo). Só é permitido:
--   - pelo DONO da ficha (quem digitou), e
--   - se a ficha NÃO está congelada (produção exportada/transmitida).
-- Fichas excluídas somem do dashboard, do fechamento (.MAR), de "Minhas fichas", do crivo de
-- duplicidade e do "último atendimento".
-- Idempotente.

alter table public.fichas add column if not exists excluida_em timestamptz;
alter table public.fichas add column if not exists excluida_por uuid;
create index if not exists fichas_excluida_idx on public.fichas (excluida_em) where excluida_em is not null;

-- Log de exclusões (auditoria). Sobrevive à ficha; só a RPC grava.
create table if not exists public.fichas_exclusoes (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null,
  titulo text,
  cnes text,
  tipo text,
  excluida_por uuid not null default auth.uid(),
  excluida_em timestamptz not null default now(),
  motivo text
);
create index if not exists fichas_exclusoes_por_idx on public.fichas_exclusoes (excluida_por);
create index if not exists fichas_exclusoes_em_idx on public.fichas_exclusoes (excluida_em);
alter table public.fichas_exclusoes enable row level security;
drop policy if exists fichas_exclusoes_select on public.fichas_exclusoes;
create policy fichas_exclusoes_select on public.fichas_exclusoes for select to authenticated
  using (excluida_por = (select auth.uid()) or public.is_super_admin());
-- Sem policy de INSERT: só a RPC (security definer) grava.

-- RPC: exclui (soft) a ficha do próprio usuário, desde que não exportada. Loga. Idempotente.
create or replace function public.excluir_ficha(_id uuid, _motivo text default null)
  returns boolean language plpgsql security definer set search_path = public as $$
declare _owner uuid; _prod uuid; _tit text; _cnes text; _tipo text; _exc timestamptz;
begin
  select user_id, producao_id, titulo, cnes, tipo, excluida_em
    into _owner, _prod, _tit, _cnes, _tipo, _exc
    from public.fichas where id = _id;
  if _owner is null then return false; end if;      -- inexistente
  if _exc is not null then return true; end if;      -- já excluída (idempotente)
  if _owner <> (select auth.uid()) then
    raise exception 'Sem permissão para excluir esta ficha' using errcode = 'insufficient_privilege';
  end if;
  if public.ficha_congelada(_prod) then
    raise exception 'Ficha já exportada não pode ser excluída — reabra a produção ou emita uma retificação.'
      using errcode = 'check_violation';
  end if;
  update public.fichas set excluida_em = now(), excluida_por = (select auth.uid()) where id = _id;
  insert into public.fichas_exclusoes(ficha_id, titulo, cnes, tipo, motivo)
  values (_id, _tit, _cnes, _tipo, _motivo);
  return true;
end $$;
grant execute on function public.excluir_ficha(uuid, text) to authenticated;

-- Dashboard: passa a IGNORAR fichas excluídas (both ramos). Recriação fiel + `excluida_em is null`.
create or replace view public.producao_dashboard with (security_invoker = on) as
 SELECT (f.id::text || '-c'::text) || t.ord::text AS id,
    f.id AS ficha_id, 'BPA-C'::text AS tipo, f.cnes, f.mes_producao,
    jdig(f.dados -> 'ano'::text) || jdig(f.dados -> 'mes'::text) AS competencia,
    NULLIF(f.dados ->> 'nome'::text, ''::text) AS estabelecimento_nome,
    NULL::text AS profissional_cns,
    NULLIF(f.dados ->> 'profNome'::text, ''::text) AS profissional_nome,
    NULLIF(jdig(t.r -> 'cbo'::text), ''::text) AS cbo,
    jdig(t.r -> 'procedimento'::text) AS procedimento,
    COALESCE(NULLIF(jdig(t.r -> 'quantidade'::text), ''::text)::integer, 0) AS quantidade,
    NULL::text AS servico, NULL::text AS classificacao, NULL::text AS cid, NULL::text AS carater,
    NULLIF(jdig(t.r -> 'idade'::text), ''::text)::integer AS idade
   FROM fichas f
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.dados -> 'rows'::text, '[]'::jsonb)) WITH ORDINALITY t(r, ord)
  WHERE f.tipo = 'BPA-C'::text AND f.substituida_por IS NULL AND f.excluida_em IS NULL
    AND jdig(t.r -> 'procedimento'::text) <> ''::text
    AND COALESCE(NULLIF(jdig(t.r -> 'quantidade'::text), ''::text)::integer, 0) > 0
    AND NOT (EXISTS ( SELECT 1 FROM producoes p WHERE p.id = f.producao_id AND p.status = 'descartada'::text))
UNION ALL
 SELECT (f.id::text || '-i'::text) || t.ord::text AS id,
    f.id AS ficha_id, 'BPA-I'::text AS tipo, f.cnes, f.mes_producao,
    jdig(f.dados -> 'profAno'::text) || jdig(f.dados -> 'profMes'::text) AS competencia,
    NULLIF(f.dados ->> 'nomeEstab'::text, ''::text) AS estabelecimento_nome,
    NULLIF(jdig(f.dados -> 'profCns'::text), ''::text) AS profissional_cns,
    COALESCE(NULLIF(f.dados ->> 'profNome'::text, ''::text), prof.nome) AS profissional_nome,
    NULLIF(jdig(f.dados -> 'profCbo'::text), ''::text) AS cbo,
    jdig(t.s -> 'codProc'::text) AS procedimento,
    COALESCE(NULLIF(jdig(t.s -> 'qtde'::text), ''::text)::integer, 0) AS quantidade,
    NULLIF(jdig(t.s -> 'servico'::text), ''::text) AS servico,
    NULLIF(jdig(t.s -> 'classProc'::text), ''::text) AS classificacao,
    NULLIF(TRIM(BOTH FROM jdig(t.s -> 'cid'::text)), ''::text) AS cid,
    NULLIF(jdig(t.s -> 'carater'::text), ''::text) AS carater,
    NULL::integer AS idade
   FROM fichas f
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.dados -> 'seqs'::text, '[]'::jsonb)) WITH ORDINALITY t(s, ord)
     LEFT JOIN profissionais prof ON prof.cnes = f.cnes AND prof.cns = jdig(f.dados -> 'profCns'::text)
  WHERE f.tipo = 'BPA-I'::text AND f.substituida_por IS NULL AND f.excluida_em IS NULL
    AND jdig(t.s -> 'codProc'::text) <> ''::text
    AND NOT (EXISTS ( SELECT 1 FROM producoes p WHERE p.id = f.producao_id AND p.status = 'descartada'::text));

-- ultimo_atendimento_bpai passa a ignorar fichas excluídas (f.excluida_em is null).
create or replace function public.ultimo_atendimento_bpai(
  _paciente_id uuid, _prof_cns text, _prof_cbo text)
  returns table(procedimento text, servico text, classificacao text, cid text, carater text)
  language plpgsql security definer set search_path = public, extensions as $$
declare
  _org uuid; _cns text; _cpf text;
  _pc text := regexp_replace(coalesce(_prof_cns,''), '\D', '', 'g');
  _cb text := regexp_replace(coalesce(_prof_cbo,''), '\D', '', 'g');
  _rec record;
begin
  if _paciente_id is null then return; end if;
  select organizacao_id, nullif(regexp_replace(coalesce(cns,''), '\D','','g'),''),
         nullif(regexp_replace(coalesce(cpf,''), '\D','','g'),'')
    into _org, _cns, _cpf
    from public.pacientes where id = _paciente_id and excluido_em is null;
  if _org is null then return; end if;
  if not exists (
    select 1 from public.vinculos v
    where v.user_id = (select auth.uid()) and v.organizacao_id = _org
      and v.inicio <= current_date and (v.fim is null or v.fim >= current_date)
  ) then return; end if;
  select
      public.jdig(t.s->'codProc') as procedimento, public.jdig(t.s->'servico') as servico,
      public.jdig(t.s->'classProc') as classificacao, btrim(public.jdig(t.s->'cid')) as cid,
      public.jdig(t.s->'carater') as carater
    into _rec
    from public.fichas f
    join public.estabelecimentos e on e.cnes = f.cnes and e.organizacao_id = _org
    cross join lateral jsonb_array_elements(coalesce(f.dados->'seqs', '[]'::jsonb)) with ordinality t(s, ord)
   where f.tipo = 'BPA-I' and f.substituida_por is null and f.excluida_em is null
     and public.jdig(f.dados->'profCns') = _pc and public.jdig(f.dados->'profCbo') = _cb
     and f.mes_producao >= to_char((now() - interval '24 months'), 'YYYYMM')
     and public.jdig(t.s->'codProc') <> ''
     and ((t.s->>'pacienteId') = _paciente_id::text
       or (_cns is not null and public.jdig(t.s->'cnsPac') = _cns)
       or (_cpf is not null and public.jdig(t.s->'cnsPac') = _cpf)
       or (_cpf is not null and public.jdig(t.s->'cpfPac') = _cpf))
   order by (case when length(public.jdig(t.s->'dataAtend')) = 8
           then substr(public.jdig(t.s->'dataAtend'),5,4) || substr(public.jdig(t.s->'dataAtend'),3,2) || substr(public.jdig(t.s->'dataAtend'),1,2)
           else '00000000' end) desc, f.mes_producao desc
   limit 1;
  if not found then return; end if;
  perform public.registrar_leitura_paciente(_paciente_id);
  procedimento := _rec.procedimento; servico := _rec.servico;
  classificacao := _rec.classificacao; cid := _rec.cid; carater := _rec.carater;
  return next;
end $$;
