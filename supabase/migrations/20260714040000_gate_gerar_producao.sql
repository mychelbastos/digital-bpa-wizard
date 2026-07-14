-- Gate de gerar_producao no /fechamento (antecipado da Fase 2): a geração do .txt
-- deixa de estar disponível a todo usuário logado. Só quem tem a permissão
-- gerar_producao no CNES pode fechar a produção daquele CNES.
--
-- RPC que devolve os CNES onde o usuário atual pode gerar produção. O cliente usa
-- para habilitar/travar o botão e validar o CNES escolhido. A enforcement dura
-- (via RLS de insert na tabela `producoes`) chega na Fase 2.
create or replace function public.cnes_com_permissao(_perm text)
  returns table(cnes text)
  language sql stable security definer set search_path = public as $$
  select c.cnes from public.cnes_visiveis() c
  where public.tem_permissao(c.cnes, _perm)
$$;
