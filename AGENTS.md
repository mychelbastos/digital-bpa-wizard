# AGENTS

## Onboarding
Antes de mexer no projeto, leia **`docs/VISAO-GERAL.md`** — resumo do que é o sistema
(produção ambulatorial do SUS / BPA Magnético para Ruy Barbosa‑BA), como está organizado,
como fazer cada coisa (rodar, deploy, banco, edge functions), **segurança** e as armadilhas.
Fatos não‑óbvios detalhados estão nas memórias do projeto (índice `MEMORY.md`, carregado
automaticamente numa sessão do Claude Code).

## Regras de branch/deploy
- O deploy observa a branch **`main`**: todo commit em `main` dispara o rebuild/publicação.
  Mantenha a branch sempre num estado que **compila** (`npx tsc --noEmit && npm run build`).
- **Não reescrever histórico já publicado** — nada de force‑push, rebase, amend ou squash em
  commits já enviados.
