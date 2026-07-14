-- Mês de produção da ficha: o mês em que a ficha foi CRIADA (apresentação/processamento),
-- independente da competência de atendimento no cabeçalho. É por ele que a dashboard e o
-- Fechamento do mês agrupam a produção. Uma ficha criada em julho com cabeçalho 05/2026
-- pertence à produção de JULHO; a competência 05/2026 fica só nas linhas (prd-cmp).
alter table public.fichas
  add column if not exists mes_producao text check (mes_producao ~ '^[0-9]{6}$');

-- Backfill das fichas existentes: mês de criação (created_at).
update public.fichas
  set mes_producao = to_char(created_at, 'YYYYMM')
  where mes_producao is null;

create index if not exists fichas_user_mes_producao_idx
  on public.fichas (user_id, mes_producao);

-- producao_bpa fica APOSENTADA (dormante): a produção passa a ser derivada direto de
-- `fichas` (fonte única) e o registro na exportação foi removido. A tabela não é dropada
-- aqui de propósito; a remoção definitiva vai numa migration própria, nomeada.
