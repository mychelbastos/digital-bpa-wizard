-- Cargo "administrador_geral": pacote com TODAS as permissões (operacionais + gerenciar
-- vínculos). É só um atalho — a autorização real continua sendo "tem a permissão X?".
-- Inserido a partir de public.permissoes para pegar o catálogo inteiro de uma vez.
insert into public.papel_permissoes (papel, permissao)
  select 'administrador_geral', p.codigo from public.permissoes p
  on conflict (papel, permissao) do nothing;
