-- Data de admissão / início do acompanhamento do paciente no CAPS (RAAS PSI).
-- É estável por paciente (ras_dtinival nos arquivos reais é fixo por pessoa, não muda com a
-- competência), então mora no cadastro e é reidratada na ficha RAAS ao vincular o paciente.
alter table public.pacientes
  add column if not exists data_admissao date;

comment on column public.pacientes.data_admissao is
  'Data de admissão/início do acompanhamento no CAPS (RAAS ras_dtinival).';
