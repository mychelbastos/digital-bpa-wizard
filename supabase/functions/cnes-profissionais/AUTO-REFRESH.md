# Atualização automática do SCNES (retrato de profissionais/vínculos)

A função `cnes-profissionais` já atualiza o cache (`profissionais` + `profissional_vinculos`)
sob demanda, com TTL de 7 dias. O problema: um CNES que ninguém abre nunca é reconsultado,
então o retrato envelhece (e **profissionais mudam** com frequência).

Esta automação força, **toda semana**, o refresh da LISTA de profissionais de cada CNES em
uso — capturando quem entrou/saiu (o modo lista já remove quem não está mais no SCNES).
Continua apontando para o **SCNES de homologação** (as envs atuais); quando virar produção,
o mesmo cron continua valendo.

## 1) Segredo + deploy (uma vez)

A função ganhou um atalho de autenticação por segredo (o cron não tem JWT de usuário). Defina
o segredo e **republique a função**:

```bash
supabase secrets set SCNES_SYNC_SECRET="$(openssl rand -hex 24)"
supabase functions deploy cnes-profissionais
```

> A mudança no código é aditiva: chamadas normais do app seguem exigindo usuário autenticado;
> só quem envia o header `x-scnes-secret` correto pula essa checagem.

## 2) Agendamento semanal (pg_cron + pg_net)

Rode uma vez no SQL editor (extensões `pg_cron` e `pg_net` habilitadas). Percorre os CNES dos
estabelecimentos e do cache, chamando a função com `forcar:true` para cada um:

```sql
select cron.schedule('scnes-refresh-semanal', '0 8 * * 1', $$
  select net.http_post(
    url := 'https://qxtzlorofhuuxzqkbpli.supabase.co/functions/v1/cnes-profissionais',
    headers := jsonb_build_object('Content-Type','application/json','x-scnes-secret','<SEGREDO>'),
    body := jsonb_build_object('cnes', cnes, 'forcar', true)
  )
  from (
    select distinct cnes from estabelecimentos where cnes ~ '^[0-9]{7}$'
    union
    select distinct cnes from profissionais where cnes ~ '^[0-9]{7}$'
  ) t;
$$);
-- remover: select cron.unschedule('scnes-refresh-semanal');
```

Segunda-feira 08:00 UTC. São poucos CNES (um município) → poucas chamadas SOAP leves.

## 3) (Opcional) Também atualizar os CBOs do vínculo

O refresh acima cobre a LISTA de profissionais. Os CBOs do vínculo (`profissional_vinculos`)
continuam no TTL de 7 dias (atualizam quando um profissional é escolhido). Se quiser forçá-los
também, adicione um cron que percorre `(cns, cnes)` — **mais pesado** (uma consulta SOAP por
profissional, varrendo 9 tipos de vínculo), use com parcimônia:

```sql
select cron.schedule('scnes-vinculos-mensal', '0 9 1 * *', $$
  select net.http_post(
    url := 'https://qxtzlorofhuuxzqkbpli.supabase.co/functions/v1/cnes-profissionais',
    headers := jsonb_build_object('Content-Type','application/json','x-scnes-secret','<SEGREDO>'),
    body := jsonb_build_object('cns', cns, 'cnes', cnes, 'forcar', true)
  )
  from (select distinct cns, cnes from profissionais where cnes ~ '^[0-9]{7}$') t;
$$);
```

## Verificação

```sql
select ambiente, count(*), max(atualizado_em) from profissionais group by ambiente;
```
O `max(atualizado_em)` deve avançar a cada segunda-feira.
