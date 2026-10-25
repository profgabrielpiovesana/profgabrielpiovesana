# Correções aprovadas da auditoria do portal

Gabriel aprovou A-1, A-2, A-3, A-6 e a ampliação A-4 em 2026-10-24, após sete auditorias, deduplicação e validação cética. Base: c8e6d51. Evidências: ../../auditoria-seguranca-2026-10-24.md.

## Contrato

- A-1: edição de metadados/destinatários nunca altera publicação. O servidor preserva o valor corrente sob bloqueio, inclusive quando clientes antigos reenviam publicado obsoleto. Criação continua aceitando publicação inicial; a operação explícita de publicar/retirar permanece. Nova migração incremental para instalações existentes, sem reescrever migrações históricas. Acrescentar regressão SQL executável além da regressão cliente.
- A-2: logout com erro retornado pelo SDK ou exceção não pode ser anunciado como sucesso. A interface limpa conteúdo sensível, apresenta erro seguro e permite repetir a saída; só anuncia sucesso no resultado signed-out. Não expor detalhe de servidor.
- A-3: ações independentes (convite, matrícula, reenvio, ativação e publicação/retirada) preservam rascunho, arquivo, modo de edição e destinatários válidos. Limpar formulário somente ao salvar/publicar seu conteúdo ou cancelar explicitamente. Se um destinatário selecionado for desativado, removê-lo da seleção e avisar. Falha de atualização de listas preserva rascunho. Não permitir que resposta tardia restaure estado após sair.
- A-6: nome normalizado limitado a 160 caracteres, e-mail normalizado limitado a 254; cliente e maxlength do formulário alinhados ao servidor. Preservar validação do servidor. Testar limite e limite+1.
- A-4: manter checagens de origem com URL única e acrescentar URL estável aquecida, mesmo JWT e mesma URL antes/depois de desativação, desassociação e retirada de publicação. Cada cenário deve provar acesso antes da revogação. Não mascarar eventual resposta indevida com cache-busting, tolerância a 200 ou alteração frontend.

## Restrições e aceite

Reutilizar arquitetura e dependências existentes; sem novas dependências. Não remover controles, pular testes, modificar credenciais, enviar e-mails ou executar testes mutáveis remotos. Sem push, deploy ou aplicação remota de migrações nesta etapa. Preservar alterações locais alheias. A-5 não é vulnerabilidade atual confirmada e não recebe fix especulativo.

Regressões locais devem falhar antes do fix e passar depois. Cobrir consumidor UI de logout e DOM de rascunho usando padrão VM já existente ou ferramenta instalada, sem framework novo. SQL e HTTP devem ter casos executáveis preparados e limites de execução declarados; teste de formato do SQL não substitui execução no Postgres. Verificação final: npm test, git diff --check e revisão independente do diff. Aprovação local não certifica produção.
