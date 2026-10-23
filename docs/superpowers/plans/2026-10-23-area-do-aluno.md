# Área do aluno — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution:** Plano aprovado por Gabriel; subagentes por etapa e revisões a cada entrega.

**Goal:** Entregar login por convite, biblioteca individual de PDFs e painel de Gabriel com controle efetivo de acesso.

**Architecture:** Preservar o site estático no GitHub Pages e acrescentar páginas privadas que usam Supabase Auth, Postgres/RLS, Storage privado e uma Edge Function administrativa. A autorização deve ser conferida no servidor em cada leitura e escrita. Reutilizar o visual atual e evitar um framework de interface.

**Tech Stack:** HTML, CSS, JavaScript ESM, Node.js 24 e `node:test`; Supabase JS v2 e esbuild para gerar uma cópia local do SDK do navegador; Supabase Postgres, Storage e Edge Functions.

**Spec:** `docs/superpowers/specs/2026-10-23-area-do-aluno-design.md`, aprovado na conversa de 2026-10-23.

## Global Constraints

- Um professor administrador; cadastro público desabilitado e nenhuma promoção de privilégio pelo aluno.
- Gabriel convida por e-mail; aluno define a própria senha; recuperar senha e sair fazem parte da entrega.
- PDFs privados de até 20 MB por arquivo; definir 20 MB como 20.000.000 bytes na interface e no bucket.
- Ativação/desativação manual; um PDF pode ter vários destinatários sem cópias duplicadas.
- Novos pedidos de listagem/download devem falhar após desativação, mesmo com sessão ainda aberta.
- Biblioteca pública preservada; PDFs privados e dados de alunos ausentes de GitHub/Pages/catálogo público.
- Sem vídeos, cobranças, chat, entrega de respostas ou turmas formais.
- Não versionar segredos nem solicitar senhas/chaves secretas na conversa. Usar nomes gerados para arquivos.
- Serviços e testes reais ainda não configurados: Gabriel informou não ter conta no Supabase.
- Não declarar segurança ou publicação concluída com testes simulados; distinguir as verificações locais e reais.

## Review Focus

- Convite expirado, duplicado ou reenviado para conta inativa: mensagem útil, sem contas duplicadas ou reativação implícita. Tarefa 3.
- Sessão aberta depois de retirar acesso: banco e download negam acesso; a interface não serve como barreira. Tarefas 2 e 6.
- Falha entre upload, metadados e destinatários: nenhum sucesso falso, arquivo não publicado e limpeza segura. Tarefa 5.
- Link de convite/recuperação aberto em outro navegador ou sob `/profgabrielpiovesana/`: fluxo correto, sem redirecionamento aberto. Tarefas 3, 4 e 6.
- PDF com nome malicioso, MIME incorreto, tamanho excedido ou título com HTML: rejeitar o arquivo inválido e exibir dados como texto. Tarefas 1, 2 e 5.

## Mapa de arquivos

- `entrar.html`, `conta.html`, `aluno.html`, `professor.html`: páginas de entrada, definição/recuperação de senha e bibliotecas por papel.
- `scripts/portal/rules.mjs`: validação de campos/PDF e busca/ordenação.
- `scripts/portal/client.mjs`, `api.mjs`: configuração pública, SDK e operações de dados/arquivos.
- `scripts/portal/auth.mjs`, `aluno.mjs`, `professor.mjs`: controladores das páginas.
- `estilos/portal.css`: componentes privados responsivos; `index.html` e ajuste pontual em `estilos/site.css` para o acesso público no celular.
- `dados/portal-config.json`: somente URL/chave pública; inicialmente sem projeto configurado. Nunca conter chave administrativa.
- `scripts/build-sdk.mjs`, `vendor/supabase.mjs`: build reproduzível e SDK para servir pelo próprio Pages.
- `package.json`, `package-lock.json`, `.gitignore`: scripts, dependências fixadas e exclusão de segredos/artefatos.
- `supabase/migrations/202610230001_portal.sql`, `supabase/tests/portal_access.sql`: esquema, políticas e testes reais em transação.
- `supabase/functions/gerenciar-alunos/index.ts`, `handler.mjs`: entrada da Edge Function e lógica administrativa testável.
- `tests/portal/*.test.mjs`, `tests/live/portal-access.test.mjs`: testes locais e integração HTTP real separados.
- `docs/area-do-aluno-configuracao.md`: instalação, bootstrap do professor, SMTP, testes e publicação.

## Sequência e dependências externas

As tarefas 1–5 podem ter código preparado localmente; testes de banco e integração exigem um ambiente Supabase de teste. Não instalar Docker ou um servidor no computador apenas para contornar essa pendência. Neste ambiente há Node/npm, mas não foram encontrados Supabase CLI, Docker, Deno ou psql no PATH.

Se o projeto externo ainda não estiver pronto, manter os testes reais identificados como não executados e continuar apenas o trabalho independente. `npm run test:live` deve falhar explicitamente quando faltar configuração, em vez de retornar uma aprovação vazia. Não aplicar testes destrutivos a um projeto com alunos reais.

### Task 1: contratos e validação de entrada

**Files:** criar `scripts/portal/rules.mjs`, `tests/portal/rules.test.mjs`, `package.json`; modificar `.gitignore`.

**Interfaces:** produzir `validateStudent({name,email})`, `validateMaterial({title,type,date,description,studentIds})`, `validatePdf(file)`, `filterMaterials(items,{query,type})` e `MAX_PDF_BYTES = 20_000_000`. Validação retorna dados normalizados ou erro identificado por campo. Tipo de material: `aula` ou `lista`. A interface usa objetos `Material = {id,title,type,date,description,originalName,objectPath,published,createdAt,studentIds}`; a camada `api.mjs` traduz os nomes de colunas do banco para esse formato.

- [ ] Escrever testes para e-mail inválido, espaços, destinatário repetido/vazio, título vazio, tipo desconhecido, data inválida e busca sem acentos/ordenação decrescente por data e criação.
- [ ] Escrever testes do limite: PDF de 20.000.000 bytes aceito; 20.000.001 bytes rejeitado; arquivo vazio, extensão falsa, MIME incompatível e cabeçalho diferente de `%PDF-` rejeitados. Nome original nunca determina o caminho de armazenamento.
- [ ] Executar `node --test tests/portal/rules.test.mjs` e observar falha pela ausência da implementação.
- [ ] Implementar as funções puras e mensagens por campo; ignorar `.env*` (exceto exemplo sem segredos), `node_modules/`, `supabase/.temp/` e artefatos de teste.
- [ ] Repetir o comando: todos os testes devem passar. Commit `test/feat: validar entradas da área do aluno` com arquivos explícitos.

### Task 2: banco, políticas e armazenamento privado

**Files:** criar migração SQL, testes SQL e `tests/live/portal-access.test.mjs`; iniciar `docs/area-do-aluno-configuracao.md`.

**Interfaces:** tabelas `professores(user_id)`, `alunos(user_id,nome,email,ativo,created_at)`, `materiais_privados(id,titulo,tipo,descricao,data_referencia,object_path,nome_original,publicado,created_at)` e `acessos_materiais(material_id,aluno_id)`. Bucket `materiais-alunos`, privado, MIME `application/pdf`, limite 20.000.000 bytes. Chaves estrangeiras, `object_path` único e associação única garantem integridade. RPC `save_material(p_id uuid, p_metadata jsonb, p_student_ids uuid[]) returns uuid` salva criação/edição e substitui destinatários na mesma transação, exclusivamente para professor; edição preserva o caminho e o nome do PDF original.

- [ ] Escrever primeiro os testes SQL em transação/rollback: professor, aluno A, aluno B, visitante e autenticado sem matrícula. Cada teste tem controle positivo de leitura autorizada e negação dos demais; verificar escrita e tentativa de promoção de privilégios.
- [ ] Escrever testes HTTP reais: PDF conhecido de A retorna bytes corretos a A; B e visitante não o recebem; após desativar A, a mesma sessão não lê dados/arquivo; repetir com associação removida e material retirado. Erro genérico de serviço não vale como prova de autorização.
- [ ] Em ambiente de teste, executar os testes antes das políticas e registrar a falha. Usar o runner SQL do Supabase ou psql com conexão segura; não imprimir credenciais.
- [ ] Implementar migração idempotente no ambiente de desenvolvimento: RLS em todas as tabelas; professor faz CRUD. Aluno pode ler a própria matrícula, inclusive seu estado inativo, para receber a mensagem correta; só lê materiais/associações publicados associados e baixa arquivos enquanto ativo. `professores` não permite escrita ao papel do navegador.
- [ ] Usar funções auxiliares de autorização sem recursão de RLS, com `search_path` fixo e privilégios mínimos. Fazer as políticas de `storage.objects` conferirem o bucket, o caminho vinculado ao material, publicação, associação e matrícula ativa a cada pedido.
- [ ] Dar somente ao professor upload/delete no bucket. Arquivo carregado antes do registro do material não pode ser lido por aluno. Implementar `save_material` validando papel, campos e existência de todos os destinatários; inserir/atualizar material e associações atomicamente. Testar que destinatário inválido reverte toda a operação, preservando a versão anterior.
- [ ] Executar novamente testes SQL e HTTP; esperar sucesso de todos os controles positivos e negativos. Registrar pendência se o serviço externo não estiver disponível. Commit das regras e testes, sem segredos ou PDFs privados.

### Task 3: convites e administração de contas no servidor

**Files:** criar `supabase/functions/gerenciar-alunos/{index.ts,handler.mjs}` e `tests/portal/convites.test.mjs`; ampliar a documentação de configuração.

**Interfaces:** `createHandler({auth,db,allowedOrigins}) -> (Request) => Promise<Response>`. Operações administrativas `convidar`, `reenviar-convite`, `listar-alunos`, `definir-ativo`. Entrada com JSON e Bearer JWT; respostas com erro estável e dados mínimos do aluno. No servidor, validar identidade pelo Supabase Auth e consultar a tabela protegida de professores antes de qualquer operação privilegiada.

- [ ] Escrever testes: sem sessão -> 401, aluno -> 403, origem indevida -> rejeição; falsificar metadados de professor não concede acesso; nenhum serviço administrativo é chamado antes dessas verificações.
- [ ] Testar convite duplicado/expirado, e-mail já confirmado e matrícula inativa. Reenviar convite não altera `ativo`; reativação exige a operação explícita do professor. Falha do provedor ou do banco não retorna sucesso nem apaga conta preexistente.
- [ ] Rodar `node --test tests/portal/convites.test.mjs` e observar falha antes de criar o handler.
- [ ] Implementar handler usando SDK administrativo somente no servidor; segredos via ambiente. Manter os envios no provedor Auth com SMTP configurado. Se a inscrição falhar depois do envio do convite, negar acesso por ausência de matrícula e informar claramente a falha ao professor para recuperação, sem alegar convite concluído.
- [ ] Fixar URLs de retorno por configuração de servidor; nunca aceitar URL arbitrária enviada pelo navegador. Documentar convite expirado e recuperação para conta já confirmada.
- [ ] Repetir testes locais; complementar a suíte real com chamada da função por aluno e professor. Implantar função apenas após vincular projeto autorizado. Commit da função e documentação.

### Task 4: sessão e biblioteca do aluno

**Files:** criar páginas de entrada/conta/aluno, `client.mjs`, `api.mjs`, `auth.mjs`, `aluno.mjs`, `portal.css`, configuração pública, build do SDK e `tests/portal/{auth,aluno}.test.mjs`.

**Interfaces:** `getClient()` falha com mensagem útil se não configurado; `getAccess()` retorna `professor`, `aluno`, `inativo` ou `sem-acesso` após consultar o servidor. API fornece `listMaterials()` e `downloadMaterial(id)`; download retorna Blob após pedido autenticado. Nenhum link público/assinado persistente é guardado como atalho de autorização.

- [ ] Escrever testes de sessão expirada, configuração ausente, conta sem matrícula, conta inativa, login inválido, logout e recuperação. Parâmetro de URL sozinho não autoriza definir senha; exigir fluxo/sessão de convite ou recuperação validado pelo Auth.
- [ ] Testar biblioteca vazia, busca/filtro, nome/título com HTML exibido como texto, erro de download e bloqueio do aluno com sessão aberta. URLs de Blob são descartadas quando não forem mais necessárias; popup de PDF não deve ser bloqueado por ter sido aberto só depois de aguardar o download.
- [ ] Rodar testes com `node --test tests/portal/auth.test.mjs tests/portal/aluno.test.mjs` e observar falha antes dos controladores.
- [ ] Implementar com HTML sem framework. Fixar versões do SDK/esbuild e lockfile; gerar SDK local. Configuração pública só contém URL/chave publicável. Sessões e fluxos de e-mail devem respeitar o subcaminho do Pages; não aceitar redirecionamento externo pelo usuário.
- [ ] Abrir/baixar PDFs por download autenticado; limpar estado e URLs na saída/desativação. Mensagens e estados de erro acessíveis, sem detalhes internos ou informações de terceiros.
- [ ] Executar testes locais e build; conferir em navegador real desktop/celular, inclusive foco/teclado e recuperação de senha. Simulações de serviço provam comportamento da interface, não as políticas. Commit da interface do aluno.

### Task 5: painel do professor e publicação de materiais

**Files:** criar `professor.html`, `scripts/portal/professor.mjs`, `tests/portal/professor.test.mjs`; ampliar `api.mjs` e `portal.css`.

**Interfaces:** API fornece `listStudents()`, `inviteStudent(input)`, `setStudentActive(id,active)`, `publishMaterial({metadata,file,studentIds})`, `updateMaterial(id,{metadata,studentIds})`, `setMaterialPublished(id,published)`. Todas dependem das permissões reais já estabelecidas, não de um papel armazenado no navegador.

- [ ] Escrever testes de envio para múltiplos destinatários com um único upload; validação do arquivo antes de enviá-lo; salvar alterações sem reenviar o PDF; retirar e republicar; ativar/desativar; falhas e reenvio de convite sem botões presos.
- [ ] Testar falha de upload, falha na transação de metadados/destinatários e falha da própria limpeza. Nessas condições o painel não mostra sucesso; arquivo sem material publicado não fica acessível a aluno. Não apagar arquivos de outros materiais em tentativas repetidas.
- [ ] Executar `node --test tests/portal/professor.test.mjs` e observar falha antes da implementação.
- [ ] Implementar formulários, listagem de alunos e seleção de destinatários; caminho do objeto é gerado com UUID. Desativação e retirada são explícitas e reversíveis. Não incluir exclusão definitiva na primeira versão.
- [ ] Usar gravação transacional da tarefa 2 para metadados/associações. Mostrar sucesso somente após confirmação de todas as etapas; ao falhar, limpar apenas o upload desta tentativa quando for seguro e relatar falha de limpeza sem esconder o erro original.
- [ ] Repetir testes e verificar painel com professor e tentativa de acesso como aluno em navegador real. Commit do painel.

### Task 6: integração, configuração real e publicação

**Files:** modificar `index.html` e ajuste pontual em `estilos/site.css`; completar `docs/area-do-aluno-configuracao.md` e testes reais.

**Interfaces:** `npm test` roda testes locais; `npm run build:sdk` gera SDK fixado; `npm run test:live` executa integração no ambiente de teste e exige configuração explícita. A chave administrativa permanece exclusivamente no servidor/teste seguro.

- [ ] Documentar passo a passo: criar projeto Supabase, aplicar migrações, bucket, desabilitar cadastro público, criar professor inicial por UID explicitamente e implantar função. Não usar primeiro visitante como administrador.
- [ ] Configurar projeto/remetente com Gabriel. O SMTP padrão só atende equipe; definir provedor e eventuais custos com ele antes de contratação. Segredos inseridos nos provedores ou ambiente seguro; nunca no chat, no arquivo público ou no Git.
- [ ] Configurar URL principal e retornos de convite/recuperação com `/profgabrielpiovesana/`; testar um endereço autorizado de Gabriel antes de convites reais. Não enviar convites para alunos reais como teste.
- [ ] Rodar todas as verificações locais, SQL e HTTP reais. Testes mutáveis usam contas e PDFs sintéticos em ambiente de teste e limpam somente o que criaram. Guardar resultados sem tokens/dados pessoais.
- [ ] Conferir em navegador real os fluxos completos de professor, alunos A/B, visitante, desativação e reativação. Confirmar que autorização não depende de esconder botões; revisar o acesso privilegiado independentemente antes de publicar.
- [ ] Acrescentar link Área do aluno na navegação pública, visível no celular, e verificar que biblioteca pública/busca permanecem funcionando. `git diff --check` deve passar; revisar staged para ausência de dados privados, segredos e artefatos de teste.
- [ ] Publicar apenas quando configuração e testes reais estiverem completos e a autorização de publicação aplicável estiver confirmada. Conferir workflow do Pages e URLs reais; não concluir pelo push sozinho. Se faltar serviço externo, entregar prévia local com pendências explícitas, sem anunciar área ativa.

## Autorrevisão do plano

- Convites, conta, recuperação e reenvio: tarefas 3 e 4; autorização de aluno/professor/visitante e revogação: tarefa 2, repetida por HTTP/navegador na 6.
- Upload, destinatários múltiplos, edição e retirada: tarefas 2 e 5; erros, configuração ausente, estados vazios e acessibilidade: tarefas 4 e 5.
- Configuração externa/SMTP, ausência de cadastro público, bootstrap, preservação do público e publicação: tarefa 6.
- As cinco condições de Review Focus têm testes nos responsáveis. Desligamento não tenta recolher arquivos já baixados, conforme o desenho.
- Nenhuma validação de ambiente externo foi executada nesta fase de planejamento. O plano não autoriza automaticamente contratação ou envio de e-mails reais.
