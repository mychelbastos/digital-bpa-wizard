-- Nome do arquivo do BPA Magnético = PA<municipio_ibge6>.<MMM> (ex.: PA292720.JUL) — mesmo
-- padrão dos .MAR/.JUN que importamos. Para isso o config da org precisa expor o município.
drop function if exists public.org_config_do_usuario();
create function public.org_config_do_usuario()
returns table(org_id uuid, nome text, cab_orgao_origem text, cab_sigla text, cab_cgc_cpf text, cab_orgao_destino text, cab_destino_tipo text, cab_versao text, municipio_ibge text)
language sql stable security definer set search_path to 'public'
as $function$
  select distinct o.id, o.nome,
    o.cab_orgao_origem, o.cab_sigla, o.cab_cgc_cpf, o.cab_orgao_destino, o.cab_destino_tipo, o.cab_versao,
    o.municipio_ibge
  from public.organizacoes o
  join public.vinculos v on v.organizacao_id = o.id
  where v.user_id = (select auth.uid()) and (v.fim is null or v.fim >= current_date);
$function$;

-- Versão do layout obrigatória a partir de 07/2026 = D05.00 (a config estava em D04.14, de
-- junho — o cabeçalho saía desatualizado enquanto as linhas já eram v05.00).
update public.organizacoes set cab_versao = 'D05.00' where cab_versao = 'D04.14';
