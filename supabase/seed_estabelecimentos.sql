-- Seed de estabelecimentos (CNES -> nome). Reaplica-se com segurança (upsert).
insert into public.estabelecimentos (cnes, nome) values
  ('2510332', 'CENTRO DE ESPECIALIDADES DR CLAUDIONOR BATISTA DE OLIVEIRA'),
  ('2510391', 'HOSPITAL REGIONAL DE RUY BARBOSA'),
  ('5847524', 'CAPS RUY BARBOSA'),
  ('5847516', 'CEO RUY BARBOSA'),
  ('7782926', 'SAE RUY BARBOSA'),
  ('2510375', 'SECRETARIA MUNICIPAL DA SAUDE DE RUY BARBOSA'),
  ('3080560', 'CLILAB LABORATORIO DE ANALISES CLINICAS')
on conflict (cnes) do update set nome = excluded.nome, updated_at = now();
