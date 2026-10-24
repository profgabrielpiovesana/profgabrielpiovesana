# Área do aluno: banco e testes de acesso

Estado em 2026-10-24: projeto de teste `rlgxtgxqhpvnfghcmkmu` criado por Gabriel, cadastro público desabilitado, migrações 001 e 002 aplicadas e teste SQL completo aprovado, incluindo as novas asserções de operação Storage. A releitura encontrou zero registros sintéticos e bucket privado. URL e chave **publicável** estão em `dados/portal-config.json`. SMTP salvo no painel e verificado; entrega de e-mail ainda pendente. Professor inicial, Edge Function, teste HTTP, fluxos reais de Auth e publicação continuam pendentes.

## Configurar um projeto de teste isolado

1. Usar o projeto isolado já criado, sem alunos nem PDFs reais. O cadastro público foi desabilitado no painel; confirmar que continua desabilitado antes da ativação. A URL e a chave publicável podem ficar no JSON do site. A chave `service_role` é exclusivamente de servidor e teste seguro; nunca vai para navegador, GitHub Pages ou Git.
2. A migração `supabase/migrations/202610230001_portal.sql` já foi aplicada ao projeto. Ela cria quatro tabelas com RLS, funções de autorização, o bucket privado `materiais-alunos` e suas políticas. O bucket aceita apenas `application/pdf` até **20.000.000 bytes**. Conferir no painel que o limite global de arquivos do projeto permite esse tamanho.
   Aplicar todas as migrações em ordem: `202610230001_portal.sql`, depois `202610230002_storage_download_only.sql`. Neste projeto ambas já foram aplicadas; em outro projeto com apenas 001 aplicada, executar somente 002. A segunda restringe o SELECT do aluno à operação autenticada de download; criação de URL assinada individual/em lote e listagem do bucket não são autorizadas. O professor mantém acesso administrativo. Verificar antes `to_regprocedure('storage.allow_only_operation(text)')`: deve existir. Se faltar, interromper a ativação e atualizar/verificar o serviço Storage; nunca remover a condição nem usar fallback permissivo. A migração aborta se o helper estiver ausente.
3. O script exato `supabase/tests/portal_access.sql` passou no SQL Editor após 002, incluindo negação de assinatura individual/em lote e controle positivo de download autenticado. A releitura confirmou zero fixtures. Ele cria usuários sintéticos dentro de uma transação e termina em `ROLLBACK`. Reexecutá-lo somente no projeto isolado; se o runner envolver o arquivo em transação própria, executar as asserções dentro dela sem commit.
4. Para HTTP real, fornecer `PORTAL_LIVE_OPT_IN=YES_ISOLATED_TEST_PROJECT`, `PORTAL_LIVE_TEST_PROJECT=true`, `PORTAL_LIVE_TEST_PROJECT_REF` (subdomínio do projeto), `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` pelo ambiente seguro. Executar `npm run test:live` depois de implantar a função. O teste cria quatro contas sintéticas e um PDF sintético, verifica os bytes e as revogações na mesma sessão, apaga somente os identificadores que criou e relê caminhos, IDs e usuários para confirmar a limpeza. Se falhar no meio, conferir a limpeza no projeto de teste antes de repetir. Nunca apontar esse teste para produção.
5. `npm test` roda somente testes locais, sem rede nem credenciais. Ausência de configuração em `npm run test:live` é falha explícita, não teste ignorado.

Use `.env.example` apenas como lista de nomes. Para o teste HTTP, Gabriel insere a chave privilegiada diretamente num arquivo local ignorado pelo Git, fora do chat, com `chmod 600 .env.live`; carregue-o como variáveis do processo com `set -a; . ./.env.live; set +a` em um shell privado e execute `npm run test:live` sem `set -x`, sem despejar o ambiente e sem registrar a saída com credenciais. Após o teste, feche o shell e remova o arquivo local quando ele não for mais necessário. Nunca inserir a chave no comando ou no histórico do shell.

## Bootstrap e uso do professor

A tabela `professores` não aceita escrita do navegador. O esquema `private` deve permanecer fora dos esquemas expostos pela API. Após criar a conta de Gabriel pelo fluxo seguro de Auth no painel, confirmar o endereço autorizado, copiar o UUID exibido e inseri-lo explicitamente na tabela por SQL administrativo:

```sql
insert into public.professores(user_id) values ('UUID_DA_CONTA_DE_GABRIEL');
```

Verificar por consulta administrativa que a linha contém exatamente o UUID escolhido e nenhum outro. Nunca promover automaticamente o primeiro visitante. O papel de professor depende da linha protegida no banco. A função de convites usa credenciais privilegiadas apenas no servidor.

## Convites e Edge Function

Definir **somente no ambiente da Edge Function** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PORTAL_ALLOWED_ORIGIN=https://profgabrielpiovesana.github.io` e `PORTAL_AUTH_REDIRECT_URL=https://profgabrielpiovesana.github.io/profgabrielpiovesana/conta.html`. O código rejeita outra origem ou caminho de callback. Em Authentication → URL Configuration, usar `https://profgabrielpiovesana.github.io/profgabrielpiovesana/` como Site URL e permitir exatamente `https://profgabrielpiovesana.github.io/profgabrielpiovesana/conta.html` em Redirect URLs, sem curinga. A origem permitida para CORS é somente `https://profgabrielpiovesana.github.io`, sem barra final; o navegador nunca escolhe o retorno. Implantar `supabase/functions/gerenciar-alunos` apenas neste projeto, depois da configuração segura. Confirmar nomes de variáveis no painel sem exibir valores secretos. Configurar SMTP antes de qualquer convite real; usar somente um endereço de teste autorizado por Gabriel na validação de e-mail.

Gabriel escolheu Gmail como remetente, sem domínio próprio. A configuração SMTP foi salva por Gabriel e verificada no painel. Nenhuma senha é registrada aqui; a entrega de convite e recuperação por e-mail ainda precisa ser comprovada com o endereço autorizado. Configuração salva não comprova entrega.

Para a validação local do convite da própria conta de professor, autorizada por Gabriel, o retorno temporário em configuração é `http://127.0.0.1:8767/conta.html`. Esse retorno exige o servidor local ativo e serve apenas à etapa de ativação. Antes de publicar, substituir a Site URL temporária e conferir a lista de Redirect URLs para os endereços HTTPS de produção acima; a Edge Function continua exigindo seu callback de produção. Não considerar a configuração local como validação de GitHub Pages.

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

O teste SQL passou no projeto isolado em 2026-10-23; isso prova consultas e gravações no Postgres com papéis sintéticos, mas não autenticação real nem o caminho HTTP do Storage. O teste HTTP ainda precisa passar e comprovar acesso ao PDF por Storage, inclusive bloqueio imediato após desativar, desassociar ou retirar publicação. Também faltam fluxos reais de convite, senha, recuperação, saída, permissões via API, navegador em computador e celular e verificação do Pages publicado. Um arquivo já baixado não pode ser recolhido.

## Contratos da revisão final

`listar-alunos` inclui `invitationStatus: "pending" | "confirmed"`, derivado no servidor de Auth. Os únicos outros campos são `user_id`, `nome`, `email`, `ativo`. Confirmação e ativação são estados independentes; reenviar convite não reativa matrícula. A confirmação é consultada pelo `user_id` imutável; mudança de e-mail em Auth não bloqueia a listagem nem altera a matrícula. Falha na consulta ou conta ausente faz a listagem falhar, sem assumir confirmação. O painel oferece reenvio apenas para convite pendente.

O preflight da Edge Function permite explicitamente `authorization, apikey, content-type, x-client-info`, incluindo o cabeçalho enviado pelo SDK fixado em 2.75.0. O teste local usa o bundle real com fetch simulado, sem acessar serviços.

O teste HTTP isolado exige que um aluno ativo e destinatário baixe o PDF e seja impedido de criar URLs assinadas individuais e em lote. As simulações SQL de `storage.operation` não substituem essa aceitação HTTP. Fonte das operações: https://github.com/supabase/storage/blob/master/src/http/routes/operations.ts; helpers: https://supabase.com/docs/guides/storage/schema/helper-functions.
