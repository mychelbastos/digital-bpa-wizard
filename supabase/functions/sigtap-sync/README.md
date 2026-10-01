# sigtap-sync — atualização automática das tabelas SIGTAP

Baixa do DATASUS a competência SIGTAP mais recente, carrega nas tabelas
(`procedimentos_sigtap`, `procedimento_ocupacao/cid/servico`, referências) e aplica a
retenção (mantém as **4 últimas** competências). Replica o import manual já validado.

## Deploy

```bash
# gera um segredo e guarda como env da função
supabase secrets set SIGTAP_SYNC_SECRET="$(openssl rand -hex 24)"

# --no-verify-jwt: a função é protegida pelo header x-sigtap-secret (o pg_cron não manda JWT)
supabase functions deploy sigtap-sync --no-verify-jwt
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetados automaticamente nas Edge Functions.

## Teste manual

```bash
curl -X POST "https://qxtzlorofhuuxzqkbpli.supabase.co/functions/v1/sigtap-sync" \
  -H "x-sigtap-secret: <SEGREDO>"
# resposta: {"status":"importando","competencia":"2026XX"} ou {"status":"ja-atualizado",...}
# forçar reimport: acrescente ?forcar=1
```

Confira depois: `select * from sigtap_competencias order by competencia desc;`

## Agendamento mensal (pg_cron + pg_net)

O SIGTAP costuma sair na 2ª quinzena; rodamos no dia 20, 09:00 UTC. Execute UMA vez no SQL
editor (requer as extensões `pg_cron` e `pg_net`, habilitáveis em Database → Extensions):

```sql
select cron.schedule('sigtap-sync-mensal', '0 9 20 * *', $$
  select net.http_post(
    url := 'https://qxtzlorofhuuxzqkbpli.supabase.co/functions/v1/sigtap-sync',
    headers := jsonb_build_object('Content-Type','application/json','x-sigtap-secret','<SEGREDO>')
  );
$$);
-- para remover: select cron.unschedule('sigtap-sync-mensal');
```

## ⚠️ Riscos conhecidos (ler antes de confiar no automático)

1. **FTP em Edge Function.** O DATASUS só serve por FTP (não há HTTP). A função traz um
   cliente FTP mínimo por TCP (`Deno.connect`). Se o runtime da sua conta restringir TCP de
   saída, a função falha — teste o manual acima **antes** de agendar.
2. **Volume / tempo.** São ~295 mil linhas por competência. A carga roda em
   `EdgeRuntime.waitUntil` (background), mas ainda está sujeita ao limite de CPU/wall-clock da
   sua conta. Se estourar, use o fallback abaixo.

## Fallback robusto (recomendado se o edge estourar o limite)

Rodar o MESMO ETL já validado (download FTP + parse + upsert) num **GitHub Action** mensal —
ambiente com shell/curl/FTP completos, sem limite de tempo relevante. Os scripts estão em
`scripts/sigtap/` (gerador + runner) — basta um workflow com `on: schedule: cron`. Peça que
eu monte o workflow se preferir esse caminho.
