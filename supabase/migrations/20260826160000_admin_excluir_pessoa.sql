-- Exclui uma PESSOA da organização: remove TODOS os vínculos dela (e os overrides de
-- permissão), revogando todo o acesso. A conta de login (auth.users) não é apagada daqui
-- (isso exige a API de admin do Supabase), mas sem vínculos a pessoa não acessa nada e some
-- da lista de administração. Só quem tem 'gerenciar_vinculos' na org; não exclui super-admin
-- (a menos que o próprio caller seja super-admin) nem a si mesmo.
create or replace function public.admin_excluir_pessoa(_user uuid, _org uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para gerenciar vínculos nesta organização.';
  end if;
  if _user = (select auth.uid()) then
    raise exception 'Você não pode excluir a si mesmo.';
  end if;
  if public.is_super_admin_user(_user) and not public.is_super_admin() then
    raise exception 'Não é possível excluir um super-admin.';
  end if;
  delete from public.vinculo_permissoes vp
    using public.vinculos v
    where vp.vinculo_id = v.id and v.user_id = _user and v.organizacao_id = _org;
  delete from public.vinculos v where v.user_id = _user and v.organizacao_id = _org;
end;
$$;

grant execute on function public.admin_excluir_pessoa(uuid, uuid) to authenticated;
