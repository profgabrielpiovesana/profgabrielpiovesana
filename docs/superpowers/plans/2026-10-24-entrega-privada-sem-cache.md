# Entrega privada por pedido — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** fechar o acesso por cache após revogação com entrega autorizada no servidor.

**Architecture:** nova Edge Function com Auth e consulta RLS usando JWT, seguida de Storage administrativo interno; alunos sem SELECT direto em objetos. Cliente continua recebendo Blob para PDF.

**Tech Stack:** módulos ESM, node:test, Supabase/Deno 2.75.0, PostgreSQL.

**Spec:** docs/superpowers/specs/2026-10-24-entrega-privada-sem-cache.md

## Global Constraints

- Sem novas dependências ou mudanças de bundle vendor.
- Sem credenciais em código, e-mails reais, produção ou dados reais em testes.
- Sem push/commit/deploy pelo Coder; coordenador implanta somente após revisão.
- Preservar quatro fixes anteriores, migração 004 e alterações alheias.
- Não aceitar 200 após revogação, não usar cache-busting no novo endpoint.

## Review Focus

- JWT inválido ou aluno sem matrícula nunca alcança Storage administrativo.
- Caminho vem apenas de consulta RLS, nunca de parâmetro não confiável.
- Todas as respostas, inclusive erros, são no-store; cabeçalhos do cliente não autorizam acesso.
- SDK 2.75.0 interpreta binário sem corrupção e preview recebe MIME PDF.
- Política nova fecha Storage direto sem quebrar uploads/limpeza do professor.

### Task 1: Entrega autorizada, cliente e regressões

Files: novos supabase/functions/baixar-material/index.ts e handler.mjs, migração 202610240005_storage_server_downloads.sql, scripts/portal/api.mjs, testes portal/live/SQL e docs correspondentes.

- [x] Escrever regressões de handler, API/bundle real e políticas/casos HTTP conforme spec; registrar falhas antes do fix.
- [x] Implementar handler/adapter mínimo a partir dos padrões existentes, sem abstrações compartilhadas novas.
- [x] Adicionar migração restritiva mantendo professor; atualizar SQL para expectativa aprovada de negação direta.
- [x] Alterar downloadMaterial e preservar UI de preview/download.
- [x] Atualizar teste live para autorização por endpoint e negação de Storage direto; preservar controles de RLS e cleanup.
- [x] Rodar npm test, suite detalhada, syntax e diff --check. Documentar novos passos de transição e limites.
- [x] Revisão independente de conformidade e qualidade; corrigir findings e revalidar.
- [x] Coordenador implantar isoladamente, executar SQL/HTTP reais e confirmar limpeza, sem publicar produção.
