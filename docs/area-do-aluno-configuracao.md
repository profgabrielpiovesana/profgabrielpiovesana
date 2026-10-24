# Área do aluno: banco e testes de acesso

Estado em 2026-10-24: projeto de teste `rlgxtgxqhpvnfghcmkmu` criado por Gabriel, cadastro público desabilitado, migração aplicada e teste SQL real aprovado. A releitura encontrou zero registros sintéticos e bucket privado. URL e chave **publicável** estão em `dados/portal-config.json`. Professor inicial, Edge Function, SMTP, teste HTTP, fluxos reais de Auth e publicação continuam pendentes.

## Configurar um projeto de teste isolado

1. Usar o projeto isolado já criado, sem alunos nem PDFs reais. O cadastro público foi desabilitado no painel; confirmar que continua desabilitado antes da ativação. A URL e a chave publicável podem ficar no JSON do site. A chave `service_role` é exclusivamente de servidor e teste seguro; nunca vai para navegador, GitHub Pages ou Git.
2. A migração `supabase/migrations/202610230001_portal.sql` já foi aplicada ao projeto. Ela cria quatro tabelas com RLS, funções de autorização, o bucket privado `materiais-alunos` e suas políticas. O bucket aceita apenas `application/pdf` até **20.000.000 bytes**. Conferir no painel que o limite global de arquivos do projeto permite esse tamanho.
3. O script exato `supabase/tests/portal_access.sql` já passou no SQL Editor após a migração. Ele cria usuários sintéticos dentro de uma transação e termina em `ROLLBACK`. Reexecutá-lo somente no projeto isolado; se o runner envolver o arquivo em transação própria, executar as asserções dentro dela sem commit.
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

Definir **somente no ambiente da Edge Function** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PORTAL_ALLOWED_ORIGIN=https://gabrielpiovesana.github.io` e `PORTAL_AUTH_REDIRECT_URL=https://gabrielpiovesana.github.io/profgabrielpiovesana/conta.html`. O código rejeita outra origem ou caminho de callback. Em Authentication → URL Configuration, usar `https://gabrielpiovesana.github.io/profgabrielpiovesana/` como Site URL e permitir exatamente `https://gabrielpiovesana.github.io/profgabrielpiovesana/conta.html` em Redirect URLs, sem curinga. A origem permitida para CORS é somente `https://gabrielpiovesana.github.io`, sem barra final; o navegador nunca escolhe o retorno. Implantar `supabase/functions/gerenciar-alunos` apenas neste projeto, depois da configuração segura. Confirmar nomes de variáveis no painel sem exibir valores secretos. Configurar SMTP antes de qualquer convite real; usar somente um endereço de teste autorizado por Gabriel na validação de e-mail.

Gabriel escolheu Gmail como remetente, sem domínio próprio. A configuração pretendida no painel Supabase Auth SMTP é host `smtp.gmail.com`, porta `465` com TLS/SSL, usuário igual ao endereço Gmail remetente e senha de app gerada por Gabriel. A senha de app ainda não está disponível; a opção não apareceu mesmo após a ativação de verificação em duas etapas relatada por ele. Não pedir nem transmitir a senha pelo chat: Gabriel a insere diretamente no painel seguro quando estiver disponível. Até lá, convites e recuperação por e-mail não estão validados. O remetente padrão do Supabase é limitado à equipe do projeto e não resolve o envio a alunos reais.

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
