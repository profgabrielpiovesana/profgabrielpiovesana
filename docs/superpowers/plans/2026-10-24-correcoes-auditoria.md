# Correções da auditoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** implementar os quatro fixes e a ampliação de teste aprovados por Gabriel.

**Architecture:** manter módulos cliente, controlador de painel, Edge Function e RPC existentes. Corrigir publicação no servidor por migração incremental e manter testes de origem separados dos testes de URL aquecida.

**Tech Stack:** JavaScript ESM, node:test, VM DOM de testes, PostgreSQL/Supabase.

**Spec:** docs/superpowers/specs/2026-10-24-correcoes-auditoria.md

## Global Constraints

- Sem novas dependências; preservar controles e validação do servidor.
- Sem push, deploy, credenciais ou testes mutáveis remotos.
- Sem alterar migrações históricas; adicionar migração incremental.
- Sem pular testes ou aceitar resposta 200 após revogação.
- Preservar alterações alheias e o relatório da auditoria.

## Review Focus

- Cliente antigo envia publicado obsoleto: servidor deve preservar estado corrente.
- signOut retorna error sem rejeitar Promise: UI não anuncia sucesso e permite repetir.
- Refresh do painel reconstrói checkboxes: preservar seleção corrente válida e arquivo.
- Sair durante operação pendente: resultado tardio não restaura painel/rascunho.
- URL aquecida após cada revogação: afirmar negação sem mudar URL nem JWT.

### Task 1: Correções integradas em três sprints

**Files:** scripts/portal/{api,auth,entry,professor,rules}.mjs; entrar.html; tests/portal/*; tests/live/portal-access.test.mjs; supabase/migrations/nova_migracao.sql; supabase/tests/portal_access.sql; docs/area-do-aluno-configuracao.md.

**Interfaces:** preservar createPortalApi, createAuthController e mountProfessorPanel; save_material mantém assinatura, edição preserva publicado e criação valida publicação inicial. Nenhum novo consumidor externo.

#### Sprint 1 — A-1 e A-2

- [x] Localizar chamadores e testes; escrever regressão cliente de retirada concorrente e saída com error/exceção, incluindo consumidor UI; observar falha antes do fix.
- [x] Remover publicado do payload de edição e criar migração incremental substituindo save_material para preservar publicação sob bloqueio no ramo update, inclusive payload antigo.
- [x] Acrescentar regressões SQL para edição com payload obsoleto e sem publicado; manter criação/autorização/destinatários atômicos.
- [x] Tratar error retornado em logout e resultado na UI, com retry e sem falsa mensagem de saída; manter limpeza de dados sensíveis.
- [x] Rodar regressões específicas e registrar resultados, distinguindo SQL preparado de SQL executado.

#### Sprint 2 — A-3 e A-6

- [x] Criar testes DOM que demonstrem perda de rascunho/arquivo/seleção nas ações independentes e testes 160/161 e 254/255; observar falhas antes dos fixes.
- [x] Separar reset pós-salvamento das ações independentes; preservar seleção durante render, reconciliar desativação com aviso e respeitar generation/cancelamento.
- [x] Alinhar validação e maxlength do formulário sem extrair abstração compartilhada entre runtimes.
- [x] Rodar testes de painel, limites e saída/cancelamento.

#### Sprint 3 — A-4 e fechamento

- [x] Acrescentar controles positivos de URL estável aquecida e negativos com mesma URL/JWT para cada revogação, mantendo controles de origem.
- [x] Documentar migração incremental, execução isolada e risco de cache pendente de teste real. Atualizar relatório para refletir aprovação e implementação local sem alegar publicação.
- [x] Rodar npm test e git diff --check; registrar comandos e limitações em relatório do Coder.
- [x] Revisão independente de conformidade e qualidade pelo coordenador; corrigir findings comprovados e verificar novamente apenas o necessário.

Sem commits automáticos nesta execução; entregar diff revisável na branch codex/correcoes-auditoria-portal. Acompanhamento por ledger do plano e relatório do Coder.
