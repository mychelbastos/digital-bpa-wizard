-- FASE 2a — Gestão da ficha derivada da COMPETÊNCIA (doc seções 5.4 e 6).
-- A ficha é vinculada à gestão (mandato) cujo período contém o 1º dia da competência
-- do cabeçalho — NÃO a data de digitação. Ex.: competência 12/2025 digitada em jan/2026
-- pertence à gestão anterior. Independe da granularidade da produção (Fase 2b).

alter table public.fichas
  add column if not exists gestao_id uuid references public.gestoes(id);

-- Deriva a gestão a partir da competência + organização do CNES da ficha.
create or replace function public.gestao_da_ficha()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.competencia ~ '^[0-9]{6}$' then
    select g.id into new.gestao_id
    from public.estabelecimentos e
    join public.gestoes g on g.organizacao_id = e.organizacao_id
    where e.cnes = new.cnes
      and to_date(new.competencia, 'YYYYMM') between g.inicio and coalesce(g.fim, date '9999-12-31')
    limit 1;
  end if;
  return new;
end
$$;

drop trigger if exists fichas_set_gestao on public.fichas;
create trigger fichas_set_gestao
  before insert or update of competencia, cnes on public.fichas
  for each row execute function public.gestao_da_ficha();

-- Backfill das fichas existentes.
update public.fichas f set gestao_id = g.id
from public.estabelecimentos e
join public.gestoes g on g.organizacao_id = e.organizacao_id
where e.cnes = f.cnes
  and f.competencia ~ '^[0-9]{6}$'
  and to_date(f.competencia, 'YYYYMM') between g.inicio and coalesce(g.fim, date '9999-12-31')
  and f.gestao_id is null;
