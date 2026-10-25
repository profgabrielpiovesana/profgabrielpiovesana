# Auditoria do site de materiais — 2026-10-24

Base inspecionada: `c8e6d510a20a96af82e998c405f3877c47f9adef`, árvore inicialmente limpa. Esta auditoria examina código local; não certifica a configuração implantada no Supabase ou no GitHub Pages.

## Pipeline e estado

Sete agentes independentes, no máximo três auditores simultâneos, somente leitura. Ordem de despacho: Secrets, Auth, Isolation; Duplication; Logic; Standards; OWASP. Depois, um agente deduplicador e um validador cético independente. A revisão humana de Gabriel precede Spec → Sprints → Coder Agent. Na fase de inspeção, nenhum fix de produto foi implementado; a implementação aprovada está registrada ao final.

Validação cética concluída contra o código: A-1 aceito P1; A-2 e A-3 aceitos P2; A-4 aceito exclusivamente como lacuna P2; A-5 rejeitado como vulnerabilidade atual; A-6 aceito P3. O validador reproduziu A-2 e A-6 independentemente e conferiu os demais fluxos nos fontes. Gabriel aprovou A-1, A-2, A-3, A-6 e a ampliação A-4 em 2026-10-24.

| Auditor | Resultado |
| --- | --- |
| Secrets scanner | Nenhum segredo privado confirmado; código atual e 40 commits alcançáveis examinados. Chave publicável Supabase não é segredo. |
| Auth Auditor | Nenhum bypass confirmado; JWT, papel de professor e RLS verificados por leitura. |
| Isolation Inspector | Lacuna de cobertura de cache e risco condicionado à instalação parcial. Sem quebra A → B demonstrada. |
| Duplication Detector | Validação de alunos repetida/divergente; sem vulnerabilidade por duplicação. |
| Logic Analyzer | Republicação concorrente, saída com falso sucesso e descarte de rascunho. |
| Standards Checker | Confirmou o mesmo defeito de saída; observações opcionais sobre exports sem consumidores. |
| OWASP Scanner | Sem SQLi, XSS ou CSRF explorável confirmado no escopo local. |

## Lista deduplicada para validação humana

### A-1 — P1: edição pode desfazer retirada concorrente

Fonte: LOG-2. `scripts/portal/api.mjs:107-115` lê o estado do material, consulta alunos e envia `publicado: current.published` no salvamento. `supabase/migrations/202610230001_portal.sql:150` grava esse valor após obter o bloqueio da linha. Uma retirada concluída entre a leitura e o RPC pode ser sobrescrita pelo estado antigo, tornando o material novamente disponível aos destinatários.

Prova local: mock determinístico de `listStudents()` retirando a publicação após a leitura inicial; o salvamento terminou com `published=true`. A sequência também é compatível com o SQL lido; não foi executada concorrência no banco remoto.

Correção proposta: edição de metadados preserva o estado de publicação atual no servidor; publicação/retirada continua na operação explícita. Alterar cliente, adicionar migração para instalações existentes e teste de regressão. Editar somente a migração antiga não atualiza produção.

### A-2 — P2: saída anuncia sucesso quando o SDK retorna erro

Fontes deduplicadas: LOG-1 + STD-1. `scripts/portal/auth.mjs:55-57` ignora `{ error }` de `signOut()`, e `scripts/portal/entry.mjs:97` ignora o retorno do controlador. O bundle do SDK retorna antes de remover a sessão local em algumas falhas, como erro 500/rede.

Prova local: mock retornando erro resolveu `logout()` como `signed-out`; `refresh()` continuou retornando `aluno`. Não houve falha real induzida no serviço nem exposição demonstrada pela interface.

Correção proposta: tratar erro retornado e Promise rejeitada; interface só confirma saída efetiva e apresenta falha/retry quando necessário. Cobrir controller e consumidor com regressão.

### A-3 — P2 funcional: ações de alunos descartam rascunho de material

Fonte: LOG-3. `scripts/portal/professor.mjs:105` executa `clearEdit()` em toda ação bem-sucedida de `run()`, inclusive desativação, reenvio e convite. O reset perde título, descrição, arquivo e escolhas não salvas. `render()` também reconstrói destinatários a partir do material persistido, apagando escolhas do rascunho.

Correção proposta: limpar somente após salvar/publicar material ou cancelamento explícito; preservar os campos e destinatários válidos nas ações independentes. A seleção de aluno que acabou de ser desativado deve ser reconciliada com aviso. Não basta remover uma chamada de `clearEdit()`.

### A-4 — P2, lacuna: revogação não é testada com URL aquecida

Fonte: ISO-1. `tests/live/portal-access.test.mjs:49-50` acrescenta `cb` aleatório em cada download, inclusive após revogações em `168-182`. Isso força consulta à origem; o produto usa download com caminho estável em `scripts/portal/api.mjs:155-156`.

A lacuna é confirmada; bypass atual do CDN e duração de cache não foram confirmados. Não apresentar este item como vazamento reproduzido.

Correção proposta: manter os testes da origem e acrescentar aquecimento/repetição da mesma URL e JWT após desativação, desassociação e retirada. Executar somente em projeto isolado explicitamente configurado. Se houver falha, corrigir a entrega/autorização no servidor; checagem frontend não protege chamada direta.

### A-5 — condicional de implantação, sem falha atual confirmada

Fonte: ISO-2. A política de `202610230001_portal.sql:164-166` concede leitura mais ampla que a 002. Se somente 001 for aplicada, ou 002 abortar, permanece o estado inicial, que pode permitir URLs assinadas ao destinatário autorizado. A documentação já exige interromper a ativação incompleta; o contexto registra ambas aplicadas, sem releitura remota nesta auditoria.

Não integra os bugs confirmados de produção. Verificar políticas efetivas antes de qualquer afirmação de exposição. Não modificar política em produção por hipótese.

### A-6 — P3 funcional: limites divergentes na validação de aluno

Fonte: DUP-1. `scripts/portal/rules.mjs:17-25` aceita nome acima de 160 e e-mail acima de 254 caracteres; os ramos de convite e conclusão em `handler.mjs:39-43,55-59` rejeitam essas entradas. Prova Node: nome de 161 caracteres aceito pelo validador local.

Correção proposta: alinhar os limites do cliente, atributos do formulário e testes de fronteira, preservando validação no servidor. Não é bypass nem exige uma abstração compartilhada entre runtimes.

## Itens rejeitados como vulnerabilidades atuais

- URL e chave Supabase publicável do JSON são configuração pública esperada.
- Ausência de filtro explícito de aluno no cliente é respaldada pela RLS declarada.
- Múltiplos professores administrarem globalmente corresponde ao desenho de um único professor; isolamento multitenant não é requisito atual.
- `innerHTML` do catálogo público recebe JSON editorial versionado, sem canal de gravação para alunos/visitantes identificado.
- Guards repetidos entre cliente e servidor protegem fronteiras diferentes.
- Exports sem consumidores e extração de helpers são manutenção opcional, sem fix obrigatório nesta auditoria.

## Verificações e limites

`npm test`: oito arquivos executados, oito passaram, zero falhas ou skips. Reproduções locais adicionais para A-1, A-2 e A-6. Os auditores rodaram subconjuntos locais; resultados não substituem validação remota.

Não foram executados testes live mutáveis, ataques em produção, leitura de credenciais privadas, alterações em Supabase, deploy, push ou commit. Não foram revalidados cabeçalhos reais, configuração de Auth, políticas implantadas, CDN, dependências contra advisories atuais, backups ou objetos Git inalcançáveis. Os PDFs não receberam OCR de segredos. Uma auditoria sem findings nessas categorias não prova ausência absoluta de falhas.

## Próxima etapa autorizável

Implementação local dos itens aprovados concluída em três sprints; revisão independente de conformidade e qualidade aprovada após corrigir uma corrida adicional de login durante logout. Spec e plano estão em `docs/superpowers/`. A-5 fica como verificação de implantação, sem alteração remota automática. Publicação e migrações remotas continuam sujeitas ao escopo autorizado por Gabriel.


## Implementação local após aprovação

A-1: edição cliente omite publicação; migração incremental `202610240004_preserve_material_publication.sql` preserva o estado sob bloqueio, inclusive para cliente antigo. Casos SQL acrescentados; não executados nesta etapa. A-2: controlador e consumidor UI distinguem erro retornado/exceção e oferecem retry após limpar conteúdo sensível. A-3: ações independentes preservam formulário, arquivo, edição e destinatários ativos; desativação reconcilia seleção com aviso; respostas após sair são descartadas. A-6: validação normalizada 160/254 e formulário alinhados. A-4: teste HTTP ampliado para URL estável aquecida com controle positivo por revogação, preservando testes de origem; ainda não executado.

Verificação local: `npm test` passou (10 arquivos); `node --test --test-isolation=none tests/portal/*.test.mjs` passou com 77 testes individuais, sem falhas ou skips; `git diff --check` passou. As regressões JavaScript foram observadas falhando antes das correções. Não houve commit, push, deploy, migração remota nem execução HTTP/SQL real nesta etapa. A ausência de teste real de cache permanece uma limitação, não um bypass confirmado. Relatório detalhado: `.superpowers/sdd/2026-10-24-correcoes-auditoria/task-1-report.md`.

Revisão final: finding P2 adicional de login durante saída pendente corrigido com serialização própria de autenticação, preservando saída durante download. Três regressões adicionais passaram. Re-review: conformidade e qualidade aprovadas localmente; nenhum novo finding acionável. Evidência em `.superpowers/sdd/2026-10-24-correcoes-auditoria/task-1-rereview.md`. Aplicar e verificar migração 004 antes de publicar o cliente atualizado.

## Continuação remota — 2026-10-24

Após autorização para continuar, a migração 004 foi aplicada no projeto existente rlgxtgxqhpvnfghcmkmu pelo SQL Editor, dentro de transação. Releitura de pg_proc confirmou corpo idêntico ao arquivo local (MD5 do prosrc 826f4264f560fd35bf20d8494b7ff26e), SECURITY DEFINER e search_path vazio preservados, execução authenticated permitida e anon negada. Não foi criada entrada automática no histórico de migrações: execução manual pelo SQL Editor.

Contagens antes/depois: alunos=1, materiais_privados=0, professores=1, objetos do bucket=0 e auth.users=2. Não foram lidos nomes, e-mails, senhas ou chaves. A política efetiva de Storage contém allow_any_operation para download autenticado e can_read_object. O projeto existente não é mais ambiente vazio/descartável; a suíte live NÃO foi executada nele.

Gabriel autorizou criar um projeto separado. Formulário portal-auditoria-testes preparado na organização Prof FREE, Data API habilitada, exposição automática de tabelas desativada. Criação ainda não concluída: etapa de senha exige ação do usuário no navegador. Não gerar/registrar senha pelo agente nem enviar credenciais ao chat. O painel também sinalizou incidente que pode afetar criação na região Americas.

Checagem real em navegador do frontend local: página de entrada carregou sem erros de console; áreas de professor/aluno e retry de logout ocultos inicialmente; maxlength de nome=160 e e-mail=254; recuperação abriu sem enviar e-mail. Não houve login real, execução das regressões SQL/HTTP ou publicação do frontend.

Próxima ação: usuário conclui criação do projeto de teste; aplicar migrações e preparar Edge Function/configuração de teste apropriadas, executar regressões SQL e HTTP com fixtures descartáveis e limpeza verificada. Atenção: Edge Function atual valida callback/origem de produção; planejar teste isolado sem ampliar acesso nem enviar convites reais. Não rotular projeto de produção como isolado para satisfazer guardas.

## A-4 confirmado em HTTP no projeto isolado

Projeto criado por Gabriel: portal-auditoria-testes (ltudhfyhcigmkexrgect), distinto do projeto do site. Confirmado inicialmente com zero contas, tabelas públicas e objetos; migrações 001-004 aplicadas e função gerenciar-alunos implantada com código auditado. Cadastro público desativado. A suíte SQL completa foi executada pelo SQL Editor sem erro, incluindo regressões de edição/publicação; rollback e releitura confirmaram zero fixtures.

Execução HTTP real: node --test --test-isolation=none --test-reporter=spec tests/live/portal-access.test.mjs falhou na linha 176: desativação, mesma URL aquecida e mesmo JWT, esperado bloqueio, recebido HTTP200. O controle com query inédita negou. Cleanup terminou sem erro e releitura SQL confirmou zero contas/alunos/professores/materiais/objetos.

Experimento isolado fora do repositório adicionou somente cabeçalho cache-control:max-age=0 ao upload e registro de cabeçalhos não sensíveis. Falhou na mesma asserção; resposta indevida Cache-Control private,max-age=0,must-revalidate, cf-cache-status HIT. Origem negou com HTTP400/BYPASS e URL nova. Isso confirma resposta cacheada após revogação; não demonstra acesso a materiais nunca autorizados nem vazamento entre alunos.

Revisão cética confirmou que a autorização precisa anteceder cada entrega e que cache-control do navegador não resolve a garantia. Gabriel aprovou explicitamente nova entrega via Edge Function: verificar JWT, consultar ID com RLS atual, buscar arquivo administrativamente só após autorização, retornar no-store e negar Storage direto ao aluno. Spec e plano em docs/superpowers/*/2026-10-24-entrega-privada-sem-cache.md. Implementação e nova revisão em andamento. Nenhuma mudança de policy/novo endpoint aplicada em produção nesta etapa.

Fontes primárias: https://supabase.com/docs/guides/storage/cdn/smart-cdn ; https://supabase.com/docs/guides/storage/cdn/fundamentals ; https://raw.githubusercontent.com/supabase/storage/master/src/http/routes/object/getObject.ts . A prova do erro vem do teste real, não apenas da documentação.

## A-4 — confirmação posterior e correção aprovada

A classificação anterior de lacuna é histórica. Após a revisão local, o coordenador reproduziu no projeto descartável `ltudhfyhcigmkexrgect` HTTP 200 na URL Storage aquecida e mesmo JWT após desativação, com origem negando; o ensaio com upload max-age=0 também respondeu 200/HIT. Essas execuções e limpezas foram relatadas ao implementador pelo coordenador. Não se demonstrou acesso a arquivo nunca autorizado. Gabriel aprovou autorização por pedido via Edge Function.

Novo diff local: `baixar-material` autoriza JWT e leitura RLS por ID antes do download interno, responde no-store em todas as respostas e entrega bytes compatíveis com o SDK real. A policy005 nega Storage direto ao aluno, preservando professor. O cliente invoca o endpoint e reidentifica Blob como PDF; os controles SQL/HTTP foram atualizados para o novo contrato sem remover asserções de isolamento, assinatura e revogação. Validação local: 99 testes individuais e 11 arquivos do npm test passaram; syntax/diff checks passaram. Implantação e execução SQL/HTTP dessa nova versão ficam pendentes de revisão independente e ação do coordenador. Cache legado requer plano próprio caso haja objetos/URLs anteriores na produção. Relatório: `.superpowers/sdd/2026-10-24-entrega-privada-sem-cache/task-1-report.md`.

## Aceitação real da entrega corrigida

Gabriel aprovou a nova entrega via Edge Function. Coder implementou baixar-material (Auth + consulta RLS por ID antes de busca administrativa), migração 005 negando Storage direto ao aluno e cliente binário via SDK fixado. Revisão independente: conformidade e qualidade aprovadas para validação isolada, sem finding acionável. Coordenador confirmou 99 testes locais individuais passando, sem falhas/skips; sintaxe live e diff --check passaram.

No projeto descartável ltudhfyhcigmkexrgect: 005 aplicada; suíte SQL completa atualizada executou sem erro, terminando em rollback. baixar-material implantada com index.ts e handler.mjs do repositório; configuração de gateway/JWT preservada. PORTAL_ALLOWED_ORIGIN público é compartilhado pelas duas funções; nenhuma chave de produção copiada.

Comando real node --test --test-isolation=none --test-reporter=spec tests/live/portal-access.test.mjs passou (1 cenário de aceitação, 56,748 s, zero falhas/skips). A suíte comprovou: bytes do PDF autorizados; cabeçalhos no-store/Pragma/Vary preservados; acesso entre alunos e visitante negado; GET/HEAD não entregam PDF; condicionais/Range não contornam autorização; mesmo endpoint/corpo/JWT negado após desativação, desassociação e despublicação; aluno ativo/revogado impedido de baixar Storage direto nas duas rotas; assinatura/listagem negadas; controles do professor preservados e fixtures limpas.

Releitura SQL após HTTP: fixtures_removed=true para auth.users/alunos/professores/materiais_privados/storage.objects, storage_teacher_only=true e migration004_matches=true. Evidência visual /tmp/portal-aceitacao-final.jpg. Arquivo temporário de credenciais modo600 removido e clipboard limpo. .env.example agora aponta ao projeto descartável novo, nunca ao projeto do site.

Estado de produção: somente 004 aplicada anteriormente; 005, baixar-material e frontend corrigido NÃO publicados no projeto do site. Próxima etapa revisável: reler quantidade de materiais/objetos; se zero, implantar função, aplicar005 e publicar cliente de modo coordenado, após autorização de publicação. Se houver arquivos legados, tratar invalidação/testar URLs antigas antes de declarar revogação corrigida. Validação atual comprova o caminho isolado; não certifica rollout em produção nem recolhe bytes já obtidos.

## Rollout de produção autorizado

Gabriel autorizou implantação e publicação após confirmar que não enviou PDFs. Releitura prévia confirmou 1 aluno,1 professor,2 contas e zero materiais/objetos. baixar-material foi implantada em produção com os mesmos arquivos validados e gateway preservado; migração005 aplicada. Releitura retornou cadastros_preservados, sem_pdfs_antigos, storage_restrito e edicao_corrigida todos true. 99 testes locais passaram novamente e npm audit não apontou vulnerabilidades conhecidas. O envio deste commit publica o frontend; o resultado do Pages e a comparação dos scripts online serão registrados no handoff do projeto após o envio. Nenhuma inscrição ou credencial de usuário foi alterada.
