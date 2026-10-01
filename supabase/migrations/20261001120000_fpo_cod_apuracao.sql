-- Campo [22:24] do .IMP do FPO Magnético: financiamento + nível de apuração.
--   "21" = MAC / Grupo   ·   "24" = MAC / Procedimento   ·   "34" = FAEC / Procedimento
-- Capturado na importação do .IMP e usado na EXPORTAÇÃO do .IMP para o SIA. Para itens
-- criados/editados no painel, é preenchido manualmente (2 dígitos — crivo abaixo + no front).
alter table public.fpo_teto add column if not exists cod_apuracao text;
alter table public.fpo_teto drop constraint if exists fpo_teto_cod_apuracao_chk;
alter table public.fpo_teto add constraint fpo_teto_cod_apuracao_chk
  check (cod_apuracao is null or cod_apuracao ~ '^[0-9]{2}$');
