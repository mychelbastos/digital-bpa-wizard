-- Dashboard v2 (27/11/2026): série dos últimos meses JÁ SOMADA no banco. Antes o cliente
-- baixava ~12.800 linhas em várias páginas (a view recalcula as fichas a cada consulta → fila
-- de CPU no plano Free e a página toda travava). Somado dá ~400 linhas numa consulta.
-- TEMPO REAL: calcula na hora a partir da view producao_dashboard (nada fica guardado).
-- SECURITY INVOKER: roda com as permissões de quem chama → visibilidade idêntica à da view.
-- Sem SET search_path (nomes já qualificados): assim o Postgres "encaixa" a função na consulta
-- (inlining) — com o SET ela levava ~3 s; sem, ~0,8 s.
create or replace function public.dashboard_serie_mensal(_de text, _ate text)
returns table (mes_producao text, tipo text, cnes text, profissional_cns text, profissional_nome text,
               cbo text, procedimento text, quantidade bigint)
language sql stable security invoker as $$
  select d.mes_producao, d.tipo, d.cnes, d.profissional_cns, d.profissional_nome, d.cbo, d.procedimento,
         sum(d.quantidade)::bigint
  from public.producao_dashboard d
  where d.mes_producao between least(_de, _ate) and greatest(_de, _ate)
  group by 1, 2, 3, 4, 5, 6, 7;
$$;
revoke all on function public.dashboard_serie_mensal(text, text) from public, anon;
grant execute on function public.dashboard_serie_mensal(text, text) to authenticated;
