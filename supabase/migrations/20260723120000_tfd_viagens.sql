-- TFD: uma solicitação pode ter VÁRIAS viagens, cada uma com sua própria data de atendimento
-- e tipo (com/sem pernoite). Guardamos a lista em `viagens` (jsonb): [{"data":"YYYY-MM-DD",
-- "pernoite":"com"|"sem"}]. As contagens qtd_com_pernoite/qtd_sem_pernoite continuam
-- derivadas dela (mantidas para consultas/preview). A geração BPA-I cria seqs por data.
alter table public.tfd add column if not exists viagens jsonb not null default '[]'::jsonb;
