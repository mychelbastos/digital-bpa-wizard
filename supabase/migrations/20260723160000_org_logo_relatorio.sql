-- Logo/timbre da organização para o cabeçalho dos relatórios (PDF). Data URI (base64 PNG).
alter table public.organizacoes add column if not exists logo_relatorio text;

-- RPC: logo da org do usuário logado (para os relatórios buscarem sem expor toda a tabela).
create or replace function public.org_logo_do_usuario()
returns text language sql stable security definer set search_path = public as $$
  select o.logo_relatorio
  from public.organizacoes o
  where o.id = (
    select v.organizacao_id from public.vinculos v
    where v.user_id = (select auth.uid())
      and v.inicio <= current_date and (v.fim is null or v.fim >= current_date)
    limit 1
  )
$$;
grant execute on function public.org_logo_do_usuario() to authenticated;
