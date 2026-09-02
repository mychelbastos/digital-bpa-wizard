-- Regra do digitador revista (02/09/2026): um digitador tem UMA unidade BASE (de cadastro,
-- guardada em user_metadata.cnes_base na criação da conta), mas PODE digitar em VÁRIAS
-- unidades — ou seja, pode ter vínculo de digitador em mais de um CNES. Removemos a trava
-- "um digitador atua em uma só unidade" do admin_vincular_unidade. A checagem de vínculo
-- duplicado NO MESMO CNES permanece.
create or replace function public.admin_vincular_unidade(_user_id uuid, _org uuid, _cnes text, _papel text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para gerenciar vínculos nesta organização' using errcode = 'insufficient_privilege';
  end if;
  if public.is_super_admin_user(_user_id) and not public.is_super_admin() then
    raise exception 'Conta do dono do sistema — protegida.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.estabelecimentos e where e.cnes = _cnes and e.organizacao_id = _org) then
    raise exception 'CNES % não pertence a esta organização', _cnes;
  end if;
  if not exists (select 1 from public.papel_permissoes where papel = _papel) then
    raise exception 'Cargo % inexistente', _papel;
  end if;
  if exists (
    select 1 from public.vinculos v
    where v.user_id = _user_id and v.organizacao_id = _org and v.cnes = _cnes
      and v.inicio <= current_date and (v.fim is null or v.fim >= current_date)
  ) then
    raise exception 'A pessoa já tem um vínculo ativo neste CNES';
  end if;
  -- (removida a trava de digitador em uma só unidade — pode digitar em várias)
  insert into public.vinculos (user_id, organizacao_id, cnes, papel, concedido_por)
    values (_user_id, _org, _cnes, _papel, (select auth.uid()));
end $function$;
