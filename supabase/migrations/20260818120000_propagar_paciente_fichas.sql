-- Propagação "cadastro manda": ao editar um paciente, o nome/nascimento corrigido
-- passa a valer também dentro das fichas BPA-I que carregam o mesmo documento
-- (CNS/CPF). Elimina a divergência ficha×cadastro que gerava a marca de revisão
-- (flag_revisao) e a acusação de "conflito de documento" no relatório de erros.
--
-- Detalhes do layout do seq (verificados no banco real):
--   nomePac  = string preenchida com espaços à direita (largura fixa do campo)
--   dataNasc = array de 8 chars (DDMMYYYY)
--   cnsPac   = array de 15 chars (CNS) OU CPF de 11
--   cpfPac   = array de 11 chars (cauda de CPF)
--
-- SECURITY INVOKER (padrão): as leituras/updates internos respeitam a RLS do
-- chamador, então a propagação só toca fichas que o usuário já pode editar.

create or replace function public.propagar_paciente_fichas(p_id uuid)
returns integer
language plpgsql
as $$
declare
  _cns text; _cpf text; _nome text; _nasc date;
  _dn jsonb;
  _n integer := 0;
  r record;
  _seqs jsonb; _new_seqs jsonb; _seq jsonb;
  _i integer; _w integer;
  _idd text; _cpftail text; _oldname text;
  _match boolean; _touched boolean;
begin
  select cns, cpf, upper(btrim(coalesce(nome, ''))), nascimento
    into _cns, _cpf, _nome, _nasc
  from public.pacientes where id = p_id;

  if _nome is null or _nome = '' then return 0; end if;
  if (_cns is null or _cns = '') and (_cpf is null or _cpf = '') then return 0; end if;

  -- dataNasc só é propagada quando há nascimento válido no cadastro.
  if _nasc is not null then
    _dn := to_jsonb(regexp_split_to_array(to_char(_nasc, 'DDMMYYYY'), ''));
  end if;

  for r in
    select id, dados from public.fichas
    where tipo = 'BPA-I' and excluida_em is null and dados ? 'seqs'
  loop
    _seqs := r.dados->'seqs';
    if jsonb_typeof(_seqs) <> 'array' then continue; end if;

    _new_seqs := '[]'::jsonb;
    _touched := false;

    for _i in 0 .. jsonb_array_length(_seqs) - 1 loop
      _seq := _seqs->_i;
      _idd := public.jdig(_seq->'cnsPac');
      _cpftail := public.jdig(_seq->'cpfPac');

      _match := false;
      if _cns is not null and _cns <> '' and _idd = _cns then
        _match := true;
      elsif _cpf is not null and _cpf <> '' and (_idd = _cpf or _cpftail = _cpf) then
        _match := true;
      end if;

      if _match then
        _oldname := coalesce(_seq->>'nomePac', '');
        -- Preserva a largura do campo (default 30). Preenche à direita e trunca.
        _w := case when length(_oldname) > 0 then length(_oldname) else 30 end;
        _seq := jsonb_set(_seq, '{nomePac}', to_jsonb(left(rpad(_nome, _w, ' '), _w)));
        if _dn is not null then
          _seq := jsonb_set(_seq, '{dataNasc}', _dn);
        end if;
        _touched := true;
      end if;

      _new_seqs := _new_seqs || jsonb_build_array(_seq);
    end loop;

    if _touched then
      update public.fichas
        set dados = jsonb_set(dados, '{seqs}', _new_seqs), updated_at = now()
      where id = r.id;
      _n := _n + 1;
    end if;
  end loop;

  return _n;
end;
$$;

grant execute on function public.propagar_paciente_fichas(uuid) to authenticated;
