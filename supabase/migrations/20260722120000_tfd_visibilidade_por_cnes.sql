-- TFD: a visibilidade dos registros passa a ser ESTRITAMENTE por CNES próprio (vale para
-- todos, inclusive quem enxerga o município nas fichas). Remove o ramo "ver_fichas_do_municipio"
-- das policies de SELECT de `tfd` e `tfd_linhas`. Escrever continua exigindo gerir_tfd no CNES.
-- Idempotente.

drop policy if exists tfd_select on public.tfd;
create policy tfd_select on public.tfd for select to authenticated
using (public.tem_permissao(cnes, 'ver_fichas_da_unidade'));

drop policy if exists tfd_linhas_select on public.tfd_linhas;
create policy tfd_linhas_select on public.tfd_linhas for select to authenticated
using (exists (
  select 1 from public.tfd t
  where t.id = tfd_linhas.tfd_id and public.tem_permissao(t.cnes, 'ver_fichas_da_unidade')
));
