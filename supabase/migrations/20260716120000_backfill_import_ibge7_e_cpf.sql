-- Backfill das fichas BPA-I importadas do .JUN (jun/2026): corrige dois defeitos do
-- importador que deixavam quase todas as sequências em vermelho no formulário.
--
-- 1) IBGE com 6 dígitos: o magnético traz o código do SIA/SUS com 6 díg. (292720 =
--    Ruy Barbosa), mas o app guarda o IBGE COMPLETO de 7 díg. (2927200) — quem corta
--    pros 6 é o gerador do .txt (bpa-magnetico.ts). Sem os 7, o form acusa
--    "Cód. IBGE incompleto". Normaliza 292720 -> 2927200 (7º díg. = 0 p/ Ruy Barbosa).
--
-- 2) Paciente só-CPF invisível: o form usa UM campo "CNS OU CPF" (cnsPac); um CPF vai
--    nele como 4 vazios + 11 díg. Mas o importador gravou o CPF num campo SEPARADO
--    (cpfPac) que o form não lê -> mostrava vazio + "obrigatória". Move cpfPac -> cnsPac.
--
-- Idempotente: o EXISTS só pega seqs que ainda batem o padrão antigo; após aplicada,
-- não altera mais nada. Seguro em produção "aberta" (não dispara trg_fichas_congela).
-- Reexportar .txt de paciente só-CPF exige o layout 04.00 com CPF (fichas de jun/2026
-- já foram enviadas; aqui são só p/ registro/dashboard).

update fichas f
set dados = jsonb_set(
  f.dados,
  '{seqs}',
  (
    select jsonb_agg(
      elem
        || case when elem->'ibge' = '["2","9","2","7","2","0"]'::jsonb
                then jsonb_build_object('ibge','["2","9","2","7","2","0","0"]'::jsonb)
                else '{}'::jsonb end
        || case when (elem->>'cnsPac') !~ '[0-9]' and (elem->>'cpfPac') ~ '[0-9]'
                then jsonb_build_object('cnsPac', '["","","",""]'::jsonb || (elem->'cpfPac'))
                else '{}'::jsonb end
      order by ord
    )
    from jsonb_array_elements(f.dados->'seqs') with ordinality e(elem, ord)
  )
)
where f.tipo = 'BPA-I' and f.origem = 'importado'
  and exists (
    select 1 from jsonb_array_elements(f.dados->'seqs') s(elem)
    where s.elem->'ibge' = '["2","9","2","7","2","0"]'::jsonb
       or ((s.elem->>'cnsPac') !~ '[0-9]' and (s.elem->>'cpfPac') ~ '[0-9]')
  );
