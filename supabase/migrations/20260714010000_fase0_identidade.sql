-- ============================================================================
-- FASE 0 — Fundação de identidade, vínculos e permissões
-- Aditiva: cria o modelo novo e faz backfill. NÃO altera o comportamento do app
-- (nenhuma RLS existente passa a usar isto ainda; a virada é a Fase 1).
--
-- Princípio (doc de arquitetura, seções 2 e 4.1): acesso NÃO deriva de "tipo de
-- conta". Deriva de VÍNCULOS (pessoa ↔ CNES ↔ papel ↔ vigência) e de PERMISSÕES
-- (o que pode fazer naquele CNES). O papel é só um pacote pré-montado de permissões.
-- ============================================================================

-- ---------- Organização (prefeitura = fronteira de isolamento / tenant) ----------
create table if not exists public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  municipio_ibge text,
  uf text,
  criado_em timestamptz not null default now()
);

-- ---------- Gestão (mandato ~4 anos; a ficha é ligada pela COMPETÊNCIA) ----------
create table if not exists public.gestoes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id),
  nome text not null,
  inicio date not null,
  fim date,
  criado_em timestamptz not null default now()
);

-- ---------- Estabelecimento ganha o dono (organização) ----------
alter table public.estabelecimentos
  add column if not exists organizacao_id uuid references public.organizacoes(id);

-- ---------- Catálogo de permissões (extensível: é dado, não enum no código) ----------
create table if not exists public.permissoes (
  codigo text primary key,
  descricao text not null
);

-- ---------- Pacote padrão de cada papel (configurável, não hardcoded) ----------
create table if not exists public.papel_permissoes (
  papel text not null,
  permissao text not null references public.permissoes(codigo),
  primary key (papel, permissao)
);

-- ---------- Vínculo: ONDE a pessoa atua (CNES) e com que papel, com vigência ----------
create table if not exists public.vinculos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id),
  cnes text not null references public.estabelecimentos(cnes),
  papel text not null,
  inicio date not null default current_date,
  fim date,                                   -- null = ativo; nunca se deleta, só encerra
  concedido_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
create index if not exists vinculos_user_idx on public.vinculos (user_id) where fim is null;
create index if not exists vinculos_cnes_idx on public.vinculos (cnes) where fim is null;
-- Regra de negócio no BANCO (doc 4.4): digitador tem no máximo 1 CNES ativo.
create unique index if not exists vinculos_um_digitador_ativo
  on public.vinculos (user_id) where papel = 'digitador' and fim is null;

-- ---------- Override de permissão POR VÍNCULO (sobrepõe o pacote do papel) ----------
-- Ex.: quem opera o BPA Magnético entra de férias -> concede gerar_producao ao
-- vínculo de outra pessoa com data 'ate'; expira sozinha. Tudo auditado.
create table if not exists public.vinculo_permissoes (
  id uuid primary key default gen_random_uuid(),
  vinculo_id uuid not null references public.vinculos(id) on delete cascade,
  permissao text not null references public.permissoes(codigo),
  concedida boolean not null default true,    -- true = concede; false = revoga do pacote
  concedido_por uuid references auth.users(id),
  concedido_em timestamptz not null default now(),
  ate date,                                    -- null = sem expiração
  motivo text
);

-- ============================================================================
-- Funções-base de autorização (SECURITY DEFINER). Toda RLS futura pergunta a elas.
-- Nunca se pergunta "qual o papel?"; pergunta-se "tem a permissão X neste CNES?".
-- ============================================================================

-- CNES em que o usuário atual tem vínculo ativo.
create or replace function public.cnes_visiveis()
  returns table(cnes text)
  language sql stable security definer set search_path = public as $$
  select v.cnes from public.vinculos v
  where v.user_id = (select auth.uid())
    and v.inicio <= current_date
    and (v.fim is null or v.fim >= current_date)
$$;

-- O usuário atual tem a permissão _perm no _cnes? (pacote do papel ∪ overrides − revogações)
create or replace function public.tem_permissao(_cnes text, _perm text)
  returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vinculos v
    where v.user_id = (select auth.uid())
      and v.cnes = _cnes
      and v.inicio <= current_date
      and (v.fim is null or v.fim >= current_date)
      and not exists (
        select 1 from public.vinculo_permissoes vp
        where vp.vinculo_id = v.id and vp.permissao = _perm
          and vp.concedida = false and (vp.ate is null or vp.ate >= current_date)
      )
      and (
        exists (select 1 from public.papel_permissoes pp where pp.papel = v.papel and pp.permissao = _perm)
        or exists (
          select 1 from public.vinculo_permissoes vp
          where vp.vinculo_id = v.id and vp.permissao = _perm
            and vp.concedida = true and (vp.ate is null or vp.ate >= current_date)
        )
      )
  )
$$;

-- ============================================================================
-- RLS das tabelas novas (mínima; o app ainda não as lê — Fase 1/6 refina).
-- As funções acima são SECURITY DEFINER e não dependem destas policies.
-- ============================================================================
alter table public.organizacoes enable row level security;
alter table public.gestoes enable row level security;
alter table public.permissoes enable row level security;
alter table public.papel_permissoes enable row level security;
alter table public.vinculos enable row level security;
alter table public.vinculo_permissoes enable row level security;

-- Catálogo de permissões/pacotes: leitura autenticada (é referência).
create policy permissoes_read on public.permissoes for select using (auth.uid() is not null);
create policy papel_perm_read on public.papel_permissoes for select using (auth.uid() is not null);
-- Organização/gestão: leitura se o usuário tem vínculo ativo na organização.
create policy org_read on public.organizacoes for select using (
  exists (select 1 from public.vinculos v where v.user_id = (select auth.uid())
          and v.organizacao_id = organizacoes.id and (v.fim is null or v.fim >= current_date))
);
create policy gestao_read on public.gestoes for select using (
  exists (select 1 from public.vinculos v where v.user_id = (select auth.uid())
          and v.organizacao_id = gestoes.organizacao_id and (v.fim is null or v.fim >= current_date))
);
-- Vínculos e overrides: a pessoa vê os próprios.
create policy vinculos_own_read on public.vinculos for select using (user_id = (select auth.uid()));
create policy vinc_perm_own_read on public.vinculo_permissoes for select using (
  exists (select 1 from public.vinculos v where v.id = vinculo_permissoes.vinculo_id and v.user_id = (select auth.uid()))
);

-- ============================================================================
-- Autoria da ficha sobrevive à conta (doc 4.2): a produção não some com o usuário.
-- ============================================================================
alter table public.fichas drop constraint if exists fichas_user_id_fkey;
alter table public.fichas add constraint fichas_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- ============================================================================
-- SEEDS
-- ============================================================================
-- Permissões (lista inicial da seção 4.1; extensível).
insert into public.permissoes (codigo, descricao) values
  ('criar_ficha', 'Criar ficha'),
  ('editar_ficha_propria', 'Editar a própria ficha (em rascunho)'),
  ('conferir_ficha', 'Conferir/assinar ficha'),
  ('ver_fichas_da_unidade', 'Ver as fichas de todos os digitadores do CNES'),
  ('gerar_producao', 'Fechar a produção e gerar o .txt'),
  ('reabrir_producao', 'Reabrir uma produção exportada (não transmitida)'),
  ('retificar_ficha_exportada', 'Retificar ficha já exportada (nova versão)'),
  ('gerenciar_vinculos', 'Criar usuários e conceder acessos na organização')
on conflict (codigo) do nothing;

-- Pacotes padrão (tabela da seção 4.1).
insert into public.papel_permissoes (papel, permissao) values
  ('digitador', 'criar_ficha'),
  ('digitador', 'editar_ficha_propria'),
  ('digitador', 'conferir_ficha'),
  ('coordenador', 'ver_fichas_da_unidade'),
  ('operador_remessa', 'ver_fichas_da_unidade'),
  ('operador_remessa', 'gerar_producao'),
  ('operador_remessa', 'reabrir_producao'),
  ('operador_remessa', 'retificar_ficha_exportada'),
  ('admin_org', 'gerenciar_vinculos')
on conflict do nothing;

-- Organização FMSRB (Ruy Barbosa/BA, IBGE 2927200) e seus estabelecimentos.
insert into public.organizacoes (nome, municipio_ibge, uf)
  select 'FMSRB — Ruy Barbosa/BA', '2927200', 'BA'
  where not exists (select 1 from public.organizacoes where municipio_ibge = '2927200');

update public.estabelecimentos
  set organizacao_id = (select id from public.organizacoes where municipio_ibge = '2927200')
  where organizacao_id is null;

-- Gestão vigente (ASSUNÇÃO: mandato 2025–2028 — ajustar se necessário).
insert into public.gestoes (organizacao_id, nome, inicio, fim)
  select o.id, '2025–2028', date '2025-01-01', date '2028-12-31'
  from public.organizacoes o where o.municipio_ibge = '2927200'
    and not exists (select 1 from public.gestoes g where g.organizacao_id = o.id);

-- Vínculos dos 2 usuários atuais (provisionamento por SQL, seção 12.2).
-- Carlos (teste@bpa.com.br) = Conta Master: operador_remessa em TODOS os 7 CNES
-- (vê tudo + gera/reabre/retifica) + override gerenciar_vinculos em cada.
insert into public.vinculos (user_id, organizacao_id, cnes, papel)
  select u.id, o.id, e.cnes, 'operador_remessa'
  from auth.users u
  cross join public.estabelecimentos e
  join public.organizacoes o on o.id = e.organizacao_id
  where u.email = 'teste@bpa.com.br'
    and not exists (select 1 from public.vinculos v where v.user_id = u.id and v.cnes = e.cnes);

insert into public.vinculo_permissoes (vinculo_id, permissao)
  select v.id, 'gerenciar_vinculos'
  from public.vinculos v
  join auth.users u on u.id = v.user_id
  where u.email = 'teste@bpa.com.br'
    and not exists (select 1 from public.vinculo_permissoes vp where vp.vinculo_id = v.id and vp.permissao = 'gerenciar_vinculos');

-- Geraldo (geraldo@bpateste.com) = digitador no CNES 2510332 (ASSUNÇÃO — ajustar).
insert into public.vinculos (user_id, organizacao_id, cnes, papel)
  select u.id, o.id, '2510332', 'digitador'
  from auth.users u
  join public.estabelecimentos e on e.cnes = '2510332'
  join public.organizacoes o on o.id = e.organizacao_id
  where u.email = 'geraldo@bpateste.com'
    and not exists (select 1 from public.vinculos v where v.user_id = u.id and v.cnes = '2510332');
