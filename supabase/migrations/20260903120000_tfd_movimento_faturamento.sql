-- Movimento de faturamento do TFD: o mês de PRODUÇÃO (remessa) em que a TFD foi faturada.
-- Normalmente = competencia; no faturamento RETROATIVO difere (ex.: viagens de 07/2026
-- faturadas na remessa de 08/2026). Permite: (a) identificar as retroativas na competência de
-- origem; (b) exibi-las na competência do movimento (para visualização, marcadas "retroativo").
alter table public.tfd add column if not exists movimento_faturamento text;

-- Backfill: para TFDs já faturadas, o movimento = mes_producao da ficha gerada (ficha_id).
update public.tfd t
set movimento_faturamento = fi.mes_producao
from public.fichas fi
where fi.id = t.ficha_id
  and t.status = 'faturada'
  and t.movimento_faturamento is null;
