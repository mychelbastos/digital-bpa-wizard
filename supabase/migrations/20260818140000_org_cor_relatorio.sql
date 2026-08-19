-- Cor de destaque dos relatórios (PDF) por organização. Cada gestão costuma adotar uma cor
-- de trabalho; o padrão do sistema é verde. Hex "#RRGGBB" (null = usa o verde padrão).
alter table public.organizacoes add column if not exists cor_relatorio text;

-- RPC: cor da org do usuário logado (para os relatórios buscarem sem expor toda a tabela).
create or replace function public.org_cor_do_usuario()
returns text language sql stable security definer set search_path = public as $$
  select o.cor_relatorio
  from public.organizacoes o
  where o.id = (
    select v.organizacao_id from public.vinculos v
    where v.user_id = (select auth.uid())
      and v.inicio <= current_date and (v.fim is null or v.fim >= current_date)
    limit 1
  )
$$;
grant execute on function public.org_cor_do_usuario() to authenticated;

-- admin_organizacoes: incluir cor_relatorio no retorno (muda a assinatura → recria).
drop function if exists public.admin_organizacoes();
create function public.admin_organizacoes()
returns table(id uuid, nome text, municipio_ibge text, uf text, cab_orgao_origem text,
  cab_sigla text, cab_cgc_cpf text, cab_orgao_destino text, cab_destino_tipo text, cab_versao text,
  cor_relatorio text, gestao_id uuid, gestao_nome text, gestao_inicio date, gestao_fim date)
language sql stable security definer set search_path to 'public' as $$
  select o.id, o.nome, o.municipio_ibge, o.uf,
    o.cab_orgao_origem, o.cab_sigla, o.cab_cgc_cpf, o.cab_orgao_destino, o.cab_destino_tipo, o.cab_versao,
    o.cor_relatorio,
    g.id, g.nome, g.inicio, g.fim
  from public.organizacoes o
  left join lateral (
    select gg.* from public.gestoes gg where gg.organizacao_id = o.id order by gg.inicio desc limit 1
  ) g on true
  where public.tem_permissao_no_org(o.id, 'gerenciar_vinculos');
$$;
grant execute on function public.admin_organizacoes() to authenticated;

-- admin_salvar_organizacao: novo parâmetro _cor (hex ou null). Recria com a assinatura nova.
drop function if exists public.admin_salvar_organizacao(uuid, text, text, text, text, text, text, text, text, text);
create function public.admin_salvar_organizacao(_org uuid, _nome text, _ibge text, _uf text,
  _orig text, _sigla text, _cgc text, _dest text, _dtipo text, _versao text, _cor text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para administrar esta organização' using errcode = 'insufficient_privilege';
  end if;
  if _dtipo not in ('M', 'E') then raise exception 'Tipo de destino inválido (use M ou E)'; end if;
  update public.organizacoes set
    nome = coalesce(nullif(btrim(_nome), ''), nome),
    municipio_ibge = nullif(btrim(_ibge), ''),
    uf = nullif(btrim(_uf), ''),
    cab_orgao_origem = nullif(btrim(_orig), ''),
    cab_sigla = nullif(btrim(_sigla), ''),
    cab_cgc_cpf = nullif(regexp_replace(coalesce(_cgc, ''), '\D', '', 'g'), ''),
    cab_orgao_destino = nullif(btrim(_dest), ''),
    cab_destino_tipo = _dtipo,
    cab_versao = coalesce(nullif(btrim(_versao), ''), 'D04.11'),
    -- só aceita #RRGGBB; qualquer outra coisa vira null (volta ao padrão).
    cor_relatorio = case when btrim(coalesce(_cor, '')) ~* '^#?[0-9a-f]{6}$'
                         then '#' || upper(regexp_replace(btrim(_cor), '^#', ''))
                         else null end
  where id = _org;
end $$;
grant execute on function public.admin_salvar_organizacao(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;
