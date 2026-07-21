-- Marca quais pacientes do cadastro central são "pacientes do TFD" (extraídos da planilha
-- de TFD ou cadastrados pela tela do TFD). A tela do TFD filtra por este flag; o cadastro
-- central segue com TODOS os pacientes (BPA-I + TFD). Idempotente.
alter table public.pacientes add column if not exists tfd boolean not null default false;
create index if not exists pacientes_tfd_idx on public.pacientes (organizacao_id, tfd) where tfd;
