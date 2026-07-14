-- producao_bpa.ficha_id: SET NULL -> CASCADE.
-- Antes, apagar uma ficha só desvinculava a produção (ficha_id -> NULL) e as linhas
-- ficavam na dashboard. Passa a apagar a produção junto com a ficha, para a dashboard
-- refletir as fichas existentes. (Registros já órfãos — ficha_id NULL — não são afetados
-- por esta mudança; foram limpos à parte.)
alter table public.producao_bpa
  drop constraint if exists producao_bpa_ficha_id_fkey;

alter table public.producao_bpa
  add constraint producao_bpa_ficha_id_fkey
  foreign key (ficha_id) references public.fichas(id) on delete cascade;
