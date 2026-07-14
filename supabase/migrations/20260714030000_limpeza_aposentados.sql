-- Limpeza dos objetos aposentados pela Fase 1.
-- Aprovação do usuário: DROP em dashboard_profile() e dashboard_user_profiles.
-- producao_bpa NÃO é dropada (é tabela de dados; princípio "dados não se apagam",
-- doc seção 8): fica aposentada, renomeada, sem acesso e datada.

-- dashboard_profile() era usada só pela RLS da producao_bpa (agora aposentada).
drop policy if exists producao_select_dashboard on public.producao_bpa;
drop policy if exists producao_insert_own on public.producao_bpa;
drop policy if exists producao_update_own on public.producao_bpa;

drop function if exists public.dashboard_profile();
drop table if exists public.dashboard_user_profiles;

-- producao_bpa -> _deprecated_producao_bpa: aposentada, sem acesso de nenhum role.
alter table if exists public.producao_bpa rename to _deprecated_producao_bpa;
revoke all on table public._deprecated_producao_bpa from anon, authenticated;
comment on table public._deprecated_producao_bpa is
  'APOSENTADA em 2026-07-14 (Fase 1). Substituída pela view producao_dashboard sobre fichas. Sem uso pelo app; mantida por precaução (dados não se apagam). Reavaliar drop após uma competência inteira, com dump antes.';
