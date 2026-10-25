# Área do aluno: banco e testes de acesso

Registro histórico da etapa inicial de ativação em 2026-10-24 (não representa o estado atual da publicação): projeto de teste `rlgxtgxqhpvnfghcmkmu` criado por Gabriel, cadastro público desabilitado, migrações 001 e 002 aplicadas e teste SQL completo aprovado, incluindo as novas asserções de operação Storage. A releitura encontrou zero registros sintéticos e bucket privado. URL e chave **publicável** estão em `dados/portal-config.json`. SMTP salvo no painel e verificado; entrega de e-mail ainda pendente. Professor inicial, Edge Function, teste HTTP, fluxos reais de Auth e publicação continuam pendentes.

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

Definir **somente no ambiente da Edge Function** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PORTAL_ALLOWED_ORIGIN=https://profgabrielpiovesana.github.io` e `PORTAL_AUTH_REDIRECT_URL=https://profgabrielpiovesana.github.io/profgabrielpiovesana/conta.html`. O código rejeita outra origem ou caminho de callback. Em Authentication → URL Configuration, usar `https://profgabrielpiovesana.github.io/profgabrielpiovesana/conta.html` como **Site URL** e permitir exatamente esse mesmo endereço em **Redirect URLs**, sem curinga. Site URL é o destino padrão dos retornos de Auth, inclusive de recuperações enviadas pelo painel sem endereço explícito. A página pública do site continua em `https://profgabrielpiovesana.github.io/profgabrielpiovesana/`; ela não processa links de convite ou recuperação. A origem permitida para CORS é somente `https://profgabrielpiovesana.github.io`, sem barra final; o navegador nunca escolhe o retorno da Edge Function. Implantar `supabase/functions/gerenciar-alunos` apenas neste projeto, depois da configuração segura. Confirmar nomes de variáveis no painel sem exibir valores secretos. Configurar SMTP antes de qualquer convite real; usar somente um endereço de teste autorizado por Gabriel na validação de e-mail.

Em 2026-10-24, após confirmação de Gabriel, a Site URL foi corrigida para o callback HTTPS acima; a lista de Redirect URLs permaneceu com esse endereço exato. Se um link antigo abrir a página pública em vez de “Definir senha”, solicitar um novo link em “Esqueci minha senha”. Não copiar tokens nem tentar reaproveitar o link antigo. Um novo e-mail solicitado pelo site chegou ao Gmail de Gabriel; a conclusão da troca de senha ainda precisa ser confirmada.

Gabriel escolheu Gmail como remetente, sem domínio próprio. A configuração SMTP foi salva por Gabriel e verificada no painel. Nenhuma senha é registrada aqui. A recuperação solicitada pelo site teve entrega confirmada no Gmail de Gabriel em 2026-10-24; isso ainda não comprova a conclusão da troca de senha. Configuração salva, sozinha, não comprova entrega.

Na validação local inicial do convite da própria conta de professor, autorizada por Gabriel, foi usado temporariamente `http://127.0.0.1:8767/conta.html`. Esse registro é histórico: não restaurar esse endereço na configuração de produção. O retorno local exigia o servidor local ativo e servia apenas à etapa inicial de ativação; ele não comprova o fluxo no GitHub Pages. A configuração atual deve usar o callback HTTPS acima tanto em Site URL quanto em Redirect URLs; a Edge Function também exige esse callback de produção.

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

Registro histórico dos limites de verificação antes da ativação e publicação; os demais resultados posteriores não foram reavaliados nesta correção de callback. O teste SQL passou no projeto isolado em 2026-10-23; isso prova consultas e gravações no Postgres com papéis sintéticos, mas não autenticação real nem o caminho HTTP do Storage. O teste HTTP ainda precisa passar e comprovar acesso ao PDF por Storage, inclusive bloqueio imediato após desativar, desassociar ou retirar publicação. Também faltam fluxos reais de convite, senha, recuperação, saída, permissões via API, navegador em computador e celular e verificação do Pages publicado. Um arquivo já baixado não pode ser recolhido.

## Contratos da revisão final

`listar-alunos` inclui `invitationStatus: "pending" | "confirmed"`, derivado no servidor de Auth. Os únicos outros campos são `user_id`, `nome`, `email`, `ativo`. Confirmação e ativação são estados independentes; reenviar convite não reativa matrícula. A confirmação é consultada pelo `user_id` imutável; mudança de e-mail em Auth não bloqueia a listagem nem altera a matrícula. Falha na consulta ou conta ausente faz a listagem falhar, sem assumir confirmação. O painel oferece reenvio apenas para convite pendente.

O preflight da Edge Function permite explicitamente `authorization, apikey, content-type, x-client-info`, incluindo o cabeçalho enviado pelo SDK fixado em 2.75.0. O teste local usa o bundle real com fetch simulado, sem acessar serviços.

O teste HTTP isolado exige que um aluno ativo e destinatário baixe o PDF e seja impedido de criar URLs assinadas individuais e em lote. As simulações SQL de `storage.operation` não substituem essa aceitação HTTP. Fonte das operações: https://github.com/supabase/storage/blob/master/src/http/routes/operations.ts; helpers: https://supabase.com/docs/guides/storage/schema/helper-functions.

## Correções locais da auditoria — 2026-10-24

Gabriel aprovou A-1, A-2, A-3, A-6 e a ampliação A-4. O diff local corrige edição concorrente, tratamento de falha na saída, preservação do formulário durante ações independentes e limites de nome/e-mail. Não houve publicação, deploy ou aplicação remota nesta etapa.

A migração incremental `supabase/migrations/202610240004_preserve_material_publication.sql` deve ser aplicada após as migrações anteriores, incluindo `202610240003_service_role_grants.sql`. Ela substitui `save_material` mantendo assinatura, autorização, bloqueio de linha e transação de metadados/destinatários. Edição ignora `publicado`, inclusive o valor obsoleto de clientes antigos; criação exige publicação inicial booleana. Instalações existentes precisam desta migração; aplicar e verificar a 004 antes de publicar o cliente atualizado. Atualizar apenas o JavaScript não basta.

No projeto isolado, aplicar as migrações na ordem e executar `psql -v ON_ERROR_STOP=1 -f supabase/tests/portal_access.sql` (ou o arquivo completo no SQL Editor). Os novos casos verificam retirada seguida de payload obsoleto e atualização sem `publicado`. Esses casos SQL foram preparados, mas não executados nesta etapa: não há PostgreSQL local e não foi autorizado teste remoto.

O teste `tests/live/portal-access.test.mjs` mantém URLs únicas para testar a origem e acrescenta a mesma URL estável, aquecida com sucesso e os bytes esperados antes de cada revogação. Depois de desativar, desassociar ou retirar publicação, exige negação com a mesma URL e o mesmo JWT. Não aceita HTTP 200 após revogação nem troca a URL para esconder cache. Execute pelo procedimento isolado acima somente com autorização. O comportamento real do CDN/cache continua sem validação nesta etapa; os testes locais não certificam revogação HTTP imediata.

Atualização posterior em 2026-10-24: migração 004 aplicada manualmente pelo SQL Editor no projeto existente, corpo confirmado por hash e permissões relidas; contagens de dados preservadas. Os testes SQL/HTTP continuam pendentes em ambiente separado, pois o projeto existente já tem uma matrícula e duas contas. Frontend ainda não publicado.

## Transição aprovada para entrega por Edge Function — 2026-10-24

Esta seção sucede os registros históricos acima. O coordenador confirmou no projeto descartável `ltudhfyhcigmkexrgect` que a URL Storage aquecida continuou respondendo 200 após desativação, embora a origem negasse. Repetiu com upload `max-age=0` e observou HIT com `private, max-age=0, must-revalidate`. Essa evidência foi recebida pelo implementador; ele não executou acesso remoto nesta etapa. Gabriel aprovou substituir o download direto do aluno por autorização em cada pedido à função `baixar-material`.

O novo contrato é POST JSON `{ "id": "UUID-do-material" }`. A função valida Auth, lê `object_path` com o JWT do solicitante sob RLS e somente então baixa administrativamente do bucket fixo. Não aceita caminho, URL, bucket ou identidade no payload e não encaminha headers/query do solicitante ao Storage administrativo. Respostas são `private, no-store`, `Pragma: no-cache` e `Vary: Origin, Authorization`, com CORS restrito. Os bytes saem como `application/octet-stream` para o SDK 2.75.0 retornar Blob; o cliente os identifica como PDF para abrir/baixar. GET e HEAD não entregam PDF.

A migração incremental `202610240005_storage_server_downloads.sql`, após 001–004, restringe o SELECT direto de Storage a professor. Aluno ativo destinatário também fica impedido de baixar, listar e assinar diretamente; metadados e autorização de materiais mantêm RLS. O teste SQL passa a exigir negação direta para aluno e controle positivo de professor. O teste HTTP mantém as duas rotas diretas, URLs inéditas para origem, controles de metadados/assinatura/listagem e cleanup; entrega e revogação usam o mesmo POST, URL, corpo e JWT, incluindo tentativas Range/condicionais.

Sequência a cargo do coordenador, após revisão independente: implantar `baixar-material` apenas no projeto descartável, reutilizando `PORTAL_ALLOWED_ORIGIN` HTTPS e as opções de cliente servidor existentes; aplicar 005; executar o SQL completo e a suíte HTTP isolada; confirmar ausência das fixtures depois. A configuração da função usa as variáveis servidor já existentes, sem credencial nova no frontend. A execução real da nova função/policy e a validação de CDN permanecem pendentes neste diff; testes locais não as substituem.

Antes de qualquer transição de produção, reler tabelas e objetos: o registro anterior era zero materiais/objetos. Se houver arquivos ou URLs legados, interromper o rollout automático e tratar invalidação/comprovar negação das URLs antigas. A nova policy não certifica remoção de bytes já em cache; arquivos já recebidos não podem ser recolhidos. Esta etapa não publica frontend nem altera produção.

Aceitação posterior: 001-005 e ambas Edge Functions implantadas somente em portal-auditoria-testes (ltudhfyhcigmkexrgect). Suíte SQL completa e HTTP real passaram; mesmo endpoint/JWT negado após as três formas de revogação, aluno sem Storage direto, limpeza relida com zero fixtures. 99 testes locais passaram. .env.example aponta a este ambiente descartável; arquivo temporário com credenciais apagado. Produção permanece com 004 e frontend anterior, aguardando rollout autorizado da entrega nova.

Rollout autorizado: função baixar-material e policy005 aplicadas em produção após releitura confirmar zero PDFs; 1 matrícula,1 professor e2 contas preservados. Cliente atualizado deve acompanhar este rollout. O projeto de testes e suas chaves não substituem dados/portal-config.json de produção.
