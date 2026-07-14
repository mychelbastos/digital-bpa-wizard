-- Cadastrar/atualizar um estabelecimento (CNES) numa prefeitura pelo painel (fallback
-- enquanto não importamos a base pública do CNES por município). Gated por gerenciar_vinculos
-- na org (super-admin passa). Um CNES pertence a UMA prefeitura (PK global).
create or replace function public.admin_adicionar_estabelecimento(_org uuid, _cnes text, _nome text)
  returns void language plpgsql security definer set search_path = public as $$
declare _dono uuid;
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para administrar esta organização' using errcode = 'insufficient_privilege';
  end if;
  if _cnes !~ '^[0-9]{7}$' then raise exception 'CNES inválido (7 dígitos)'; end if;
  select organizacao_id into _dono from public.estabelecimentos where cnes = _cnes;
  if _dono is not null and _dono <> _org then
    raise exception 'CNES % já pertence a outra prefeitura', _cnes;
  end if;
  insert into public.estabelecimentos (cnes, nome, organizacao_id, updated_at)
    values (_cnes, coalesce(nullif(btrim(_nome), ''), 'CNES ' || _cnes), _org, now())
  on conflict (cnes) do update set nome = excluded.nome, organizacao_id = excluded.organizacao_id, updated_at = now();
end $$;

grant execute on function public.admin_adicionar_estabelecimento(uuid, text, text) to authenticated;
