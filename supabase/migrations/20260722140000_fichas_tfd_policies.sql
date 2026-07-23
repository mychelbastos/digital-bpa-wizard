-- Faturamento do TFD gera fichas BPA-I INSTITUCIONAIS (origem='tfd'), consolidadas por
-- profissional responsável — não são fichas "pessoais" do usuário. As policies padrão de
-- fichas exigem criar_ficha/editar_ficha_propria + user_id do dono; aqui adicionamos policies
-- PERMISSIVAS dedicadas (OR com as existentes) para fichas origem='tfd', gated por gerir_tfd
-- no CNES. Assim o faturamento mensal insere/atualiza (idempotente) independente do dono.
-- Idempotente.

drop policy if exists fichas_insert_tfd on public.fichas;
create policy fichas_insert_tfd on public.fichas for insert to authenticated
with check (origem = 'tfd' and public.tem_permissao(cnes, 'gerir_tfd'));

drop policy if exists fichas_update_tfd on public.fichas;
create policy fichas_update_tfd on public.fichas for update to authenticated
using (origem = 'tfd' and public.tem_permissao(cnes, 'gerir_tfd'))
with check (origem = 'tfd' and public.tem_permissao(cnes, 'gerir_tfd'));
