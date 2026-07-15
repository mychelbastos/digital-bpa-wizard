-- Preenchimento de NOME do profissional no dashboard a partir do cache `profissionais`
-- (resolvido via integração cnes-profissionais / DATASUS). Proveniência + LGPD.
--
-- (1) Proveniência: `ambiente` (homolog/producao) na tabela profissionais. `atualizado_em`
--     já registra QUANDO foi resolvido. Motivo: ao virar produção, revalidar o que veio de
--     homologação.
-- (2) LGPD: remove o CPF do profissional — não é usado em nada. A edge function já parou de
--     gravá-lo (v4). Aqui apagamos a coluna (o dado deixa de existir).
-- (3) Dashboard: a view passa a mostrar o NOME do cache quando a ficha não trouxe o nome
--     (fichas importadas do .JUN vêm só com CNS). O CNS fica como ÚLTIMO recurso (o front já
--     faz `nome || cns` via nomeOuCodigo).

-- (1) Proveniência.
alter table public.profissionais add column if not exists ambiente text not null default 'homolog';

-- (2) LGPD: descarta o CPF do profissional (não utilizado).
alter table public.profissionais drop column if exists cpf;

-- (3) View: profissional_nome = nome da ficha, senão nome do cache; CNS é fallback no front.
--     Mantém o filtro de produção descartada (migração anterior) e a estrutura das colunas.
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
    -- Nome da ficha; se vier vazio (import), usa o nome do cache `profissionais` (CNS+CNES).
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
