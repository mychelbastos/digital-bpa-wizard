-- FASE 3 (cliente/backend) — o "fio" que liga a imutabilidade ao fluxo real, e o
-- alinhamento da competência exibida no dashboard com a que sai no .txt.
--
-- Regra de produção (confirmada no PA292720.MAR e pelo usuário):
--   - a ficha entra na PRODUÇÃO em que foi DIGITADA (mes_producao), sempre;
--   - a COMPETÊNCIA (cabeçalho da folha) vai DENTRO da linha, para o faturamento;
--   - o dashboard deve exibir a MESMA competência que sai no .txt.

-- 1) RPC atômica de fechamento: cria/obtém a produção do (org, mês), liga as fichas
--    VIGENTES daquele mês na organização, e marca a produção como 'exportada' — tudo numa
--    transação. A partir daí as fichas ficam congeladas (trigger da migration anterior).
--    A organização é derivada do vínculo do próprio usuário (produção é por município).
create or replace function public.exportar_producao(_mes text, _arquivo_nome text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare _org uuid; _orgs uuid[]; _pid uuid; _st text; _fichas int;
begin
  if _mes !~ '^[0-9]{6}$' then raise exception 'Mês de produção inválido (AAAAMM)'; end if;
  -- organização(ões) onde o usuário pode gerar produção
  select array_agg(distinct v.organizacao_id) into _orgs
    from public.vinculos v
    where v.user_id = (select auth.uid())
      and (v.fim is null or v.fim >= current_date)
      and public.tem_permissao(v.cnes, 'gerar_producao');
  if _orgs is null or array_length(_orgs, 1) is null then
    raise exception 'Sem permissão para fechar produção' using errcode = 'insufficient_privilege';
  end if;
  if array_length(_orgs, 1) > 1 then
    raise exception 'Você fecha produção em mais de uma organização; especifique qual';
  end if;
  _org := _orgs[1];

  insert into public.producoes(organizacao_id, mes_producao, status)
    values (_org, _mes, 'aberta')
    on conflict (organizacao_id, mes_producao) do nothing;
  select id, status into _pid, _st from public.producoes
    where organizacao_id = _org and mes_producao = _mes;
  if _st = 'transmitida' then
    raise exception 'Produção % já foi transmitida — não pode ser refechada', _mes;
  end if;

  -- liga as fichas vigentes do mês que pertencem à organização (via CNES do estabelecimento)
  update public.fichas f set producao_id = _pid
    where f.mes_producao = _mes
      and f.substituida_por is null
      and exists (select 1 from public.estabelecimentos e where e.cnes = f.cnes and e.organizacao_id = _org)
      and (f.producao_id is null or f.producao_id = _pid);
  get diagnostics _fichas = row_count;

  update public.producoes
    set status = 'exportada', gerado_em = now(), gerado_por = (select auth.uid()), arquivo_nome = _arquivo_nome
    where id = _pid;

  return jsonb_build_object('producao_id', _pid, 'fichas_congeladas', _fichas, 'mes', _mes);
end $$;
grant execute on function public.exportar_producao(text, text) to authenticated;

-- 2) Dashboard: competência do BPA-I = competência da FICHA (profAno/profMes = cabeçalho da
--    folha), NÃO derivada da data de atendimento. Passa a bater com o gerador do .txt e com
--    o BPA-C. (Demais colunas idênticas à recriação da migration anterior.)
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
    jdig(f.dados -> 'profAno'::text) || jdig(f.dados -> 'profMes'::text) AS competencia,
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
