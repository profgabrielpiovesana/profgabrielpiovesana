# Área do aluno: banco e testes de acesso

Estado em 2026-10-23: migração e testes preparados, **sem projeto Supabase configurado ou validação real**. Esta é a primeira parte da configuração; convites, SMTP, Edge Function, interface e publicação serão documentados nas próximas tarefas.

## Configurar um projeto de teste isolado

1. Criar um projeto Supabase dedicado a testes, sem alunos nem PDFs reais. Desabilitar cadastro público em Authentication. Guardar URL, chave publicável e chave `service_role` somente no ambiente local seguro; a chave privilegiada nunca vai para navegador, GitHub Pages ou Git.
2. Aplicar `supabase/migrations/202610230001_portal.sql` com o SQL Editor ou conexão segura. A migração cria quatro tabelas com RLS, funções de autorização, o bucket privado `materiais-alunos` e suas políticas. O bucket aceita apenas `application/pdf` até **20.000.000 bytes**. O limite global de arquivos do projeto deve permitir esse tamanho.
3. Executar `supabase/tests/portal_access.sql` com `psql -v ON_ERROR_STOP=1 -f supabase/tests/portal_access.sql` ou runner SQL compatível. O script cria usuários sintéticos dentro de uma transação e termina em `ROLLBACK`; não o executar em projeto com dados reais. Se o runner envolver o arquivo em transação própria, executar as asserções dentro dela sem commit.
4. Para HTTP real, fornecer `PORTAL_LIVE_OPT_IN=YES_ISOLATED_TEST_PROJECT`, `PORTAL_LIVE_TEST_PROJECT=true`, `PORTAL_LIVE_TEST_PROJECT_REF` (subdomínio do projeto), `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` pelo ambiente seguro. Executar `npm run test:live`. O teste cria quatro contas sintéticas e um PDF sintético, verifica os bytes, faz revogações na mesma sessão e tenta limpar **somente** os identificadores que criou. Se falhar no meio, conferir a limpeza no projeto de teste antes de repetir. Nunca apontar esse teste para produção.
5. `npm test` roda somente testes locais, sem rede nem credenciais. Ausência de configuração em `npm run test:live` é falha explícita, não teste ignorado.

## Bootstrap e uso do professor

A tabela `professores` não aceita escrita do navegador. O esquema `private` deve permanecer fora dos esquemas expostos pela API. Após criar a conta de Gabriel pelo fluxo seguro de Auth, obter seu UUID e inseri-lo explicitamente na tabela por SQL administrativo:

```sql
insert into public.professores(user_id) values ('UUID_DA_CONTA_DE_GABRIEL');
```

Nunca promover automaticamente o primeiro visitante. O papel de professor depende da linha protegida no banco. A futura função de convites usa credenciais privilegiadas apenas no servidor.

O painel envia o PDF uma vez pelo Storage API com nome gerado em formato UUID `.pdf`, depois chama `save_material`. A RPC valida o professor, metadados e todos os destinatários antes de gravar material e associações numa única transação. Alterações preservam o caminho e nome original. Um upload sem registro fica inacessível a alunos e deve ser limpo pelo painel ao falhar; apagar apenas o caminho criado pela tentativa atual. Não usar links assinados persistentes para download do aluno.

## Limites de verificação

Os testes SQL e HTTP precisam ser executados contra um projeto de teste real antes de afirmar que as políticas funcionam. O teste SQL prova consultas e gravações no Postgres; o teste HTTP prova acesso ao PDF por Storage, inclusive bloqueio imediato após desativar, desassociar ou retirar publicação. Um arquivo já baixado não pode ser recolhido.
