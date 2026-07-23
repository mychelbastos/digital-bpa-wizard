-- Digitador passa a VER as fichas/TFDs da SUA UNIDADE (não só as próprias) — pedido do
-- Mychel: quem é digitador vinculado à unidade vê tudo daquela unidade.
insert into public.papel_permissoes (papel, permissao)
values ('digitador', 'ver_fichas_da_unidade')
on conflict do nothing;

-- Robustez: quem pode GERIR TFD também LÊ o TFD (evita o caso "insere mas não lê de volta",
-- que fazia o salvamento parecer erro). Continua estritamente por CNES próprio.
drop policy if exists tfd_select on public.tfd;
create policy tfd_select on public.tfd for select to authenticated
using (public.tem_permissao(cnes, 'ver_fichas_da_unidade') or public.tem_permissao(cnes, 'gerir_tfd'));

drop policy if exists tfd_linhas_select on public.tfd_linhas;
create policy tfd_linhas_select on public.tfd_linhas for select to authenticated
using (exists (
  select 1 from public.tfd t
  where t.id = tfd_linhas.tfd_id
    and (public.tem_permissao(t.cnes, 'ver_fichas_da_unidade') or public.tem_permissao(t.cnes, 'gerir_tfd'))
));
