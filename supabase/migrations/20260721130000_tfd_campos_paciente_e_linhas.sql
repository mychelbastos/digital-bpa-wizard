-- TFD (complemento): (1) o cadastro de paciente passa a ter os MESMOS campos que o BPA-I
-- coleta do paciente (nacionalidade, raça/cor, etnia, tipo de logradouro, e-mail, situação de
-- rua) — além dos que já tínhamos; (2) os VALORES do TFD passam a ser guardados por paciente,
-- numa linha por procedimento (`tfd_linhas`), snapshot no momento do registro. A soma para o
-- .txt vem dessas linhas; a nível de sistema, o total é mostrado por paciente.

-- Idempotente.

-- ---------------------------------------------------------------------------
-- 1) Campos extra do paciente (paridade com o BPA-I).
-- ---------------------------------------------------------------------------
alter table public.pacientes add column if not exists nacionalidade text;   -- código CADSUS (1 = Brasileiro)
alter table public.pacientes add column if not exists raca_cor text;        -- código raça/cor
alter table public.pacientes add column if not exists etnia text;           -- código de etnia (indígena)
alter table public.pacientes add column if not exists cod_logradouro text;  -- código do tipo de logradouro
alter table public.pacientes add column if not exists email text;
alter table public.pacientes add column if not exists situacao_rua text;    -- 'S' / 'N'

-- ---------------------------------------------------------------------------
-- 2) Linhas de valor por TFD (por paciente). Uma linha por procedimento gerado.
-- ---------------------------------------------------------------------------
create table if not exists public.tfd_linhas (
  id uuid primary key default gen_random_uuid(),
  tfd_id uuid not null references public.tfd(id) on delete cascade,
  codigo text not null,                    -- SIGTAP 10 díg.
  quantidade integer not null default 0 check (quantidade >= 0),
  para text not null default 'paciente' check (para in ('paciente','acompanhante')),
  valor_unitario numeric(12,2) not null default 0 check (valor_unitario >= 0),
  ordem integer not null default 0
);
create index if not exists tfd_linhas_tfd_idx on public.tfd_linhas (tfd_id);

alter table public.tfd_linhas enable row level security;

-- VER: quem pode ver o TFD pai.
drop policy if exists tfd_linhas_select on public.tfd_linhas;
create policy tfd_linhas_select on public.tfd_linhas for select to authenticated
using (exists (
  select 1 from public.tfd t where t.id = tfd_linhas.tfd_id
    and (public.tem_permissao(t.cnes, 'ver_fichas_da_unidade')
      or public.tem_permissao_no_org(t.organizacao_id, 'ver_fichas_do_municipio'))
));

-- ESCREVER: gerir_tfd na unidade do TFD pai.
drop policy if exists tfd_linhas_insert on public.tfd_linhas;
create policy tfd_linhas_insert on public.tfd_linhas for insert to authenticated
with check (exists (select 1 from public.tfd t where t.id = tfd_linhas.tfd_id and public.tem_permissao(t.cnes, 'gerir_tfd')));
drop policy if exists tfd_linhas_update on public.tfd_linhas;
create policy tfd_linhas_update on public.tfd_linhas for update to authenticated
using (exists (select 1 from public.tfd t where t.id = tfd_linhas.tfd_id and public.tem_permissao(t.cnes, 'gerir_tfd')))
with check (exists (select 1 from public.tfd t where t.id = tfd_linhas.tfd_id and public.tem_permissao(t.cnes, 'gerir_tfd')));
drop policy if exists tfd_linhas_delete on public.tfd_linhas;
create policy tfd_linhas_delete on public.tfd_linhas for delete to authenticated
using (exists (select 1 from public.tfd t where t.id = tfd_linhas.tfd_id and public.tem_permissao(t.cnes, 'gerir_tfd')));
