-- Amplia procedimentos_sigtap com as regras de idade/sexo/quantidade e adiciona as
-- relações de compatibilidade Serviço+Classificação e CID (fonte: mesmo arquivo
-- oficial do SIGTAP). Junto com o BPA-I v2, permite cruzar TUDO que a ficha preenche
-- (procedimento, quantidade, idade do paciente, sexo, serviço, classificação, CID)
-- contra a tabela real, não só conferir se o código existe.
--
-- `competencia` (AAAAMM) entra desde já em todas as tabelas — mesmo com só uma
-- competência carregada hoje, isso permite manter várias competências lado a lado
-- (rotação de 4 meses) sem precisar reestruturar o schema depois.

alter table public.procedimentos_sigtap
  add column if not exists competencia char(6) not null default '202606',
  add column if not exists qt_maxima_execucao integer,     -- 9999 = sem limite
  add column if not exists idade_minima_meses integer,     -- 9999 = não se aplica
  add column if not exists idade_maxima_meses integer;     -- 9999 = não se aplica

-- PK vira composta (codigo, competencia) — mesmo código pode existir em várias
-- competências carregadas ao mesmo tempo.
alter table public.procedimentos_sigtap drop constraint if exists procedimentos_sigtap_pkey;
alter table public.procedimentos_sigtap add primary key (codigo, competencia);

create index if not exists idx_proc_sigtap_codigo on public.procedimentos_sigtap (codigo);

-- Combinações válidas de Serviço + Classificação por procedimento.
create table if not exists public.procedimento_servico (
  procedimento text not null,
  servico text not null,
  classificacao text not null,
  competencia char(6) not null default '202606',
  primary key (procedimento, servico, classificacao, competencia)
);
create index if not exists idx_proc_servico_proc on public.procedimento_servico (procedimento, competencia);

-- CIDs válidos por procedimento (ST_PRINCIPAL indica se é o CID principal esperado).
create table if not exists public.procedimento_cid (
  procedimento text not null,
  cid text not null,
  principal boolean not null default false,
  competencia char(6) not null default '202606',
  primary key (procedimento, cid, competencia)
);
create index if not exists idx_proc_cid_proc on public.procedimento_cid (procedimento, competencia);

alter table public.procedimento_servico enable row level security;
alter table public.procedimento_cid enable row level security;

drop policy if exists proc_servico_select on public.procedimento_servico;
create policy proc_servico_select on public.procedimento_servico for select to anon, authenticated using (true);
drop policy if exists proc_cid_select on public.procedimento_cid;
create policy proc_cid_select on public.procedimento_cid for select to anon, authenticated using (true);

-- Controle de quais competências estão carregadas (base para a rotação de 4 meses).
create table if not exists public.sigtap_competencias (
  competencia char(6) primary key,
  importado_em timestamptz not null default now(),
  qtd_procedimentos integer,
  qtd_relacoes_servico integer,
  qtd_relacoes_cid integer
);
alter table public.sigtap_competencias enable row level security;
drop policy if exists sigtap_comp_select on public.sigtap_competencias;
create policy sigtap_comp_select on public.sigtap_competencias for select to anon, authenticated using (true);

insert into public.sigtap_competencias (competencia, qtd_procedimentos, qtd_relacoes_servico, qtd_relacoes_cid)
values ('202606', 4994, 4116, 81867)
on conflict (competencia) do update set
  qtd_procedimentos = excluded.qtd_procedimentos,
  qtd_relacoes_servico = excluded.qtd_relacoes_servico,
  qtd_relacoes_cid = excluded.qtd_relacoes_cid;
