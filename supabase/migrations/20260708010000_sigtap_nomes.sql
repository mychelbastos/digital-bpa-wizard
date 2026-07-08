-- Tabelas de NOME (não só validade) do SIGTAP — usadas pra mostrar um popover com o
-- nome/descrição ao clicar em Serviço, Classificação e CID (mesmo espírito do popover
-- que já existe no Código do Procedimento). Mesma fonte/competência já importada.
create table if not exists public.servicos_sigtap (
  codigo text primary key,
  nome text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.servico_classificacao_sigtap (
  servico text not null,
  classificacao text not null,
  nome text not null,
  updated_at timestamptz not null default now(),
  primary key (servico, classificacao)
);

create table if not exists public.cid_sigtap (
  codigo text primary key,
  nome text not null,
  sexo text check (sexo in ('M', 'F', 'I', 'N')),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cid_sigtap_nome on public.cid_sigtap using gin (to_tsvector('portuguese', nome));

alter table public.servicos_sigtap enable row level security;
alter table public.servico_classificacao_sigtap enable row level security;
alter table public.cid_sigtap enable row level security;

drop policy if exists servicos_select on public.servicos_sigtap;
create policy servicos_select on public.servicos_sigtap for select to anon, authenticated using (true);
drop policy if exists servico_classificacao_select on public.servico_classificacao_sigtap;
create policy servico_classificacao_select on public.servico_classificacao_sigtap for select to anon, authenticated using (true);
drop policy if exists cid_sigtap_select on public.cid_sigtap;
create policy cid_sigtap_select on public.cid_sigtap for select to anon, authenticated using (true);
