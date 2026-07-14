-- O layout do DATASUS muda ~mês a mês (mar/2026 = D04.11 / Secretaria do Estado;
-- jun/2026 = D04.14 / Ministério da Saúde). A versão NÃO é constante — vem da config da org.
-- Aqui só atualizamos o DEFAULT de novas prefeituras para a versão atual (D04.14). Órgão de
-- destino e versão devem ser revisados a cada remessa.
alter table public.organizacoes alter column cab_versao set default 'D04.14';
