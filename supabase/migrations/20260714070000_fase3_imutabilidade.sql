-- FASE 3 — Imutabilidade pós-exportação + reabertura + retificação (versionamento).
--
-- Princípio 6 da arquitetura: depois que a PRODUÇÃO é exportada, as fichas dela CONGELAM
-- (o banco recusa alterar conteúdo). Correção só por dois caminhos:
--   (a) REABRIR a produção (volta a 'aberta', descongela) — quem tem 'reabrir_producao';
--   (b) RETIFICAR a ficha: nasce uma NOVA VERSÃO (mesma tabela, ficha_origem_id +
--       numero_versao), a anterior é marcada como SUBSTITUÍDA — quem tem
--       'retificar_ficha_exportada'.
-- Ficha NUNCA é apagada. As permissões já existem (semeadas na Fase 0).

-- 1) Versionamento da ficha ------------------------------------------------------------
alter table public.fichas
  add column if not exists ficha_origem_id uuid references public.fichas(id),
  add column if not exists numero_versao   int  not null default 1,
  add column if not exists substituida_por uuid references public.fichas(id);
comment on column public.fichas.ficha_origem_id is 'Raiz da cadeia de versões (a 1ª ficha). NULL = a própria ficha é a raiz.';
comment on column public.fichas.numero_versao   is 'Versão dentro da cadeia (1 = original; +1 a cada retificação).';
comment on column public.fichas.substituida_por is 'Se preenchida, esta versão foi retificada — a vigente é a apontada. NULL = vigente.';
create index if not exists fichas_origem_idx on public.fichas(ficha_origem_id);

-- 2) Congelamento: uma ficha está congelada se sua produção foi exportada/transmitida ----
create or replace function public.ficha_congelada(_producao_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select status in ('exportada','transmitida') from public.producoes where id = _producao_id),
    false)
$$;

-- 3) Trigger de imutabilidade (BEFORE UPDATE): se congelada, recusa mudança de CONTEÚDO.
--    Só o versionamento (substituida_por) e o updated_at podem mudar — assim a retificação
--    consegue marcar a original como substituída sem "editar" a produção fechada.
create or replace function public.fichas_bloqueia_update_congelada()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.ficha_congelada(OLD.producao_id) then
    if NEW.dados          is distinct from OLD.dados
    or NEW.competencia    is distinct from OLD.competencia
    or NEW.tipo           is distinct from OLD.tipo
    or NEW.cnes           is distinct from OLD.cnes
    or NEW.mes_producao   is distinct from OLD.mes_producao
    or NEW.gestao_id      is distinct from OLD.gestao_id
    or NEW.producao_id    is distinct from OLD.producao_id
    or NEW.ficha_origem_id is distinct from OLD.ficha_origem_id
    or NEW.numero_versao  is distinct from OLD.numero_versao then
      raise exception 'Ficha % está congelada: pertence a uma produção já exportada. Reabra a produção ou emita uma retificação (nova versão).', OLD.id
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_fichas_congela on public.fichas;
create trigger trg_fichas_congela before update on public.fichas
  for each row execute function public.fichas_bloqueia_update_congelada();

-- 4) Bloqueio duro de DELETE — ficha nunca se apaga (histórico/imutabilidade) ------------
create or replace function public.fichas_bloqueia_delete()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Fichas não podem ser apagadas (histórico/imutabilidade). Use retificação.'
    using errcode = 'check_violation';
end $$;
drop trigger if exists trg_fichas_no_delete on public.fichas;
create trigger trg_fichas_no_delete before delete on public.fichas
  for each row execute function public.fichas_bloqueia_delete();

-- 5) Auditoria de reaberturas -----------------------------------------------------------
create table if not exists public.producao_reaberturas (
  id uuid primary key default gen_random_uuid(),
  producao_id uuid not null references public.producoes(id),
  reaberta_por uuid not null default auth.uid() references auth.users(id),
  reaberta_em timestamptz not null default now(),
  motivo text not null
);
alter table public.producao_reaberturas enable row level security;
drop policy if exists prod_reab_select on public.producao_reaberturas;
create policy prod_reab_select on public.producao_reaberturas for select using (
  exists (
    select 1 from public.producoes p
    join public.vinculos v on v.organizacao_id = p.organizacao_id
    where p.id = producao_reaberturas.producao_id
      and v.user_id = (select auth.uid())
      and (v.fim is null or v.fim >= current_date)
  )
);
-- Sem policy de INSERT: só a RPC (security definer) grava aqui.

-- 6) Helper: tem a permissão X em algum CNES da organização (vínculo ativo) --------------
create or replace function public.tem_permissao_no_org(_org uuid, _perm text)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vinculos v
    where v.user_id = (select auth.uid())
      and v.organizacao_id = _org
      and (v.fim is null or v.fim >= current_date)
      and public.tem_permissao(v.cnes, _perm)
  )
$$;

-- 7) RPC: reabrir produção exportada (não transmitida) → volta a 'aberta', descongela -----
create or replace function public.reabrir_producao(_producao_id uuid, _motivo text)
  returns void language plpgsql security definer set search_path = public as $$
declare _org uuid; _st text;
begin
  select organizacao_id, status into _org, _st from public.producoes where id = _producao_id;
  if _org is null then raise exception 'Produção % inexistente', _producao_id; end if;
  if not public.tem_permissao_no_org(_org, 'reabrir_producao') then
    raise exception 'Sem permissão para reabrir produção nesta organização' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(_motivo), '') = '' then
    raise exception 'Informe o motivo da reabertura';
  end if;
  if _st = 'transmitida' then
    raise exception 'Produção já transmitida não pode ser reaberta';
  end if;
  if _st = 'aberta' then return; end if; -- idempotente
  update public.producoes set status = 'aberta' where id = _producao_id;
  insert into public.producao_reaberturas(producao_id, motivo) values (_producao_id, _motivo);
end $$;

-- 8) RPC: retificar ficha exportada → cria NOVA VERSÃO (produção corrente), marca a
--    original como substituída. A nova versão nasce SEM produção (entra na do mês atual).
create or replace function public.retificar_ficha(_ficha_id uuid)
  returns uuid language plpgsql security definer set search_path = public as $$
declare _org uuid; _root uuid; _prox int; _nova uuid; _sub uuid;
begin
  select o.id into _org
    from public.fichas f
    join public.estabelecimentos e on e.cnes = f.cnes
    join public.organizacoes o on o.id = e.organizacao_id
    where f.id = _ficha_id;
  if _org is null then
    raise exception 'Ficha % inexistente ou sem estabelecimento/organização', _ficha_id;
  end if;
  if not public.tem_permissao_no_org(_org, 'retificar_ficha_exportada') then
    raise exception 'Sem permissão para retificar ficha nesta organização' using errcode = 'insufficient_privilege';
  end if;
  select substituida_por into _sub from public.fichas where id = _ficha_id;
  if _sub is not null then
    raise exception 'Esta ficha já foi substituída — retifique a versão vigente';
  end if;
  select coalesce(ficha_origem_id, id) into _root from public.fichas where id = _ficha_id;
  select coalesce(max(numero_versao), 0) + 1 into _prox
    from public.fichas where id = _root or ficha_origem_id = _root;
  insert into public.fichas
    (user_id, titulo, competencia, dados, tipo, cnes, profissional_cns, profissional_nome,
     mes_producao, gestao_id, ficha_origem_id, numero_versao)
  select user_id,
         titulo || ' (retificação v' || _prox || ')',
         competencia, dados, tipo, cnes, profissional_cns, profissional_nome,
         to_char(now(), 'YYYYMM'), gestao_id, _root, _prox
    from public.fichas where id = _ficha_id
    returning id into _nova;
  update public.fichas set substituida_por = _nova where id = _ficha_id;
  return _nova;
end $$;

grant execute on function public.reabrir_producao(uuid, text) to authenticated;
grant execute on function public.retificar_ficha(uuid) to authenticated;

-- 9) Dashboard: contar só a versão VIGENTE (exclui as substituídas). Recriação fiel da
--    view + filtro `substituida_por is null` nos dois ramos. (A derivação de competência
--    do BPA-I por dataAtend NÃO foi tocada aqui — é decisão à parte, ver nota no chat.)
create or replace view public.producao_dashboard
with (security_invoker = on) as
 SELECT (f.id::text || '-c'::text) || t.ord::text AS id,
    f.id AS ficha_id,
    'BPA-C'::text AS tipo,
    f.cnes,
    f.mes_producao,
    jdig(f.dados -> 'ano'::text) || jdig(f.dados -> 'mes'::text) AS competencia,
    NULLIF(f.dados ->> 'nome'::text, ''::text) AS estabelecimento_nome,
    NULL::text AS profissional_cns,
    NULL::text AS profissional_nome,
    NULLIF(jdig(t.r -> 'cbo'::text), ''::text) AS cbo,
    jdig(t.r -> 'procedimento'::text) AS procedimento,
    COALESCE(NULLIF(jdig(t.r -> 'quantidade'::text), ''::text)::integer, 0) AS quantidade,
    NULL::text AS servico,
    NULL::text AS classificacao,
    NULL::text AS cid,
    NULL::text AS carater,
    NULLIF(jdig(t.r -> 'idade'::text), ''::text)::integer AS idade
   FROM fichas f
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.dados -> 'rows'::text, '[]'::jsonb)) WITH ORDINALITY t(r, ord)
  WHERE f.tipo = 'BPA-C'::text AND f.substituida_por IS NULL
    AND jdig(t.r -> 'procedimento'::text) <> ''::text
    AND COALESCE(NULLIF(jdig(t.r -> 'quantidade'::text), ''::text)::integer, 0) > 0
UNION ALL
 SELECT (f.id::text || '-i'::text) || t.ord::text AS id,
    f.id AS ficha_id,
    'BPA-I'::text AS tipo,
    f.cnes,
    f.mes_producao,
        CASE
            WHEN length(jdig(t.s -> 'dataAtend'::text)) = 8 THEN substr(jdig(t.s -> 'dataAtend'::text), 5, 4) || substr(jdig(t.s -> 'dataAtend'::text), 3, 2)
            ELSE jdig(f.dados -> 'profAno'::text) || jdig(f.dados -> 'profMes'::text)
        END AS competencia,
    NULLIF(f.dados ->> 'nomeEstab'::text, ''::text) AS estabelecimento_nome,
    NULLIF(jdig(f.dados -> 'profCns'::text), ''::text) AS profissional_cns,
    NULLIF(f.dados ->> 'profNome'::text, ''::text) AS profissional_nome,
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
  WHERE f.tipo = 'BPA-I'::text AND f.substituida_por IS NULL
    AND jdig(t.s -> 'codProc'::text) <> ''::text;
