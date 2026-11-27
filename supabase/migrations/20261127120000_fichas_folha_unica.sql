-- Folha única (27/11/2026): o nº da folha (organizacional — NÃO vai para o .txt do SIA, que é
-- renumerado na exportação) passa a ser garantido PELO BANCO na hora de salvar. Antes era
-- escolhido ao ABRIR a ficha (maior+1) → duas digitadoras abrindo ao mesmo tempo pegavam o
-- mesmo número; e números digitados à mão repetiam.
-- Regra (BPA-I e BPA-C digitados; importados/TFD não mudam):
--   chave BPA-I = CNES + competência + CNS do profissional (ou só CNES+competência se sem CNS)
--   chave BPA-C = CNES + competência + nome do profissional (ou só CNES+competência)
--   número vazio ou já usado por outra ficha da chave → vira o próximo livre (maior + 1);
--   número digitado e livre → mantém. Lock por chave: salvamentos simultâneos ficam em fila.
--   O título "… folha N" acompanha o número.

create or replace function public.fichas_folha_unica()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  campo text;
  chave text;
  prof text;
  atual int;
  usado boolean;
  novo int;
  arr jsonb;
  s text;
begin
  if NEW.tipo not in ('BPA-I', 'BPA-C') or coalesce(NEW.origem, 'digitado') in ('importado', 'tfd')
     or NEW.excluida_em is not null or NEW.dados is null
     or coalesce(NEW.cnes, '') !~ '^\d{7}$' or coalesce(NEW.competencia, '') !~ '^\d{6}$' then
    return NEW;
  end if;
  campo := case when NEW.tipo = 'BPA-I' then 'profFolha' else 'folha' end;

  if NEW.tipo = 'BPA-I' then
    prof := case when coalesce(NEW.profissional_cns, '') ~ '^\d{15}$' then NEW.profissional_cns else '' end;
  else
    prof := btrim(coalesce(NEW.dados->>'profNome', ''));
  end if;
  chave := NEW.tipo || '|' || NEW.cnes || '|' || NEW.competencia || '|' || prof;

  -- UPDATE: só age se o número ou a chave mudaram (evita mexer em ficha já numerada).
  if TG_OP = 'UPDATE' then
    if (OLD.dados->campo) is not distinct from (NEW.dados->campo)
       and OLD.cnes is not distinct from NEW.cnes and OLD.competencia is not distinct from NEW.competencia
       and OLD.profissional_cns is not distinct from NEW.profissional_cns
       and (OLD.dados->>'profNome') is not distinct from (NEW.dados->>'profNome') then
      return NEW;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('folha:' || chave));

  s := regexp_replace(coalesce((select string_agg(x, '') from jsonb_array_elements_text(
         case when jsonb_typeof(NEW.dados->campo) = 'array' then NEW.dados->campo else '[]'::jsonb end) x), ''), '\D', '', 'g');
  atual := nullif(s, '')::int;

  -- Números já usados na mesma chave (outras fichas vivas). BPA-C importado guarda em folhaBase.
  select coalesce(bool_or(n = atual), false), coalesce(max(n), 0) into usado, novo
  from (
    select nullif(regexp_replace(coalesce((select string_agg(x, '') from jsonb_array_elements_text(
             case when jsonb_typeof(f.dados->campo) = 'array' then f.dados->campo else '[]'::jsonb end) x), ''), '\D', '', 'g'), '')::int n
    from public.fichas f
    where f.tipo = NEW.tipo and f.cnes = NEW.cnes and f.competencia = NEW.competencia
      and f.excluida_em is null and f.id <> NEW.id
      and (case when NEW.tipo = 'BPA-I'
                then case when coalesce(f.profissional_cns, '') ~ '^\d{15}$' then f.profissional_cns else '' end
                else btrim(coalesce(f.dados->>'profNome', '')) end) = prof
  ) t where n is not null;

  if atual is not null and atual > 0 and not usado then
    return NEW; -- número livre: mantém
  end if;

  -- UPDATE de ficha já numerada, mesma chave: número colidindo/vazio = tela desatualizada
  -- (ex.: aberta antes de uma renumeração) → MANTÉM o número que a ficha já tinha.
  if TG_OP = 'UPDATE' and jsonb_typeof(OLD.dados->campo) = 'array'
     and OLD.cnes is not distinct from NEW.cnes and OLD.competencia is not distinct from NEW.competencia
     and OLD.profissional_cns is not distinct from NEW.profissional_cns
     and (OLD.dados->>'profNome') is not distinct from (NEW.dados->>'profNome') then
    s := regexp_replace(coalesce((select string_agg(x, '') from jsonb_array_elements_text(OLD.dados->campo) x), ''), '\D', '', 'g');
    if s <> '' then
      NEW.dados := jsonb_set(NEW.dados, array[campo], OLD.dados->campo, true);
      if NEW.titulo ~ 'folha \d+' then
        NEW.titulo := regexp_replace(NEW.titulo, 'folha \d+', 'folha ' || s::int);
      end if;
      return NEW;
    end if;
  end if;
  novo := novo + 1;

  -- Grava no mesmo formato da tela: 3 casinhas, dígitos à direita.
  s := novo::text;
  arr := '[]'::jsonb;
  for i in 1..greatest(3, length(s)) - length(s) loop arr := arr || to_jsonb(''::text); end loop;
  for i in 1..length(s) loop arr := arr || to_jsonb(substr(s, i, 1)); end loop;
  NEW.dados := jsonb_set(NEW.dados, array[campo], arr, true);
  if NEW.titulo ~ 'folha \d+' then
    NEW.titulo := regexp_replace(NEW.titulo, 'folha \d+', 'folha ' || novo);
  end if;
  return NEW;
end $$;

drop trigger if exists fichas_folha_unica on public.fichas;
create trigger fichas_folha_unica before insert or update on public.fichas
  for each row execute function public.fichas_folha_unica();
