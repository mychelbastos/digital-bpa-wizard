-- Uma vez FATURADO (produção do mês gerada), o TFD fica TRAVADO — igual à produção BPA.
-- Só quem pode reabrir/fechar produção (reabrir_producao) consegue alterar/excluir um TFD
-- faturado; os demais (gerir_tfd) só mexem em agendada/realizada/cancelada.
drop policy if exists tfd_update on public.tfd;
create policy tfd_update on public.tfd for update to authenticated
using (public.tem_permissao(cnes, 'gerir_tfd') and (status <> 'faturada' or public.tem_permissao(cnes, 'reabrir_producao')))
with check (public.tem_permissao(cnes, 'gerir_tfd'));

drop policy if exists tfd_delete on public.tfd;
create policy tfd_delete on public.tfd for delete to authenticated
using (public.tem_permissao(cnes, 'gerir_tfd') and (status <> 'faturada' or public.tem_permissao(cnes, 'reabrir_producao')));
