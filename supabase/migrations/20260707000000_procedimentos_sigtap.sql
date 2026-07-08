-- Tabela oficial de procedimentos do SIGTAP (Sistema de Gerenciamento da Tabela de
-- Procedimentos, Medicamentos e OPM do SUS) — usada para VALIDAR o Código do
-- Procedimento digitado no BPA-I v2 contra a tabela real (não confundir com
-- `historico_procedimentos`, que é só o contador de "mais usados" por esta equipe).
-- Fonte: ftp://ftp2.datasus.gov.br/pub/sistemas/tup/downloads/ (arquivo TabelaUnificada_AAAAMM.zip)
create table if not exists public.procedimentos_sigtap (
  codigo text primary key check (codigo ~ '^[0-9]{10}$'),
  nome text not null,
  sexo text check (sexo in ('M', 'F', 'I', 'N')), -- M/F/I(ndiferente)/N(ão se aplica)
  updated_at timestamptz not null default now()
);

create index if not exists idx_proc_sigtap_nome on public.procedimentos_sigtap using gin (to_tsvector('portuguese', nome));

alter table public.procedimentos_sigtap enable row level security;

drop policy if exists proc_sigtap_select on public.procedimentos_sigtap;
create policy proc_sigtap_select on public.procedimentos_sigtap for select to anon, authenticated using (true);
