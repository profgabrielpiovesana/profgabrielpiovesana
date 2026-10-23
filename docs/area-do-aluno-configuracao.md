# Área do aluno: banco e testes de acesso

Estado em 2026-10-23: migração, testes e código da função de convites preparados, **sem projeto Supabase configurado ou validação real**. SMTP, interface e publicação ainda dependem das próximas etapas.

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

Nunca promover automaticamente o primeiro visitante. O papel de professor depende da linha protegida no banco. A função de convites usa credenciais privilegiadas apenas no servidor.

## Convites e Edge Function

Após configurar o projeto de teste, definir **somente no ambiente da Edge Function** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PORTAL_ALLOWED_ORIGIN` e `PORTAL_AUTH_REDIRECT_URL`. A origem é exata (por exemplo `https://gabrielpiovesana.github.io`); o retorno deve ser uma URL HTTPS na mesma origem, dentro de `/profgabrielpiovesana/`. Configurar essa URL exata também em Authentication → URL Configuration → Redirect URLs, com Site URL correto. O navegador nunca escolhe o retorno. Configurar SMTP antes de enviar qualquer convite real. Implantar `supabase/functions/gerenciar-alunos` somente no projeto autorizado; **não implantar nem enviar convites para endereços reais como teste**.

O cliente chama `POST /functions/v1/gerenciar-alunos` com `Authorization: Bearer <JWT>` e JSON. O servidor verifica o JWT em Auth, consulta `professores` com RLS usando esse JWT e só então acessa a API administrativa. `Origin` divergente recebe 403. Respostas JSON têm `error` estável em falhas; dados de aluno contêm apenas `user_id`, `nome`, `email`, `ativo`.

| `action` | Campos | Resposta |
| --- | --- | --- |
| `convidar` | `nome`, `email` | 201 `{ "aluno": ... }`; duplicado/conta confirmada: 409 |
| `completar-matricula` | `nome`, `email` | 201 `{ "aluno": ... }` para conta Auth já confirmada sem matrícula; matrícula existente: 409 |
| `reenviar-convite` | `user_id` | 200 `{ "aluno": ... }`; conta confirmada: 409 |
| `listar-alunos` | nenhum | 200 `{ "alunos": [...] }` |
| `definir-ativo` | `user_id`, `ativo` booleano | 200 `{ "aluno": ... }` |

O convite usa o template de e-mail do Supabase Auth. Um link expirado exige `reenviar-convite` para matrícula existente; uma conta já confirmada com matrícula usa recuperação de senha, não outro convite. Reenviar não altera `ativo`; reativação exige `definir-ativo`. Se o e-mail sair mas a gravação de `alunos` falhar, a resposta é 502 `matricula_pendente`: o aluno segue sem acesso por não ter matrícula. Se a conta Auth já foi confirmada, o professor usa `completar-matricula` para vincular seu identificador à nova linha sem enviar outro e-mail; se ainda não foi confirmada, tenta `convidar` novamente. A operação de recuperação rejeita uma matrícula existente, inclusive inativa, e não a substitui nem reativa. O usuário Auth existente não é apagado. A busca de usuários Auth percorre páginas de 1.000 itens, o que basta para este projeto pequeno, mas o custo cresce com o número total de contas.

Referências: [convites e conta confirmada](https://supabase.com/docs/guides/auth/users#inviting-users), [API `inviteUserByEmail`](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [paginação de usuários](https://supabase.com/docs/reference/javascript/auth-admin-listusers), [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).

O painel envia o PDF uma vez pelo Storage API com nome gerado em formato UUID `.pdf`, depois chama `save_material`. A RPC valida o professor, metadados e todos os destinatários antes de gravar material e associações numa única transação. Alterações preservam o caminho e nome original. Um upload sem registro fica inacessível a alunos e deve ser limpo pelo painel ao falhar; apagar apenas o caminho criado pela tentativa atual. Não usar links assinados persistentes para download do aluno.

## Limites de verificação

Os testes SQL e HTTP precisam ser executados contra um projeto de teste real antes de afirmar que as políticas funcionam. O teste SQL prova consultas e gravações no Postgres; o teste HTTP prova acesso ao PDF por Storage, inclusive bloqueio imediato após desativar, desassociar ou retirar publicação. Um arquivo já baixado não pode ser recolhido.
