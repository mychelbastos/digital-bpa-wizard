-- Compatibilidade Procedimento x CBO (ocupação) do SIGTAP — usada para CRITICAR o CBO
-- digitado no BPA-C (e futuramente no BPA-I) contra a tabela oficial: se o procedimento
-- tem CBOs cadastrados, só esses são válidos; se não tem nenhum, não critica.
-- Fonte: rl_procedimento_ocupacao (mesmo arquivo TabelaUnificada_AAAAMM.zip do SIGTAP).
--
-- Segue o mesmo padrão das demais tabelas SIGTAP (competência + RLS select público).
create table if not exists public.procedimento_ocupacao (
  procedimento text not null,
  cbo text not null,
  competencia char(6) not null default '202606',
  primary key (procedimento, cbo, competencia)
);
create index if not exists idx_proc_ocupacao_proc on public.procedimento_ocupacao (procedimento, competencia);

alter table public.procedimento_ocupacao enable row level security;
drop policy if exists proc_ocupacao_select on public.procedimento_ocupacao;
create policy proc_ocupacao_select on public.procedimento_ocupacao for select to anon, authenticated using (true);

-- Coluna de controle na tabela de competências (quantas relações de ocupação por comp.).
alter table public.sigtap_competencias
  add column if not exists qtd_relacoes_ocupacao integer;
