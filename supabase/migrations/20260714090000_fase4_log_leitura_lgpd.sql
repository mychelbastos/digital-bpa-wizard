-- FASE 4 — LGPD: log de leitura de PII do paciente (BPA-I).
--
-- O BPA-I carrega dado pessoal sensível (nome, CNS/CPF, endereço). Toda vez que uma
-- ficha BPA-I é ABERTA (o conteúdo com PII é exibido), registramos quem leu e quando.
-- Insert só pela RPC (security definer); o log é lido apenas por quem administra a
-- organização (permissão 'gerenciar_vinculos'). O BPA-C é consolidado (sem PII de
-- paciente), então não é logado.

create table if not exists public.leituras_ficha (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.fichas(id),
  cnes text,                                   -- denormalizado p/ escopo da RLS
  lida_por uuid not null default auth.uid() references auth.users(id),
  lida_em timestamptz not null default now()
);
create index if not exists leituras_ficha_ficha_idx on public.leituras_ficha(ficha_id);
create index if not exists leituras_ficha_lida_por_idx on public.leituras_ficha(lida_por);
create index if not exists leituras_ficha_lida_em_idx on public.leituras_ficha(lida_em);

alter table public.leituras_ficha enable row level security;
-- Ler o log: só quem administra a organização dona do CNES da ficha.
drop policy if exists leituras_select on public.leituras_ficha;
create policy leituras_select on public.leituras_ficha for select using (
  exists (
    select 1 from public.estabelecimentos e
    where e.cnes = leituras_ficha.cnes
      and public.tem_permissao_no_org(e.organizacao_id, 'gerenciar_vinculos')
  )
);
-- Sem policy de INSERT: só a RPC (security definer) grava.

-- RPC chamada pelo cliente ao ABRIR uma ficha BPA-I. Idempotência não é desejada — cada
-- abertura é um acesso a PII e deve virar uma linha. Silenciosa (não falha a tela).
create or replace function public.registrar_leitura_ficha(_ficha_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare _tipo text; _cnes text;
begin
  if (select auth.uid()) is null then return; end if;
  select tipo, cnes into _tipo, _cnes from public.fichas where id = _ficha_id;
  if _tipo is null then return; end if;      -- ficha inexistente
  if _tipo <> 'BPA-I' then return; end if;   -- só BPA-I tem PII de paciente
  insert into public.leituras_ficha(ficha_id, cnes) values (_ficha_id, _cnes);
end $$;
grant execute on function public.registrar_leitura_ficha(uuid) to authenticated;
