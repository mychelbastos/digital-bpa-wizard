-- Carimbo de AUDITORIA da tela que criou/salvou a ficha (ex.: 'v4'). Serve só para medir a
-- adoção do BPA-I V4 na proposta à prefeitura.
--
-- Garantias (não pode mudar): é PURAMENTE auditoria — NÃO entra no .MAR (o gerador lê só
-- dados.seqs), NÃO muda RLS nem trigger de imutabilidade, e NENHUMA lógica pode se ramificar
-- com base nela. Fichas do V3 e do V4 continuam 100% interoperáveis (mesmo shape de `dados`).
alter table public.fichas add column if not exists origem_ui text;
comment on column public.fichas.origem_ui is
  'Auditoria/adoção: tela que salvou a ficha (ex.: v4). NÃO entra no .MAR, não muda RLS/trigger, nenhuma lógica ramifica por ela.';
