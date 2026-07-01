-- Cache de profissionais por estabelecimento (alimentado pela Edge Function via CNES SOAP API).
-- Escrita só pela Edge Function (service_role, bypassa RLS). Leitura pública (autocomplete).
create table if not exists public.profissionais (
  cnes text not null check (cnes ~ '^[0-9]{7}$'),
  cns text not null,
  nome text not null,
  cpf text,
  atualizado_em timestamptz not null default now(),
  primary key (cnes, cns)
);
create index if not exists idx_prof_cnes on public.profissionais (cnes);
create index if not exists idx_prof_nome on public.profissionais (cnes, nome text_pattern_ops);

alter table public.profissionais enable row level security;
drop policy if exists prof_select on public.profissionais;
create policy prof_select on public.profissionais for select to anon, authenticated using (true);
