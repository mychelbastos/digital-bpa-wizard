-- Permissão dedicada ao CADASTRO DE PACIENTES, desacoplada do TFD.
--
-- Antes: a RLS de `pacientes` (INSERT/UPDATE) exigia `gerir_tfd`. Como o cadastro é
-- compartilhado (BPA-I/BPA-C/RAAS/TFD), revogar o TFD de um digitador quebrava o cadastro
-- de paciente dele ("Falha ao salvar"). Agora o gate é a nova permissão `gerir_pacientes`,
-- que todos os papéis operacionais recebem por padrão — e tirar o TFD de alguém não afeta
-- mais o cadastro.

insert into public.permissoes (codigo, descricao, escopo)
values ('gerir_pacientes', 'Cadastrar e editar pacientes', 'cnes')
on conflict (codigo) do update set descricao = excluded.descricao, escopo = excluded.escopo;

-- gerir_tfd deixa de ser o gate do cadastro de paciente — ajusta a descrição.
update public.permissoes
set descricao = 'Registrar e gerir TFD (destinos e valores)'
where codigo = 'gerir_tfd';

-- Concede a nova permissão a todos os papéis que hoje já cadastravam paciente (via gerir_tfd).
insert into public.papel_permissoes (papel, permissao)
values
  ('coordenador', 'gerir_pacientes'),
  ('digitador', 'gerir_pacientes'),
  ('operador_remessa', 'gerir_pacientes'),
  ('secretario_municipal', 'gerir_pacientes')
on conflict (papel, permissao) do nothing;

-- Troca o gate da RLS de pacientes: gerir_tfd -> gerir_pacientes (INSERT e UPDATE).
alter policy pacientes_insert on public.pacientes
  with check (public.tem_permissao_no_org(organizacao_id, 'gerir_pacientes'));

alter policy pacientes_update on public.pacientes
  using (public.tem_permissao_no_org(organizacao_id, 'gerir_pacientes'))
  with check (public.tem_permissao_no_org(organizacao_id, 'gerir_pacientes'));
