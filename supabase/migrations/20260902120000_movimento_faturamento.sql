-- Movimento de faturamento COMPARTILHADO por organização (o "mês de apresentação" em que a
-- produção digitada é lançada). Uma pessoa (o faturista) rege toda a equipe: só quem tem
-- `gerar_producao` (ou super-admin) altera; os demais apenas veem a informação.
-- null = usar o mês do calendário.
alter table public.organizacoes add column if not exists movimento_faturamento text;

-- Leitura: movimento da organização do usuário (mesmo padrão de org_logo_do_usuario).
create or replace function public.movimento_faturamento_atual()
returns text
language sql stable security definer set search_path to 'public'
as $function$
  select o.movimento_faturamento
  from public.organizacoes o
  where o.id = (
    select v.organizacao_id from public.vinculos v
    where v.user_id = (select auth.uid())
      and v.inicio <= current_date and (v.fim is null or v.fim >= current_date)
    limit 1
  )
$function$;

-- Escrita: só o FATURISTA (gerar_producao em alguma unidade visível) OU super-admin.
create or replace function public.definir_movimento_faturamento(_mes text)
returns text
language plpgsql security definer set search_path to 'public'
as $function$
declare _org uuid;
begin
  if _mes is null or _mes !~ '^[0-9]{6}$' then
    raise exception 'Mês de faturamento inválido (esperado AAAAMM).';
  end if;
  if not (public.is_super_admin() or exists (select 1 from public.cnes_com_permissao('gerar_producao'))) then
    raise exception 'Sem permissão para alterar o mês de faturamento (apenas o faturista).';
  end if;
  select v.organizacao_id into _org
  from public.vinculos v
  where v.user_id = (select auth.uid())
    and v.inicio <= current_date and (v.fim is null or v.fim >= current_date)
  limit 1;
  if _org is null then
    raise exception 'Usuário sem organização ativa.';
  end if;
  update public.organizacoes set movimento_faturamento = _mes where id = _org;
  return _mes;
end;
$function$;

grant execute on function public.movimento_faturamento_atual() to authenticated;
grant execute on function public.definir_movimento_faturamento(text) to authenticated;
