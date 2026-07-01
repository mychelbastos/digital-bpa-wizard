-- Auditoria da confirmação eletrônica do Responsável pelo Estabelecimento (BPA-I v2).
-- Cada linha = uma confirmação explícita por uma pessoa logada, com rastreabilidade
-- (quem, CNS, CNES, quando, se passou na validação do CNES, e um hash+snapshot da ficha).
create table if not exists public.confirmacoes_responsavel (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  cns text,
  cnes text,
  validado_cnes boolean not null default false,
  confirmado_em timestamptz not null default now(),
  ficha_hash text,
  ficha_snapshot jsonb
);
create index if not exists idx_confresp_user on public.confirmacoes_responsavel (user_id, confirmado_em desc);
alter table public.confirmacoes_responsavel enable row level security;
drop policy if exists confresp_ins on public.confirmacoes_responsavel;
create policy confresp_ins on public.confirmacoes_responsavel
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists confresp_sel on public.confirmacoes_responsavel;
create policy confresp_sel on public.confirmacoes_responsavel
  for select to authenticated using (auth.uid() = user_id);
