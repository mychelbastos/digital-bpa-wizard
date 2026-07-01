-- Fichas do BPA-I v2: rascunhos/versões salvas por usuário (Responsável logado).
-- PII de paciente fica isolada por RLS dono-apenas (cada usuário só vê as próprias).
-- Idempotente (pode reaplicar com segurança).

create table if not exists public.fichas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text not null default 'Ficha BPA-I',
  competencia text,
  dados jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.fichas enable row level security;

drop policy if exists fichas_owner_select on public.fichas;
create policy fichas_owner_select on public.fichas
  for select to authenticated using (user_id = auth.uid());

drop policy if exists fichas_owner_insert on public.fichas;
create policy fichas_owner_insert on public.fichas
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists fichas_owner_update on public.fichas;
create policy fichas_owner_update on public.fichas
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists fichas_owner_delete on public.fichas;
create policy fichas_owner_delete on public.fichas
  for delete to authenticated using (user_id = auth.uid());

create index if not exists fichas_user_updated_idx on public.fichas (user_id, updated_at desc);
