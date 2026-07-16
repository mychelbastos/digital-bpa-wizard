-- Tabela de NOME das ocupações (CBO) do SIGTAP — faltava (importávamos só a RELAÇÃO
-- procedimento↔CBO em `procedimento_ocupacao`, sem descrição). Fonte: tb_ocupacao.txt da
-- TabelaUnificada do SIGTAP (mesma origem/competência já usada: DATASUS TUP). Usada no
-- dashboard para mostrar a DESCRIÇÃO da ocupação no ranking por profissional (fichas sem
-- nome) — mesmo espírito dos popovers de Procedimento/Serviço/CID.
create table if not exists public.ocupacoes_sigtap (
  codigo text primary key,
  nome text not null,
  updated_at timestamptz not null default now()
);
create index if not exists idx_ocupacoes_sigtap_nome on public.ocupacoes_sigtap using gin (to_tsvector('portuguese', nome));

alter table public.ocupacoes_sigtap enable row level security;
drop policy if exists ocupacoes_sigtap_select on public.ocupacoes_sigtap;
create policy ocupacoes_sigtap_select on public.ocupacoes_sigtap for select to anon, authenticated using (true);
