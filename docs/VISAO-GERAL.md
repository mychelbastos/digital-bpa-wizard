# Visão geral do sistema — guia rápido para uma nova IA/dev

> Objetivo deste arquivo: em 10 minutos, uma IA entrando no projeto entende **o que é o sistema, como está organizado, como fazer cada coisa e onde estão as armadilhas.** Ler antes de mexer.

---

## 1. O que é

Sistema web de **produção ambulatorial do SUS** para a **Prefeitura de Ruy Barbosa‑BA** (município IBGE `2927200`, UF `29`/BA). A digitadora lança a produção (atendimentos, procedimentos, TFD) e o sistema **gera os arquivos que o SIA/SUS importa** — o **BPA Magnético** (`.txt` que passa pelo programa BPA oficial) — além de relatórios, dashboard e conferência (crivos SIGTAP/consistência).

Fluxo mental do domínio:
> digitar fichas (BPA‑I / BPA‑C / RAAS / TFD) → conferir (crivos) → **fechar a produção do mês** (movimento) → gerar o `.txt`/PA para o SIA → relatórios.

---

## 2. Stack e como rodar

- **Front:** React + TypeScript + **TanStack Router** (rotas por arquivo em `src/routes/*.tsx`), Vite, Tailwind, Radix. Estado local + hooks; sem Redux.
- **Back:** **Supabase** (Postgres + **RLS** + Edge Functions Deno). Cliente em `src/lib/supabase.ts`.
- **Deploy:** **Lovable**. `git push origin main` → o Lovable reconstrói o app. **Não reescrever histórico** (nada de force‑push/rebase — ver `AGENTS.md`). Mudanças de **banco / edge function / dados** feitas pela management API são **imediatas** (não dependem do rebuild).
- **Ref do projeto Supabase:** `qxtzlorofhuuxzqkbpli`.

**Checks antes de commitar (sempre):**
```bash
npx tsc --noEmit        # tipos
npx vitest run          # testes (inclui golden de equivalência V3/V4 do .MAR)
npm run build           # build (mais lento; rode separado se travar em cadeia)
```

**SQL direto no banco (management API):**
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/qxtzlorofhuuxzqkbpli/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" -H "Content-Type: application/json" \
  -d '{"query":"select ..."}'
```
(Use um arquivo `-d @/tmp/q.json` para queries com aspas — evita dor de escaping no shell.)

**Migrations:** arquivo em `supabase/migrations/AAAAMMDDHHMMSS_nome.sql` **e** aplicar via management API (mesmo endpoint acima). Já há ~86 migrations.

**Edge functions:** `supabase functions deploy <nome> --project-ref qxtzlorofhuuxzqkbpli [--no-verify-jwt]` (CLI lê o arquivo em `supabase/functions/<nome>/index.ts`). **Sempre `npm:` imports, nunca `esm.sh`** (esm.sh dá BOOT_ERROR no runtime). Confira `verify_jwt` atual antes de redeployar para não mudar o comportamento de auth.

---

## 3. Mapa das telas (`src/routes/`)

| Rota | O que é |
|---|---|
| `index` | Dashboard (produção por competência, gráficos) |
| `bpa-i-v3` | **BPA‑I** (Individualizado) — tela oficial. `bpa-i-v4` = proposta; `bpa-i-v2` = backup |
| `bpa-c-v3` | **BPA‑C** (Consolidado). `bpa-c-v2` = backup |
| `raas` / `raas-folha` | **RAAS** Psicossocial (CAPS) + folha oficial p/ PDF |
| `tfd` | **TFD** (Tratamento Fora do Domicílio) — gera BPA‑I; calendário de viagens |
| `fpo` | **FPO** (Programação Orçamentária) — importa e compara teto × produção |
| `importar` | Importa `.MAR/.JUN` (BPA Magnético) e `.AAS` (RAAS) |
| `fechamento` | **Fecha o mês** e gera o `.txt`/PA + `RELEXP.PRN` |
| `minhas-fichas` | Lista/abre/edita fichas salvas |
| `relatorios.*` | Produção, consistência, perfil, inativos, TFD, FPO, tabulação, relação |
| `admin` | Usuários, vínculos, **permissões** |
| `apac`, `laudo-aih` | Stubs (ainda não gravam ficha) |

**Motor do BPA‑I:** `src/lib/bpa-i-v3/engine.ts` (`useBpaIEngine`) é a **fonte única** compartilhada por V3 e V4 — os dois produzem o **mesmo `.MAR`** (travado pelo golden `equivalencia.golden.test.ts`). Campos são posicionados em `%` sobre a imagem da folha (`.form-sheet`) por `DigitBoxes`/`ComboField`/`TextField` (`src/components/DigitBoxes.tsx`), com o **layout** (posições) em `src/lib/bpai-v2-layout.ts` (`L.REL`).

---

## 4. Conceitos que você PRECISA entender

### 4.1 Competência (realização) × Movimento de faturamento
- **Competência da folha** = mês em que o atendimento foi **realizado** (vai no cabeçalho da ficha; `profMes/profAno`).
- **Movimento de faturamento** = mês de **apresentação** em que a produção é lançada (carimbado em `fichas.mes_producao` no 1º save). Espelha a "competência do movimento" do BPA oficial.
- **Regra:** competência ≤ movimento (fatura‑se no mês ou depois; **retroatividade** permitida). O save barra competência > movimento.
- O movimento é **compartilhado pela equipe** (mora na org; só o faturista com `gerar_producao`/super‑admin altera) — `src/lib/faturamento.ts` (`movimentoFaturamento()`, `competenciaPadrao()`, `useMovimentoFaturamento()`). O **default de competência de TODA tela nova** é o **movimento em aberto** (`competenciaPadrao`), não o mês do calendário.

### 4.2 Fechamento e o arquivo do SIA
- `producoes` (tabela) = o movimento: `mes_producao`, `status` (`aberta`/`exportada`/`transmitida`). Fichas ficam **congeladas** quando a produção é exportada (triggers) → editar exige **reabrir**/**retificar**.
- `fechamento.tsx` + `src/lib/fechamento-mes.ts` juntam as fichas do mês (01 header + 02 BPA‑C + 03 BPA‑I) num `.txt` nomeado `PA<ibge6>.<MMM>` (ex.: `PA292720.JUL`) e geram `RELEXP.PRN`. **A folha/seq do `.MAR` é DERIVADA no fechamento** (não é o nº de folha da tela).
- Gerador do BPA Magnético: `src/lib/bpa-i-v2/bpa-magnetico.ts` (`linhaBpaI`, `numF` = pad com zeros, `campoControle = 1111 + (Σ(proc+qtde) mod 1111)`). Nacionalidade sai `010/020/030` (`nacionalidadeBpa`). **NÃO deduzir o layout do `.MAR` — ler o código/arquivos reais.**

### 4.3 SIGTAP (crivos)
- `procedimentos_sigtap` (+ serviços/CID/ocupações). `resolver_procedimentos_fpo` resolve **código FPO de 9 díg → SIGTAP 10 díg**. Reter só as **4 últimas competências** do SIGTAP.
- Crivos por sequência (`src/lib/bpa-i-v3/obrigatorios.ts` + `use-validacao-procedimento.ts`): identificação, datas (idade ≤130, DD/MM/AAAA com ano de 4 díg, sem futuro), **procedimento com 10 díg**, serviço/classe e CID quando o SIGTAP exige, duplicidade na folha e aviso entre folhas.

### 4.4 Pacientes (pool compartilhado)
- `pacientes` (por organização). **Compartilhado** por TFD + BPA‑I/C/RAAS. `src/lib/pacientes.ts` (`salvarPaciente` dedup por CNS/CPF; nunca mescla pessoas diferentes). RLS de INSERT/UPDATE exige a permissão **`gerir_pacientes`** (própria, desacoplada do TFD).

### 4.5 Profissionais / CNES
- `profissionais` + `profissional_vinculos` = **snapshot** do CNES atual (sem competência; só `atualizado_em`). Sincronizados da edge function **`cnes-profissionais`** (SCNES SOAP; ambiente hoje = **homolog**). O sync **substitui o retrato**: profissional que saiu do CNES some da busca; quem volta reaparece. A **série histórica** fica na própria ficha (guarda nome/CNS/CBO).

### 4.6 Permissões (RLS)
- Papéis em `papel_permissoes` (`coordenador`, `digitador`, `operador_remessa`, `secretario_municipal`); overrides por vínculo em `vinculo_permissoes` (`concedida` true/false). Catálogo de permissões em `permissoes` (código/descrição/escopo). Funções `tem_permissao(cnes,perm)` / `tem_permissao_no_org(org,perm)` / `minhas_permissoes()` / `is_super_admin()`.
- Padrão: **tudo liberado**; o admin **bloqueia** (`src/routes/admin.tsx`, `src/lib/permissoes.ts`). Menu/relatórios têm cadeado.

### 4.7 RLS e ciclo de vida das fichas
- `fichas`: soft‑delete (`excluida_em`/`excluida_por`), `trg_fichas_no_delete` (bloqueia delete físico), `trg_fichas_congela` (bloqueia update em produção congelada). SELECT visível por **unidade** (`ver_fichas_da_unidade`), dono, ou **município** (`ver_fichas_do_municipio`). Excluir/retificar via RPCs `excluir_ficha`/`retificar`.
- **Armadilha:** `insert().select()` com RLS — o insert grava mas o `.select()` de volta pode não enxergar a linha (política de SELECT), retornando "erro" mesmo tendo salvo. Trate o erro real (ver `src/lib/erros.ts` → `mensagemErroBanco`).

---

## 5. O que foi construído (histórico recente — para contexto)

- **Modelo de 2 competências** (folha × movimento) + seletor de movimento compartilhado; default de competência = **movimento em aberto** em todas as telas.
- **TFD:** faturamento **retroativo** (lançar viagem de julho no movimento de agosto), **calendário de viagens** (marcar dias, seletor explícito de pernoite 🌙, navegação de mês).
- **Crivos inteligentes:** procedimento 10 díg (bloqueia incompleto), idade ≤130, data com ano de 4 díg/sem futuro, competência ≤ movimento, **duplicidade na mesma folha** (paciente+procedimento+data bloqueia) e **aviso entre folhas** (RPC `duplicatas_bpai_outras_folhas` + link "abrir para conferir").
- **FPO Magnético `.IMP`:** importador **nativo** (arquivo cifrado — cifra de substituição de 10 símbolos decifrada; ver memória `fpo-magnetico-imp-importador`). Lê várias unidades de uma vez.
- **Nacionalidade:** a tela mostra o código do BPA (`010/020/030`), não a situação 1/2/3.
- **EDITAR FICHA:** ficha salva entra **travada** (`src/components/TravaEdicaoFicha.tsx`); botão libera. Aplicado a BPA‑I/BPA‑C/RAAS.
- **Editor de coordenadas** (só super‑admin): `src/components/bpa-i-v3/EditorCoordenadas.tsx` — arrasta um retângulo na folha e devolve `left/top/width/height` em % (para posicionar campos sem adivinhar).
- **CNES:** sync remove profissional que saiu do estabelecimento.
- **Campo CNS/CPF:** não trava mais como CPF no 11º dígito (deixa completar um CNS de 15).
- **`gerir_pacientes`:** permissão própria do cadastro (desacoplada do TFD).
- **Erros:** `salvarPaciente` mostra o **motivo real** (permissão/duplicidade) em vez de "Falha ao salvar".
- **Exportar p/ SIA:** botão "Baixar para o SIA" (PA + `RELEXP.PRN`), nome de arquivo correto.

> A base de conhecimento detalhada (com fatos não‑óbvios e por‑quês) está nas **memórias do projeto** — se você é uma sessão do Claude Code neste projeto, o índice `MEMORY.md` é carregado automaticamente. Leia as memórias antes de mexer em `.MAR`, faturamento, permissões, importação e SIGTAP.

---

## 6. Armadilhas / regras de ouro

1. **Não deduzir o layout do BPA Magnético** por conta própria — ler as fontes (`bpa-magnetico.ts`, `fechamento-mes.ts`) e/ou inspecionar `.MAR/.JUN` reais.
2. **PostgREST tem teto de 1.000 linhas** por consulta — some no cliente exige paginar (`buscarTodasPaginado`). Já causou dashboard errado e "Minhas Fichas" só 200.
3. **Edge functions:** `npm:` (não `esm.sh`); a management API PATCH corta os 4 primeiros bytes (padding de 4 espaços) — prefira o **CLI** `supabase functions deploy`.
4. **Campos em MAIÚSCULAS** é convenção global (inputs/textarea em uppercase, exceto e‑mail/senha/número/data). `data-nocaps` para exceções.
5. **Congelamento:** produção exportada trava as fichas — para alterar, reabrir/retificar, não force update.
6. **Golden do `.MAR`:** V3 e V4 têm que gerar o mesmo arquivo — o teste `equivalencia.golden.test.ts` protege isso. Mudou o gerador? Rode os testes.
7. **Datas do TFD (legado):** já houve datas corrompidas (ano com dígito a mais) — o calendário e os crivos hoje tratam/mostram, mas cuidado ao mexer.

---

## 7. Onde procurar cada coisa (índice rápido)

| Preciso mexer em… | Vá para… |
|---|---|
| Geração do `.txt`/`.MAR` | `src/lib/bpa-i-v2/bpa-magnetico.ts`, `src/lib/fechamento-mes.ts`, `src/routes/fechamento.tsx` |
| Layout/posição dos campos da folha | `src/lib/bpai-v2-layout.ts` (`L.REL`) + `EditorCoordenadas` |
| Crivos/obrigatórios do BPA‑I | `src/lib/bpa-i-v3/obrigatorios.ts`, `use-validacao-procedimento.ts` |
| Motor do BPA‑I (estado/salvar) | `src/lib/bpa-i-v3/engine.ts` |
| Movimento/faturamento/competência | `src/lib/faturamento.ts` |
| Pacientes | `src/lib/pacientes.ts` |
| Profissionais/CNES | `src/lib/bpa-i-v2/profissionais.ts` + edge `cnes-profissionais` |
| Permissões | `src/lib/permissoes.ts`, `src/routes/admin.tsx`, tabelas `permissoes`/`papel_permissoes`/`vinculo_permissoes` |
| FPO (import/compara) | `src/lib/fpo/*`, `src/routes/fpo.tsx` |
| TFD | `src/lib/tfd/tfd.ts`, `src/routes/tfd.tsx` |
| Erros do banco → PT‑BR | `src/lib/erros.ts` |
