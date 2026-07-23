-- Exclusão de paciente = SOFT-DELETE com MOTIVO OBRIGATÓRIO, registrado em log de auditoria.
-- (Não apagamos de verdade: o paciente pode estar referenciado por TFDs/fichas.)
alter table public.pacientes add column if not exists excluido_em timestamptz;
alter table public.pacientes add column if not exists motivo_exclusao text;
alter table public.pacientes add column if not exists excluido_por uuid;

-- Log de exclusões (auditoria). Só administradores da org leem; só a RPC grava.
create table if not exists public.pacientes_exclusoes (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id),
  organizacao_id uuid,
  motivo text not null,
  excluido_por uuid not null default auth.uid(),
  excluido_em timestamptz not null default now()
);
alter table public.pacientes_exclusoes enable row level security;
drop policy if exists pacientes_exclusoes_select on public.pacientes_exclusoes;
create policy pacientes_exclusoes_select on public.pacientes_exclusoes for select to authenticated
using (public.tem_permissao_no_org(organizacao_id, 'gerenciar_vinculos'));

-- RPC: exige motivo, checa gerir_tfd na org, marca o soft-delete e loga. false = negado/inválido.
create or replace function public.excluir_paciente(_id uuid, _motivo text)
returns boolean language plpgsql security definer set search_path = public as $$
declare _org uuid;
begin
  if coalesce(trim(_motivo), '') = '' then return false; end if;
  select organizacao_id into _org from public.pacientes where id = _id and excluido_em is null;
  if _org is null then return false; end if;
  if not public.tem_permissao_no_org(_org, 'gerir_tfd') then return false; end if;
  update public.pacientes set excluido_em = now(), motivo_exclusao = _motivo, excluido_por = (select auth.uid()) where id = _id;
  insert into public.pacientes_exclusoes(paciente_id, organizacao_id, motivo) values (_id, _org, _motivo);
  return true;
end $$;
grant execute on function public.excluir_paciente(uuid, text) to authenticated;
