-- Configuração da ORGANIZAÇÃO (Prefeitura) + gestão, com o cabeçalho do arquivo magnético
-- (registro 01) passando a ser da organização — não mais por-usuário no metadata. O gerador
-- não muda (recebe ConfigOrgao como parâmetro); o /fechamento é que passa a puxar da org.

-- 1) Campos do cabeçalho na organização (espelham ConfigOrgao).
alter table public.organizacoes
  add column if not exists cab_orgao_origem text,
  add column if not exists cab_sigla text,
  add column if not exists cab_cgc_cpf text,
  add column if not exists cab_orgao_destino text,
  add column if not exists cab_destino_tipo text not null default 'M',
  add column if not exists cab_versao text not null default 'D04.11';
do $$ begin
  alter table public.organizacoes add constraint organizacoes_cab_destino_tipo_chk check (cab_destino_tipo in ('M', 'E'));
exception when duplicate_object then null; end $$;

-- 2) Backfill best-effort: puxa a config já digitada no metadata de algum usuário da org.
update public.organizacoes o set
  cab_orgao_origem = coalesce(o.cab_orgao_origem, src.orig),
  cab_sigla = coalesce(o.cab_sigla, src.sigla),
  cab_cgc_cpf = coalesce(o.cab_cgc_cpf, src.cgc),
  cab_orgao_destino = coalesce(o.cab_orgao_destino, src.dest),
  cab_destino_tipo = case when o.cab_orgao_origem is null and src.dtipo in ('M','E') then src.dtipo else o.cab_destino_tipo end,
  cab_versao = case when o.cab_orgao_origem is null and coalesce(src.versao,'') <> '' then src.versao else o.cab_versao end
from (
  select distinct on (v.organizacao_id) v.organizacao_id,
    u.raw_user_meta_data->'config'->>'orgaoOrigemNome' as orig,
    u.raw_user_meta_data->'config'->>'sigla' as sigla,
    u.raw_user_meta_data->'config'->>'cgcCpf' as cgc,
    u.raw_user_meta_data->'config'->>'orgaoDestinoNome' as dest,
    u.raw_user_meta_data->'config'->>'destinoTipo' as dtipo,
    u.raw_user_meta_data->'config'->>'versao' as versao
  from public.vinculos v
  join auth.users u on u.id = v.user_id
  where coalesce(u.raw_user_meta_data->'config'->>'orgaoOrigemNome', '') <> ''
  order by v.organizacao_id, v.criado_em
) src
where src.organizacao_id = o.id and o.cab_orgao_origem is null;

-- 3) Organizações que o admin gerencia (+ última gestão) — para a tela de administração.
create or replace function public.admin_organizacoes()
  returns table (
    id uuid, nome text, municipio_ibge text, uf text,
    cab_orgao_origem text, cab_sigla text, cab_cgc_cpf text, cab_orgao_destino text,
    cab_destino_tipo text, cab_versao text,
    gestao_id uuid, gestao_nome text, gestao_inicio date, gestao_fim date
  )
  language sql stable security definer set search_path = public as $$
  select o.id, o.nome, o.municipio_ibge, o.uf,
    o.cab_orgao_origem, o.cab_sigla, o.cab_cgc_cpf, o.cab_orgao_destino, o.cab_destino_tipo, o.cab_versao,
    g.id, g.nome, g.inicio, g.fim
  from public.organizacoes o
  left join lateral (
    select gg.* from public.gestoes gg where gg.organizacao_id = o.id order by gg.inicio desc limit 1
  ) g on true
  where public.tem_permissao_no_org(o.id, 'gerenciar_vinculos');
$$;

-- 4) Salvar dados da organização (nome, IBGE, UF, cabeçalho).
create or replace function public.admin_salvar_organizacao(
  _org uuid, _nome text, _ibge text, _uf text,
  _orig text, _sigla text, _cgc text, _dest text, _dtipo text, _versao text)
  returns void language plpgsql security definer set search_path = public as $$
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
    cab_versao = coalesce(nullif(btrim(_versao), ''), 'D04.11')
  where id = _org;
end $$;

-- 5) Salvar/criar gestão (mandato) da organização.
create or replace function public.admin_salvar_gestao(
  _org uuid, _gestao_id uuid, _nome text, _inicio date, _fim date)
  returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if not public.tem_permissao_no_org(_org, 'gerenciar_vinculos') then
    raise exception 'Sem permissão para administrar esta organização' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(_nome), '') = '' or _inicio is null then
    raise exception 'Gestão exige nome e data de início';
  end if;
  if _fim is not null and _fim < _inicio then raise exception 'Fim da gestão antes do início'; end if;
  if _gestao_id is null then
    insert into public.gestoes (organizacao_id, nome, inicio, fim) values (_org, _nome, _inicio, _fim)
      returning id into _id;
  else
    update public.gestoes set nome = _nome, inicio = _inicio, fim = _fim
      where id = _gestao_id and organizacao_id = _org returning id into _id;
    if _id is null then raise exception 'Gestão não encontrada nesta organização'; end if;
  end if;
  return _id;
end $$;

-- 6) Config do cabeçalho para o USUÁRIO logado (o /fechamento espelha isto no gerador).
create or replace function public.org_config_do_usuario()
  returns table (
    org_id uuid, nome text,
    cab_orgao_origem text, cab_sigla text, cab_cgc_cpf text, cab_orgao_destino text,
    cab_destino_tipo text, cab_versao text
  )
  language sql stable security definer set search_path = public as $$
  select distinct o.id, o.nome,
    o.cab_orgao_origem, o.cab_sigla, o.cab_cgc_cpf, o.cab_orgao_destino, o.cab_destino_tipo, o.cab_versao
  from public.organizacoes o
  join public.vinculos v on v.organizacao_id = o.id
  where v.user_id = (select auth.uid()) and (v.fim is null or v.fim >= current_date);
$$;

grant execute on function public.admin_organizacoes() to authenticated;
grant execute on function public.admin_salvar_organizacao(uuid, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_salvar_gestao(uuid, uuid, text, date, date) to authenticated;
grant execute on function public.org_config_do_usuario() to authenticated;
