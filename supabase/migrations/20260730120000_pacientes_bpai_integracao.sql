-- Integração do cadastro central de pacientes com o BPA-I.
--
-- O cadastro `pacientes` (criado no módulo TFD) já é por organização, com dedup CNS/CPF,
-- RLS por vínculo, log LGPD (leituras_paciente) e soft-delete. Esta migration só ACRESCENTA
-- o que faltava para o BPA-I reusar o mesmo pool:
--   1) extensões pg_trgm + unaccent → busca de nome acento-insensível (qualidade de match:
--      nome com acento digitado sem acento). NÃO é por performance.
--   2) colunas `origem` (primeira aparição, auditoria) e `flag_revisao` (conflito no backfill).
--      `origem` NÃO é flag de presença — o `tfd boolean` continua marcando "apareceu no TFD".
--   3) RPC `buscar_pacientes` (invoker, respeita RLS) com match acento-insensível.
--   4) RPC `ultimo_atendimento_bpai` — devolve os campos de PROCEDIMENTO do último atendimento
--      BPA-I do paciente pelo MESMO profissional (CNS+CBO). Casa por pacienteId (inline no seq)
--      e cai para CNS/CPF em seqs históricas sem id. Escopo de org imposto por dentro (vínculo
--      do chamador), filtra org + competências recentes ANTES de varrer os seqs, e loga LGPD.
--
-- A identidade do paciente no BPA-I mora INLINE em fichas.dados.seqs[] (jsonb); o gerador do
-- .MAR lê dali. Isso já dá o snapshot de imutabilidade (Fase 3 congela `dados` na exportação).
-- Portanto NENHUM DDL em `fichas` é necessário — o vínculo seq→paciente é um campo do jsonb.
--
-- Idempotente.

-- ---------------------------------------------------------------------------
-- 1) Extensões (schema `extensions`, padrão Supabase).
-- ---------------------------------------------------------------------------
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent() do módulo não é IMMUTABLE (depende de dicionário); para indexar/normalizar
-- precisamos de um wrapper IMMUTABLE que fixa o dicionário. Padrão consagrado.
create or replace function public.imutavel_unaccent(text)
  returns text language sql immutable parallel safe set search_path = extensions as $$
  select extensions.unaccent('extensions.unaccent', $1)
$$;

-- ---------------------------------------------------------------------------
-- 2) Colunas novas do paciente.
-- ---------------------------------------------------------------------------
-- Primeira aparição (auditoria): 'bpa_i' | 'tfd' | 'manual'. Preenchida só na criação,
-- nunca sobrescrita. Não confundir com `tfd boolean` (presença no TFD).
alter table public.pacientes add column if not exists origem text
  check (origem is null or origem in ('bpa_i','tfd','manual'));
-- Marca conflito de identidade detectado no BACKFILL (mesmo CNS/CPF, nome/nascimento
-- divergente): mantém o existente e sinaliza p/ revisão humana. No fluxo interativo o
-- conflito é resolvido na hora (não seta esta flag).
alter table public.pacientes add column if not exists flag_revisao boolean not null default false;
create index if not exists pacientes_flag_revisao_idx
  on public.pacientes (organizacao_id) where flag_revisao;

-- Índice GIN trigram sobre o nome normalizado (sem acento) → busca fuzzy acento-insensível.
create index if not exists pacientes_nome_unaccent_trgm_idx
  on public.pacientes using gin (public.imutavel_unaccent(nome) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3) RPC de busca acento-insensível. SECURITY INVOKER (default) → respeita a RLS de
--    `pacientes` (o chamador só enxerga a org em que tem vínculo). O parâmetro _org fixa
--    a organização; termo numérico casa prefixo de CNS/CPF, termo texto casa nome sem acento.
-- ---------------------------------------------------------------------------
create or replace function public.buscar_pacientes(_org uuid, _termo text, _apenas_tfd boolean default false)
  returns setof public.pacientes
  language sql stable set search_path = public, extensions as $$
  select p.*
  from public.pacientes p
  where p.organizacao_id = _org
    and p.excluido_em is null
    and (not _apenas_tfd or p.tfd)
    and (
      (_termo ~ '^[0-9]+$' and (p.cns like _termo || '%' or p.cpf like _termo || '%'))
      or
      (_termo !~ '^[0-9]+$'
        and public.imutavel_unaccent(p.nome) ilike '%' || public.imutavel_unaccent(_termo) || '%')
    )
  order by p.nome
  limit 12
$$;
grant execute on function public.buscar_pacientes(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Último atendimento BPA-I do paciente pelo mesmo profissional (CNS + CBO).
--    Devolve os campos de PROCEDIMENTO (não a identidade). O botão "usar o mesmo
--    procedimento" preenche procedimento/serviço/classif./CID/caráter; quantidade e data
--    ficam em branco e a idade é recalculada no cliente.
--    SECURITY DEFINER: precisa varrer fichas de outros usuários da org — por isso o escopo
--    é imposto por dentro (org do paciente + vínculo ativo do chamador naquela org).
-- ---------------------------------------------------------------------------
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
  -- Org + documentos do paciente.
  select organizacao_id, nullif(regexp_replace(coalesce(cns,''), '\D','','g'),''),
         nullif(regexp_replace(coalesce(cpf,''), '\D','','g'),'')
    into _org, _cns, _cpf
    from public.pacientes where id = _paciente_id and excluido_em is null;
  if _org is null then return; end if;
  -- Escopo: o chamador precisa de vínculo ativo NAQUELA organização.
  if not exists (
    select 1 from public.vinculos v
    where v.user_id = (select auth.uid()) and v.organizacao_id = _org
      and v.inicio <= current_date and (v.fim is null or v.fim >= current_date)
  ) then return; end if;

  -- Filtra por org (via CNES do estabelecimento) + profissional + competências recentes
  -- (24 meses) ANTES de varrer os seqs; escolhe o atendimento com a data mais recente.
  select
      public.jdig(t.s->'codProc')  as procedimento,
      public.jdig(t.s->'servico')  as servico,
      public.jdig(t.s->'classProc') as classificacao,
      btrim(public.jdig(t.s->'cid')) as cid,
      public.jdig(t.s->'carater')  as carater
    into _rec
    from public.fichas f
    join public.estabelecimentos e on e.cnes = f.cnes and e.organizacao_id = _org
    cross join lateral jsonb_array_elements(coalesce(f.dados->'seqs', '[]'::jsonb)) with ordinality t(s, ord)
   where f.tipo = 'BPA-I' and f.substituida_por is null
     and public.jdig(f.dados->'profCns') = _pc
     and public.jdig(f.dados->'profCbo') = _cb
     and f.mes_producao >= to_char((now() - interval '24 months'), 'YYYYMM')
     and public.jdig(t.s->'codProc') <> ''
     and (
       (t.s->>'pacienteId') = _paciente_id::text
       or (_cns is not null and public.jdig(t.s->'cnsPac') = _cns)
       or (_cpf is not null and public.jdig(t.s->'cnsPac') = _cpf)
       or (_cpf is not null and public.jdig(t.s->'cpfPac') = _cpf)
     )
   order by
     (case when length(public.jdig(t.s->'dataAtend')) = 8
           then substr(public.jdig(t.s->'dataAtend'),5,4) || substr(public.jdig(t.s->'dataAtend'),3,2) || substr(public.jdig(t.s->'dataAtend'),1,2)
           else '00000000' end) desc,
     f.mes_producao desc
   limit 1;

  if not found then return; end if;

  -- LGPD: é leitura de PII de um atendimento anterior do paciente.
  perform public.registrar_leitura_paciente(_paciente_id);

  procedimento := _rec.procedimento;
  servico := _rec.servico;
  classificacao := _rec.classificacao;
  cid := _rec.cid;
  carater := _rec.carater;
  return next;
end $$;
grant execute on function public.ultimo_atendimento_bpai(uuid, text, text) to authenticated;
