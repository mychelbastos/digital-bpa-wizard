-- Fichas EXCLUÍDAS (soft delete: fichas.excluida_em preenchido) ainda apareciam na view
-- producao_dashboard — logo contavam no dashboard, relatórios, FPO×Produção e crivo, mesmo
-- não aparecendo em "Minhas fichas" (que já filtra excluida_em). Ex.: julho mostrava BPA-C/BPA-I
-- de fichas apagadas. Correção: adicionar `f.excluida_em is null` aos três ramos (BPA-C/BPA-I/RAAS).
-- Nenhuma outra mudança na view.
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
    nullif((f.dados ->> 'profNome'::text), ''::text) as profissional_nome,
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
  where ((f.tipo = 'BPA-C'::text) and (f.substituida_por is null) and (f.excluida_em is null)
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
    coalesce(nullif((f.dados ->> 'profNome'::text), ''::text), prof.nome) as profissional_nome,
    nullif(jdig((f.dados -> 'profCbo'::text)), ''::text) as cbo,
    jdig((t.s -> 'codProc'::text)) as procedimento,
    coalesce((nullif(jdig((t.s -> 'qtde'::text)), ''::text))::integer, 0) as quantidade,
    nullif(jdig((t.s -> 'servico'::text)), ''::text) as servico,
    nullif(jdig((t.s -> 'classProc'::text)), ''::text) as classificacao,
    nullif(trim(both from jdig((t.s -> 'cid'::text))), ''::text) as cid,
    nullif(jdig((t.s -> 'carater'::text)), ''::text) as carater,
    null::integer as idade
   from ((fichas f
     cross join lateral jsonb_array_elements(coalesce((f.dados -> 'seqs'::text), '[]'::jsonb)) with ordinality t(s, ord))
     left join public.profissionais prof
       on prof.cnes = f.cnes and prof.cns = jdig(f.dados -> 'profCns'::text))
  where ((f.tipo = 'BPA-I'::text) and (f.substituida_por is null) and (f.excluida_em is null)
     and (jdig((t.s -> 'codProc'::text)) <> ''::text)
     and not exists (select 1 from public.producoes p where p.id = f.producao_id and p.status = 'descartada'))
union all
 select (((f.id)::text || '-r'::text) || (t.ord)::text) as id,
    f.id as ficha_id,
    'RAAS'::text as tipo,
    f.cnes,
    f.mes_producao,
    nullif(regexp_replace(coalesce((f.dados ->> 'competencia'::text), ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text) as competencia,
    nullif((f.dados ->> 'estabelecimentoNome'::text), ''::text) as estabelecimento_nome,
    nullif(regexp_replace(coalesce((t.a ->> 'cnsExecutante'::text), ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text) as profissional_cns,
    nullif((t.a ->> 'cnsExecutanteNome'::text), ''::text) as profissional_nome,
    nullif(regexp_replace(coalesce((t.a ->> 'cbo'::text), ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text) as cbo,
    regexp_replace(coalesce((t.a ->> 'procedimento'::text), ''::text), '[^0-9]'::text, ''::text, 'g'::text) as procedimento,
    coalesce((nullif(regexp_replace(coalesce((t.a ->> 'quantidade'::text), ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text))::integer, 0) as quantidade,
    nullif(regexp_replace(coalesce((t.a ->> 'servico'::text), ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text) as servico,
    nullif(regexp_replace(coalesce((t.a ->> 'classificacao'::text), ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text) as classificacao,
    nullif(upper(trim(both from coalesce((f.dados ->> 'cidPrincipal'::text), ''::text))), ''::text) as cid,
    nullif(regexp_replace(coalesce((f.dados ->> 'carater'::text), ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text) as carater,
    null::integer as idade
   from (fichas f
     cross join lateral jsonb_array_elements(coalesce((f.dados -> 'acoes'::text), '[]'::jsonb)) with ordinality t(a, ord))
  where ((f.tipo = 'RAAS'::text) and (f.substituida_por is null) and (f.excluida_em is null)
     and (regexp_replace(coalesce((t.a ->> 'procedimento'::text), ''::text), '[^0-9]'::text, ''::text, 'g'::text) <> ''::text)
     and (coalesce((nullif(regexp_replace(coalesce((t.a ->> 'quantidade'::text), ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text))::integer, 0) > 0)
     and not exists (select 1 from public.producoes p where p.id = f.producao_id and p.status = 'descartada'));
