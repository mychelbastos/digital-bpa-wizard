-- TFD (Tratamento Fora de Domicílio).
--
-- Fluxo: cada paciente que precisa se tratar em outra cidade gera, por competência,
-- ajuda de custo (alimentação, com/sem pernoite) e deslocamento (por 50 km). Isso é
-- FATURADO como BPA-I no SIGTAP (códigos 08.03.01.xxx). O registro do TFD guarda os
-- números do mês (viagens com/sem pernoite, distância da rota, acompanhante) e a camada
-- de aplicação gera a(s) seq(s) da ficha BPA-I via src/lib/tfd/gerar-bpa-tfd.ts.
--
-- Regras de cálculo (CONFIRMADAS): deslocamento/viagem = round((km_ida × 2) ÷ 50);
-- alimentação = 1 por viagem; acompanhante segue a mesma regra sob CNS PRÓPRIO. Ver o
-- gerador para o detalhe e a "regra a validar" do CNS do acompanhante.
--
-- Estruturas:
--   pacientes         — cadastro central de paciente por organização (dedup por CNS)
--   leituras_paciente — log LGPD de leitura de PII do paciente (espelha leituras_ficha)
--   tfd_destinos      — catálogo de rotas por org; a DISTÂNCIA pertence à ROTA, não à cidade
--   tfd               — o registro do TFD do paciente na competência
--   tfd_valores       — valores unitários editáveis por org (vigência à la FPO)
--   fichas.origem     — passa a aceitar 'tfd' (ficha BPA-I gerada a partir de um TFD)
--
-- Permissão única: gerir_tfd (escopo cnes). Como tem_permissao_no_org() reavalia uma
-- permissão cnes por vínculo, ela também gate os catálogos org-wide (destinos/valores/
-- pacientes) por "ter gerir_tfd em qualquer unidade do org".

-- Idempotente: pode reaplicar com segurança.

-- ---------------------------------------------------------------------------
-- 0) Permissão + concessões aos papéis.
-- ---------------------------------------------------------------------------
insert into public.permissoes (codigo, descricao, escopo)
values ('gerir_tfd', 'Registrar e gerir TFD (destinos, valores e pacientes)', 'cnes')
on conflict (codigo) do nothing;

insert into public.papel_permissoes (papel, permissao)
values ('digitador', 'gerir_tfd'),
       ('coordenador', 'gerir_tfd'),
       ('operador_remessa', 'gerir_tfd'),
       ('secretario_municipal', 'gerir_tfd')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1) Cadastro central de pacientes (por organização). PII sensível.
-- ---------------------------------------------------------------------------
create table if not exists public.pacientes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  cns text,                     -- CNS (15 díg.), chave natural quando existe
  cpf text,                     -- CPF (11 díg.), opcional
  nome text not null,
  nome_social text,
  sexo text check (sexo is null or sexo in ('M','F')),
  nascimento date,
  nome_mae text,
  telefone text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cep text,
  municipio_ibge text,
  municipio_nome text,
  uf text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);

-- Dedup dentro da org: um CNS (e um CPF) por paciente.
create unique index if not exists pacientes_org_cns_uidx
  on public.pacientes (organizacao_id, cns) where cns is not null and cns <> '';
create unique index if not exists pacientes_org_cpf_uidx
  on public.pacientes (organizacao_id, cpf) where cpf is not null and cpf <> '';
create index if not exists pacientes_org_nome_idx on public.pacientes (organizacao_id, nome);

alter table public.pacientes enable row level security;

-- VER: qualquer vínculo ativo na organização (dado municipal compartilhado entre unidades).
drop policy if exists pacientes_select on public.pacientes;
create policy pacientes_select on public.pacientes for select to authenticated
using (
  public.is_super_admin() or exists (
    select 1 from public.vinculos v
    where v.user_id = (select auth.uid())
      and v.organizacao_id = pacientes.organizacao_id
      and v.inicio <= current_date
      and (v.fim is null or v.fim >= current_date)
  )
);

-- ESCREVER: quem tem gerir_tfd em alguma unidade da organização.
drop policy if exists pacientes_insert on public.pacientes;
create policy pacientes_insert on public.pacientes for insert to authenticated
with check (public.tem_permissao_no_org(organizacao_id, 'gerir_tfd'));
drop policy if exists pacientes_update on public.pacientes;
create policy pacientes_update on public.pacientes for update to authenticated
using (public.tem_permissao_no_org(organizacao_id, 'gerir_tfd'))
with check (public.tem_permissao_no_org(organizacao_id, 'gerir_tfd'));
-- Sem policy de DELETE: paciente é histórico; desativar via campo se necessário no futuro.

-- ---------------------------------------------------------------------------
-- 2) Log LGPD de leitura de PII do paciente (espelha leituras_ficha).
-- ---------------------------------------------------------------------------
create table if not exists public.leituras_paciente (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  organizacao_id uuid,                          -- denormalizado p/ escopo da RLS
  lida_por uuid not null default auth.uid() references auth.users(id),
  lida_em timestamptz not null default now()
);
create index if not exists leituras_paciente_pac_idx on public.leituras_paciente(paciente_id);
create index if not exists leituras_paciente_por_idx on public.leituras_paciente(lida_por);
create index if not exists leituras_paciente_em_idx on public.leituras_paciente(lida_em);

alter table public.leituras_paciente enable row level security;
-- Ler o log: só quem administra a organização.
drop policy if exists leituras_paciente_select on public.leituras_paciente;
create policy leituras_paciente_select on public.leituras_paciente for select to authenticated
using (public.tem_permissao_no_org(organizacao_id, 'gerenciar_vinculos'));
-- Sem policy de INSERT: só a RPC (security definer) grava.

create or replace function public.registrar_leitura_paciente(_paciente_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare _org uuid;
begin
  if (select auth.uid()) is null then return; end if;
  select organizacao_id into _org from public.pacientes where id = _paciente_id;
  if _org is null then return; end if;         -- paciente inexistente
  insert into public.leituras_paciente(paciente_id, organizacao_id) values (_paciente_id, _org);
end $$;
grant execute on function public.registrar_leitura_paciente(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Catálogo de destinos (rotas) por organização. Auto-alimentável.
--    A DISTÂNCIA (só ida) mora aqui, na ROTA — não na cidade.
-- ---------------------------------------------------------------------------
create table if not exists public.tfd_destinos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  descricao text not null,                 -- ex.: "Salvador — Hosp. Roberto Santos"
  municipio_destino text,
  uf_destino text,
  estabelecimento_destino text,
  distancia_km numeric(7,1) not null default 0 check (distancia_km >= 0), -- só IDA
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);
create unique index if not exists tfd_destinos_org_desc_uidx
  on public.tfd_destinos (organizacao_id, lower(descricao));

alter table public.tfd_destinos enable row level security;
drop policy if exists tfd_destinos_select on public.tfd_destinos;
create policy tfd_destinos_select on public.tfd_destinos for select to authenticated
using (
  public.is_super_admin() or exists (
    select 1 from public.vinculos v
    where v.user_id = (select auth.uid())
      and v.organizacao_id = tfd_destinos.organizacao_id
      and v.inicio <= current_date
      and (v.fim is null or v.fim >= current_date)
  )
);
drop policy if exists tfd_destinos_insert on public.tfd_destinos;
create policy tfd_destinos_insert on public.tfd_destinos for insert to authenticated
with check (public.tem_permissao_no_org(organizacao_id, 'gerir_tfd'));
drop policy if exists tfd_destinos_update on public.tfd_destinos;
create policy tfd_destinos_update on public.tfd_destinos for update to authenticated
using (public.tem_permissao_no_org(organizacao_id, 'gerir_tfd'))
with check (public.tem_permissao_no_org(organizacao_id, 'gerir_tfd'));
drop policy if exists tfd_destinos_delete on public.tfd_destinos;
create policy tfd_destinos_delete on public.tfd_destinos for delete to authenticated
using (public.tem_permissao_no_org(organizacao_id, 'gerir_tfd'));

-- ---------------------------------------------------------------------------
-- 4) O registro do TFD do paciente na competência.
-- ---------------------------------------------------------------------------
create table if not exists public.tfd (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  cnes text not null,                      -- unidade que registra / fatura
  paciente_id uuid not null references public.pacientes(id),
  destino_id uuid references public.tfd_destinos(id),
  distancia_km numeric(7,1) not null default 0 check (distancia_km >= 0), -- snapshot só-ida (copiada do destino)
  competencia text not null check (competencia ~ '^[0-9]{6}$'),
  qtd_com_pernoite integer not null default 0 check (qtd_com_pernoite >= 0),
  qtd_sem_pernoite integer not null default 0 check (qtd_sem_pernoite >= 0),
  tem_acompanhante boolean not null default false,
  acompanhante_nome text,
  acompanhante_cns text,                   -- CNS do PRÓPRIO acompanhante (regra a validar)
  prof_cns text,                           -- profissional responsável (vira header do BPA-I)
  prof_nome text,
  prof_cbo text,                           -- CBO do responsável, capturado no registro
  status text not null default 'agendada'
    check (status in ('agendada','realizada','faturada','cancelada')),
  ficha_id uuid references public.fichas(id),  -- BPA-I gerada quando faturada
  observacoes text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);
create index if not exists tfd_org_comp_idx on public.tfd (organizacao_id, competencia);
create index if not exists tfd_cnes_comp_idx on public.tfd (cnes, competencia);
create index if not exists tfd_paciente_idx on public.tfd (paciente_id);
create index if not exists tfd_status_idx on public.tfd (status);

alter table public.tfd enable row level security;

-- VER: mesma visibilidade das fichas da unidade (com o ramo município).
drop policy if exists tfd_select on public.tfd;
create policy tfd_select on public.tfd for select to authenticated
using (
  public.tem_permissao(cnes, 'ver_fichas_da_unidade')
  or public.tem_permissao_no_org(organizacao_id, 'ver_fichas_do_municipio')
);
-- ESCREVER: gerir_tfd na unidade.
drop policy if exists tfd_insert on public.tfd;
create policy tfd_insert on public.tfd for insert to authenticated
with check (public.tem_permissao(cnes, 'gerir_tfd'));
drop policy if exists tfd_update on public.tfd;
create policy tfd_update on public.tfd for update to authenticated
using (public.tem_permissao(cnes, 'gerir_tfd'))
with check (public.tem_permissao(cnes, 'gerir_tfd'));
drop policy if exists tfd_delete on public.tfd;
create policy tfd_delete on public.tfd for delete to authenticated
using (public.tem_permissao(cnes, 'gerir_tfd'));

-- ---------------------------------------------------------------------------
-- 5) Valores unitários editáveis (por org). Vigência à la FPO: o valor de uma
--    competência X é a linha com competencia <= X mais recente.
-- ---------------------------------------------------------------------------
create table if not exists public.tfd_valores (
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  procedimento text not null,              -- SIGTAP 10 díg. (um dos 6 códigos TFD)
  competencia text not null check (competencia ~ '^[0-9]{6}$'),
  valor_unitario numeric(12,2) not null default 0 check (valor_unitario >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (organizacao_id, procedimento, competencia)
);

alter table public.tfd_valores enable row level security;
drop policy if exists tfd_valores_select on public.tfd_valores;
create policy tfd_valores_select on public.tfd_valores for select to authenticated
using (
  public.is_super_admin() or exists (
    select 1 from public.vinculos v
    where v.user_id = (select auth.uid())
      and v.organizacao_id = tfd_valores.organizacao_id
      and v.inicio <= current_date
      and (v.fim is null or v.fim >= current_date)
  )
);
drop policy if exists tfd_valores_insert on public.tfd_valores;
create policy tfd_valores_insert on public.tfd_valores for insert to authenticated
with check (public.tem_permissao_no_org(organizacao_id, 'gerir_tfd'));
drop policy if exists tfd_valores_update on public.tfd_valores;
create policy tfd_valores_update on public.tfd_valores for update to authenticated
using (public.tem_permissao_no_org(organizacao_id, 'gerir_tfd'))
with check (public.tem_permissao_no_org(organizacao_id, 'gerir_tfd'));
drop policy if exists tfd_valores_delete on public.tfd_valores;
create policy tfd_valores_delete on public.tfd_valores for delete to authenticated
using (public.tem_permissao_no_org(organizacao_id, 'gerir_tfd'));

-- ---------------------------------------------------------------------------
-- 6) fichas.origem passa a aceitar 'tfd'.
-- ---------------------------------------------------------------------------
alter table public.fichas drop constraint if exists fichas_origem_check;
alter table public.fichas
  add constraint fichas_origem_check check (origem in ('digitado','importado','tfd'));
