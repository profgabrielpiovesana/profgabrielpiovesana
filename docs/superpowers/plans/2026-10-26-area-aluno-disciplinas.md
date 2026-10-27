# Área do aluno por disciplina — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Entregar navegação disciplina → categoria → PDFs autorizados.
**Architecture:** Estender os metadados existentes e o controlador de filtragem; navegação local no entry.mjs; CSS limitado ao aluno. Migração incremental mantém registros antigos sem classificação.
**Tech Stack:** HTML, CSS, SVG, JavaScript ESM, Supabase PostgreSQL.
**Spec:** docs/superpowers/specs/2026-10-26-area-aluno-disciplinas.md

## Global Constraints
- Sem dependências novas. Contas, RLS e entrega privada preservadas.
- Disciplina obrigatória para publicar/editar; nunca inferida do título.
- Layout do professor preservado, exceto campo e rótulo de disciplina.

## Review Focus
- Legados sem disciplina continuam acessíveis em Outros materiais.
- Mesmos títulos em disciplinas distintas não misturam resultados.
- Voltar/trocar disciplina limpa pesquisa e categoria anterior.
- Logout cancela downloads e remove conteúdo, nome e seleção do aluno.
- Edição conserva disciplina e estado de publicação, inclusive retirados.

### Task 1: Metadados e filtragem
**Files:** rules.mjs, aluno.mjs, api.mjs, professor.mjs, entrar.html; migração 006; testes portal/live/SQL.
**Interfaces:** `metadata.subject`, resposta `subject`, `filter(query, type, subject)`; subject aceita matematica/fisica; filtro `outros` seleciona legados.
- [x] Testar validação de disciplina ausente/inválida, roundtrip de API e filtragem combinada.
- [x] Executar testes; esperar falhas nas novas asserções antes de implementar.
- [x] Acrescentar coluna nullable com check e atualizar RPC exigindo valor válido nos novos saves; preservar update de publicação da 004.
- [x] Propagar campo pelo formulário, API, controlador e fixtures, incluindo testes SQL/live.
- [x] Executar `npm test`; esperar zero falhas; commit da fatia.

### Task 2: Navegação e visual
**Files:** entrar.html, estilos/portal.css, scripts/portal/entry.mjs, imagem/portal/*.svg, tests/portal/entry.test.mjs.
**Interfaces:** Usa `library.filter(query,type,subject)`; botões de disciplina e categoria; botões Início/Voltar; estado reiniciado ao entrar/sair.
- [x] Testar percurso completo, filtros, vazios, voltar e logout com download em curso.
- [x] Executar testes; esperar falhas nas novas asserções antes de implementar.
- [x] Implementar cartões SVG próprios, navegação acessível e estilos escopados ao aluno.
- [x] Executar `npm test`; esperar zero falhas.
- [x] Conferir navegador com dados sintéticos em 320/768/1024/1440px, teclado e estados vazios; revisar diff com agente independente.
- [x] Registrar resultados e limitações; manter publicação pendente para revisão do resultado concreto.


## Resultado — 2026-10-27
- 106 testes passaram com `node --test --test-isolation=none tests/portal/*.test.mjs`; `npm test` também passou.
- Migração 006 + suíte `supabase/tests/portal_access.sql` executadas em uma transação no projeto isolado `ltudhfyhcigmkexrgect`: todas as asserções passaram. Rollback conferido por nova consulta: 0 alunos, 0 materiais, 0 usuários sintéticos e coluna disciplina ausente.
- Navegador com API simulada: navegação completa, busca, vazios, edição do professor e teclado; 320/768/1024/1440px sem excesso horizontal. Console sem erros.
- Revisão independente: um P2 de contraste no atalho de pular conteúdo, reproduzido e corrigido; cor verificada no navegador. Ajustado também o nome na saudação após usar h1.
- Limites: não foi repetida a suíte HTTP com upload/download real nesta mudança. A prévia usa dados fictícios; não é conexão autenticada ao Supabase.
- Publicação pendente: aplicar 006 ao banco antes de enviar frontend para main; pedir aos professores com aba antiga aberta que recarreguem.
- Implementação no checkout existente limpo, em branch própria, sem criar worktree. Autorização para começar permitiu executar diretamente sem nova rodada de aprovação do plano.
