-- BPA-C V3: o NOME DO PROFISSIONAL passa a existir na ficha (dados->>'profNome') como
-- controle interno do painel (NÃO é exportado ao .txt / BPA Magnético — o gerador só lê
-- cnes/ano/mes/folha/rows). Aqui o dashboard passa a expor esse nome no ramo BPA-C, para
-- que o ranking/agrupamento "por profissional" funcione também no consolidado.
--
-- Única mudança vs a view anterior (20260715140000): no ramo BPA-C,
--   profissional_nome: null  ->  nullif(f.dados->>'profNome','')
-- Todo o resto (colunas, filtros de descarte, ramo BPA-I) permanece idêntico.
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
    -- Nome do profissional (BPA-C v3): controle interno do painel; fora do .txt.
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
  where ((f.tipo = 'BPA-I'::text) and (f.substituida_por is null)
     and (jdig((t.s -> 'codProc'::text)) <> ''::text)
     and not exists (select 1 from public.producoes p where p.id = f.producao_id and p.status = 'descartada'));
