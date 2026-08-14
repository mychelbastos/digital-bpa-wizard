-- Regra de exclusão de paciente (soft-delete): em caso de ÓBITO, qualquer usuário com a
-- permissão gerir_tfd no org do paciente pode excluir. Para QUALQUER OUTRO motivo, só o
-- master (super-admin). O motivo continua obrigatório e é registrado no log de auditoria.
--
-- O front envia o motivo com um TOKEN estável no início ("OBITO — ...", "TRANSFERENCIA — ...",
-- etc.), sem depender de acento, então a detecção de óbito é feita por prefixo.
create or replace function public.excluir_paciente(_id uuid, _motivo text)
returns boolean language plpgsql security definer set search_path = public as $$
declare _org uuid; _eh_obito boolean;
begin
  if coalesce(trim(_motivo), '') = '' then return false; end if;
  select organizacao_id into _org from public.pacientes where id = _id and excluido_em is null;
  if _org is null then return false; end if;

  -- Óbito? (aceita com/sem acento no começo do motivo).
  _eh_obito := upper(_motivo) like 'OBITO%' or upper(_motivo) like 'ÓBITO%';

  if _eh_obito then
    -- Morte: qualquer um com permissão de gerir pacientes/TFD no org exclui.
    if not public.tem_permissao_no_org(_org, 'gerir_tfd') then return false; end if;
  else
    -- Demais motivos: só o master (super-admin).
    if not public.is_super_admin() then return false; end if;
  end if;

  update public.pacientes set excluido_em = now(), motivo_exclusao = _motivo, excluido_por = (select auth.uid()) where id = _id;
  insert into public.pacientes_exclusoes(paciente_id, organizacao_id, motivo) values (_id, _org, _motivo);
  return true;
end $$;

grant execute on function public.excluir_paciente(uuid, text) to authenticated;
