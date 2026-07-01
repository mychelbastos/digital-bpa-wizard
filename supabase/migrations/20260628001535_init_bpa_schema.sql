-- BPA v2 — schema inicial
-- Tabelas: estabelecimentos (CNES->nome), historico_procedimentos, historico_cbo
-- Idempotente para poder reaplicar em outra instância (supabase db push / psql).

-- 1) Estabelecimentos: lookup CNES -> nome
create table if not exists public.estabelecimentos (
  cnes text primary key check (cnes ~ '^[0-9]{7}$'),
  nome text not null,
  updated_at timestamptz not null default now()
);

-- 2) Histórico de uso de Procedimentos
create table if not exists public.historico_procedimentos (
  codigo text primary key,
  vezes_usado integer not null default 0,
  ultima_vez_usado timestamptz
);

-- 3) Histórico de uso de CBO
create table if not exists public.historico_cbo (
  codigo text primary key,
  vezes_usado integer not null default 0,
  ultima_vez_usado timestamptz
);

-- Índices p/ autocomplete (prefixo + ordenação por mais usado)
create index if not exists idx_hist_proc_codigo on public.historico_procedimentos (codigo text_pattern_ops);
create index if not exists idx_hist_proc_uso on public.historico_procedimentos (vezes_usado desc);
create index if not exists idx_hist_cbo_codigo on public.historico_cbo (codigo text_pattern_ops);
create index if not exists idx_hist_cbo_uso on public.historico_cbo (vezes_usado desc);

-- RPCs p/ registrar uso (incremento atômico). SECURITY DEFINER: escrita controlada.
create or replace function public.registrar_uso_procedimento(p_codigo text)
returns void language sql security definer set search_path = public as $$
  insert into public.historico_procedimentos (codigo, vezes_usado, ultima_vez_usado)
  values (p_codigo, 1, now())
  on conflict (codigo) do update
    set vezes_usado = public.historico_procedimentos.vezes_usado + 1,
        ultima_vez_usado = now();
$$;

create or replace function public.registrar_uso_cbo(p_codigo text)
returns void language sql security definer set search_path = public as $$
  insert into public.historico_cbo (codigo, vezes_usado, ultima_vez_usado)
  values (p_codigo, 1, now())
  on conflict (codigo) do update
    set vezes_usado = public.historico_cbo.vezes_usado + 1,
        ultima_vez_usado = now();
$$;

-- RLS: habilitado. Por enquanto (sem auth) leitura liberada; escrita do histórico só via RPC.
-- TODO multi-prefeitura: trocar policies por regras baseadas em auth/tenant.
alter table public.estabelecimentos enable row level security;
alter table public.historico_procedimentos enable row level security;
alter table public.historico_cbo enable row level security;

drop policy if exists estab_select on public.estabelecimentos;
create policy estab_select on public.estabelecimentos for select to anon, authenticated using (true);
drop policy if exists histproc_select on public.historico_procedimentos;
create policy histproc_select on public.historico_procedimentos for select to anon, authenticated using (true);
drop policy if exists histcbo_select on public.historico_cbo;
create policy histcbo_select on public.historico_cbo for select to anon, authenticated using (true);

grant execute on function public.registrar_uso_procedimento(text) to anon, authenticated;
grant execute on function public.registrar_uso_cbo(text) to anon, authenticated;
