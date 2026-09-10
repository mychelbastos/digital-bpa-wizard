-- Serviços especializados CADASTRADOS no CNES de cada estabelecimento (serviço × classificação).
-- Cache no nosso banco (como `profissionais`): sincronizado do SCNES e usado para FILTRAR as
-- combinações Serviço×Classificação do SIGTAP na digitação do BPA-I — funciona mesmo quando a
-- API do SCNES está fora (lê do cache). Escrito só pela edge function (service role).

create table if not exists public.estabelecimento_servicos (
  cnes text not null,
  servico text not null,            -- 3 díg. (código do serviço)
  classificacao text not null,      -- 3 díg. (código da classificação)
  servico_nome text,
  classificacao_nome text,
  ambiente text,                    -- homolog | producao (proveniência do SCNES)
  atualizado_em timestamptz not null default now(),
  primary key (cnes, servico, classificacao)
);

alter table public.estabelecimento_servicos enable row level security;

-- Leitura: usuário com vínculo ativo na organização daquele CNES (mesmo critério de `profissionais`).
create policy estab_servicos_select on public.estabelecimento_servicos
  for select to anon, authenticated
  using (exists (
    select 1 from public.estabelecimentos e
    join public.vinculos v on v.organizacao_id = e.organizacao_id
    where e.cnes = estabelecimento_servicos.cnes
      and v.user_id = (select auth.uid())
      and (v.fim is null or v.fim >= current_date)
  ));

create index if not exists estab_servicos_cnes_idx on public.estabelecimento_servicos (cnes);
