-- Backfill do cadastro central de pacientes a partir do histórico de BPA-I já digitado.
-- Idempotente. Dedup por CNS (forte) e depois CPF, dentro da organização. Em conflito de
-- identidade (mesmo documento, nome/nascimento divergente) MANTÉM o existente e liga a
-- flag_revisao (não sobrescreve). Novos pacientes nascem com origem='bpa_i'.
-- Os pacientes do TFD já estão no pool (cadastrados pela tela do TFD) — não são recriados.
--
-- LGPD: registra a operação EM LOTE (ator + contagens), não um log por paciente.
-- Segurança: SECURITY DEFINER e SEM grant a authenticated (é manutenção; roda via
-- Management API/owner ou por um super admin).

create table if not exists public.pacientes_backfill_log (
  id uuid primary key default gen_random_uuid(),
  executado_por uuid default auth.uid(),
  executado_em timestamptz not null default now(),
  organizacao_id uuid,          -- null = todas
  varridos integer not null default 0,   -- seqs com documento+nome consideradas
  criados integer not null default 0,    -- pacientes novos inseridos
  conflitos integer not null default 0   -- flag_revisao ligada (identidade divergente)
);

create or replace function public.backfill_pacientes_bpai(_org uuid default null)
  returns table(varridos integer, criados integer, conflitos integer)
  language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  _org_f uuid; _cns text; _cpf text; _idd text; _cpftail text;
  _nome text; _nasc date; _dnn text;
  _eid uuid; _enome text; _enasc date; _eflag boolean;
  _v int := 0; _c int := 0; _k int := 0;
begin
  for r in
    select f.dados, e.organizacao_id as org, s as seq
    from public.fichas f
    join public.estabelecimentos e on e.cnes = f.cnes
    cross join lateral jsonb_array_elements(coalesce(f.dados->'seqs','[]'::jsonb)) s
    where f.tipo = 'BPA-I'
      and (_org is null or e.organizacao_id = _org)
  loop
    _org_f := r.org;
    if _org_f is null then continue; end if;

    -- Documento: cnsPac (15=CNS, 11=CPF) + cauda cpfPac.
    _idd := public.jdig(r.seq->'cnsPac');
    _cpftail := public.jdig(r.seq->'cpfPac');
    _cns := null; _cpf := null;
    if length(_idd) = 15 then _cns := _idd;
    elsif length(_idd) = 11 then _cpf := _idd;
    end if;
    if _cpf is null and length(_cpftail) = 11 then _cpf := _cpftail; end if;

    _nome := upper(btrim(coalesce(r.seq->>'nomePac','')));
    if _nome = '' or (_cns is null and _cpf is null) then continue; end if;
    _v := _v + 1;

    -- Nascimento (dataNasc = DDMMYYYY) -> date (tolerante a inválidos).
    _dnn := public.jdig(r.seq->'dataNasc'); _nasc := null;
    if length(_dnn) = 8 then
      begin _nasc := make_date(substr(_dnn,5,4)::int, substr(_dnn,3,2)::int, substr(_dnn,1,2)::int);
      exception when others then _nasc := null; end;
    end if;

    -- Dedup: CNS primeiro, depois CPF.
    _eid := null; _enome := null; _enasc := null; _eflag := null;
    if _cns is not null then
      select id, nome, nascimento, flag_revisao into _eid, _enome, _enasc, _eflag
      from public.pacientes where organizacao_id = _org_f and excluido_em is null and cns = _cns limit 1;
    end if;
    if _eid is null and _cpf is not null then
      select id, nome, nascimento, flag_revisao into _eid, _enome, _enasc, _eflag
      from public.pacientes where organizacao_id = _org_f and excluido_em is null and cpf = _cpf limit 1;
    end if;

    if _eid is not null then
      -- Conflito de identidade -> sinaliza revisão (não sobrescreve).
      if (upper(btrim(coalesce(_enome,''))) <> _nome
          or (_enasc is not null and _nasc is not null and _enasc <> _nasc))
         and not coalesce(_eflag, false) then
        update public.pacientes set flag_revisao = true where id = _eid;
        _k := _k + 1;
      end if;
      continue;
    end if;

    -- Novo paciente (origem BPA-I). ON CONFLICT protege corridas/índices parciais.
    insert into public.pacientes(
      organizacao_id, cns, cpf, nome, sexo, nascimento,
      nacionalidade, raca_cor, etnia, situacao_rua,
      cod_logradouro, logradouro, numero, complemento, bairro,
      cep, municipio_ibge, telefone, email, origem, tfd
    ) values (
      _org_f, _cns, _cpf, _nome,
      nullif(r.seq->>'sexo',''),
      _nasc,
      nullif(r.seq->>'nacionalidade',''),
      nullif(r.seq->>'racaCor',''),
      nullif(r.seq->>'etnia',''),
      nullif(r.seq->>'situacaoRua',''),
      nullif(public.jdig(r.seq->'codLog'),''),
      nullif(btrim(coalesce(r.seq->>'endereco','')),''),
      nullif((select string_agg(x,'') from jsonb_array_elements_text(coalesce(r.seq->'numero','[]'::jsonb)) x),''),
      nullif(btrim(coalesce(r.seq->>'complemento','')),''),
      nullif(btrim(coalesce(r.seq->>'bairro','')),''),
      nullif(public.jdig(r.seq->'cep'),''),
      nullif(public.jdig(r.seq->'ibge'),''),
      nullif(public.jdig(r.seq->'ddd') || public.jdig(r.seq->'telefone'),''),
      nullif(lower(btrim(coalesce(r.seq->>'email',''))),''),
      'bpa_i', false
    )
    on conflict do nothing;
    if found then _c := _c + 1; end if;
  end loop;

  insert into public.pacientes_backfill_log(organizacao_id, varridos, criados, conflitos)
  values (_org, _v, _c, _k);

  varridos := _v; criados := _c; conflitos := _k; return next;
end $$;
