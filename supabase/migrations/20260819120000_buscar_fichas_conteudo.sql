-- Busca de fichas por CONTEÚDO (para a lupa da tela "Minhas fichas"): além do título e
-- metadados (que a lista já filtra no cliente), procura dentro do jsonb `dados` por:
--   • nome do paciente (strings: nomePac / pac_nome / nome…) — casamento sem acento
--   • códigos (procedimento/CNS/CPF), que ficam em arrays de 1 dígito por caractere:
--     achatamos o dados::text só nos dígitos e procuramos a sequência digitada.
-- SECURITY INVOKER (padrão): respeita a RLS — só retorna fichas que o usuário pode ver.

-- Helper: MAIÚSCULO sem acento (não depende da extensão unaccent).
create or replace function public.sem_acento(t text)
returns text language sql immutable as $$
  select upper(translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'))
$$;

create or replace function public.buscar_fichas_conteudo(termo text)
returns table(id uuid)
language sql stable as $$
  with t as (
    select public.sem_acento(btrim(termo)) as up,
           regexp_replace(btrim(termo), '\D', '', 'g') as dig
  )
  select f.id
  from public.fichas f, t
  where f.excluida_em is null
    and char_length(t.up) >= 2
    and (
      -- Texto (título + nomes de paciente e demais strings do conteúdo), sem acento.
      public.sem_acento(f.titulo) like '%' || t.up || '%'
      or public.sem_acento(f.dados::text) like '%' || t.up || '%'
      -- Códigos (procedimento/CNS/CPF) guardados como array de dígitos.
      or (char_length(t.dig) >= 3
          and regexp_replace(f.dados::text, '[^0-9]', '', 'g') like '%' || t.dig || '%')
    );
$$;
grant execute on function public.buscar_fichas_conteudo(text) to authenticated;
