-- Cargo "Profissional de Saúde" (26/11/2026): mesmo pacote de permissões do digitador.
-- Cargo = linhas em papel_permissoes; a tela de admin lista os cargos a partir daqui e o
-- admin_vincular_unidade só exige que o cargo exista nesta tabela. Copia o pacote ATUAL
-- do digitador (idempotente).
insert into public.papel_permissoes (papel, permissao)
select 'profissional_saude', permissao from public.papel_permissoes where papel = 'digitador'
on conflict do nothing;
