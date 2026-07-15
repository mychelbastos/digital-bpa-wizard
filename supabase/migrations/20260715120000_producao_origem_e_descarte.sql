-- Fase 2b (complemento): proveniência da ficha + descarte de produção por status.
--
-- Contexto: a produção real de junho/2026 foi IMPORTADA de um .JUN direto no banco
-- (369 fichas). Faltavam duas coisas para tratá-la com segurança:
--   1) um marcador de PROVENIÊNCIA (importado vs. digitado), e
--   2) uma forma de DESCARTAR o lote inteiro sem violar a imutabilidade (trigger
--      trg_fichas_no_delete proíbe DELETE de ficha).
--
-- Solução: coluna fichas.origem; um status 'descartada' na produção; e a view do
-- dashboard passa a ESCONDER fichas cuja produção esteja descartada. Descartar um
-- lote vira UM update de status (reversível), não um DELETE.

-- 1) Proveniência da ficha.
alter table public.fichas
  add column if not exists origem text not null default 'digitado';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fichas_origem_check'
  ) then
    alter table public.fichas
      add constraint fichas_origem_check check (origem in ('digitado','importado'));
  end if;
end $$;

-- 2) Novo status de produção: 'descartada' (lote reprovado, mantido no histórico).
--    'descartada' NÃO congela a ficha (ficha_congelada só considera exportada/transmitida),
--    então o lote continua editável/reversível.
alter table public.producoes drop constraint if exists producoes_status_check;
alter table public.producoes
  add constraint producoes_status_check
  check (status in ('aberta','exportada','transmitida','descartada'));

-- 3) Dashboard esconde fichas de produção descartada (mantém as de producao_id nulo).
create or replace view public.producao_dashboard
with (security_invoker = on) as
 select (((f.id)::text || '-c'::text) || (t.ord)::text) as id,
    f.id as ficha_id,
    'BPA-C'::text as tipo,
    f.cnes,
    f.mes_producao,
    (jdig((f.dados -> 'ano'::text)) || jdig((f.dados -> 'mes'::text))) as competencia,
    nullif((f.dados ->> 'nome'::text), ''::text) as estabelecimento_nome,
    null::text as profissional_cns,
    null::text as profissional_nome,
    nullif(jdig((t.r -> 'cbo'::text)), ''::text) as cbo,
    jdig((t.r -> 'procedimento'::text)) as procedimento,
    coalesce((nullif(jdig((t.r -> 'quantidade'::text)), ''::text))::integer, 0) as quantidade,
    null::text as servico,
    null::text as classificacao,
    null::text as cid,
    null::text as carater,
    (nullif(jdig((t.r -> 'idade'::text)), ''::text))::integer as idade
   from (fichas f
     cross join lateral jsonb_array_elements(coalesce((f.dados -> 'rows'::text), '[]'::jsonb)) with ordinality t(r, ord))
  where ((f.tipo = 'BPA-C'::text) and (f.substituida_por is null)
     and (jdig((t.r -> 'procedimento'::text)) <> ''::text)
     and (coalesce((nullif(jdig((t.r -> 'quantidade'::text)), ''::text))::integer, 0) > 0)
     and not exists (select 1 from public.producoes p where p.id = f.producao_id and p.status = 'descartada'))
union all
 select (((f.id)::text || '-i'::text) || (t.ord)::text) as id,
    f.id as ficha_id,
    'BPA-I'::text as tipo,
    f.cnes,
    f.mes_producao,
    (jdig((f.dados -> 'profAno'::text)) || jdig((f.dados -> 'profMes'::text))) as competencia,
    nullif((f.dados ->> 'nomeEstab'::text), ''::text) as estabelecimento_nome,
    nullif(jdig((f.dados -> 'profCns'::text)), ''::text) as profissional_cns,
    nullif((f.dados ->> 'profNome'::text), ''::text) as profissional_nome,
    nullif(jdig((f.dados -> 'profCbo'::text)), ''::text) as cbo,
    jdig((t.s -> 'codProc'::text)) as procedimento,
    coalesce((nullif(jdig((t.s -> 'qtde'::text)), ''::text))::integer, 0) as quantidade,
    nullif(jdig((t.s -> 'servico'::text)), ''::text) as servico,
    nullif(jdig((t.s -> 'classProc'::text)), ''::text) as classificacao,
    nullif(trim(both from jdig((t.s -> 'cid'::text))), ''::text) as cid,
    nullif(jdig((t.s -> 'carater'::text)), ''::text) as carater,
    null::integer as idade
   from (fichas f
     cross join lateral jsonb_array_elements(coalesce((f.dados -> 'seqs'::text), '[]'::jsonb)) with ordinality t(s, ord))
  where ((f.tipo = 'BPA-I'::text) and (f.substituida_por is null)
     and (jdig((t.s -> 'codProc'::text)) <> ''::text)
     and not exists (select 1 from public.producoes p where p.id = f.producao_id and p.status = 'descartada'));
