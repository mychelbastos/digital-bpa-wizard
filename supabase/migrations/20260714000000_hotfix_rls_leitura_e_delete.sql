-- Hotfixes de segurança (pré-Fase 0), não podem esperar o modelo de identidade.

-- (a) estabelecimentos / profissionais / profissional_vinculos eram leitura PÚBLICA
--     (USING true), acessível inclusive ao papel anon (sem login). Restringe a
--     usuários autenticados. O escopo por ORGANIZAÇÃO (fronteira multi-tenant) entra
--     na Fase 1, quando existir organizacao_id e a tabela de vínculos.
alter policy estab_select on public.estabelecimentos using (auth.uid() is not null);
alter policy prof_select on public.profissionais using (auth.uid() is not null);
alter policy vinc_select on public.profissional_vinculos using (auth.uid() is not null);

-- (b) Fim da exclusão de ficha: produção não pode sumir com um clique irreversível.
--     Revoga a política DELETE de fichas (não existe delete de ficha em nenhum nível —
--     ver doc de arquitetura, seção 8). Edição pós-export e retificação virão por
--     reabertura de produção / nova versão, nunca por delete.
drop policy if exists fichas_owner_delete on public.fichas;
