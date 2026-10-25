# Entrega privada com autorização por pedido

## Evidência e aprovação

No projeto descartável ltudhfyhcigmkexrgect, a suíte HTTP falhou após desativação: origem/URL inédita negou, mas mesma URL aquecida e JWT retornaram HTTP 200. Segunda reprodução com upload cache-control max-age=0 também retornou 200, cf-cache-status HIT e Cache-Control private, max-age=0, must-revalidate. Limpeza executada em ambas. Não foi demonstrado acesso a arquivos nunca autorizados. Gabriel aprovou explicitamente a entrega via Edge Function após diagnóstico e revisão cética.

## Contrato aprovado

- Nova função baixar-material: POST JSON com apenas ID de material; valida Origin contra a mesma origem autorizada, método, UUID e Bearer; valida usuário com Auth e consulta material por ID com cliente ligado ao JWT (RLS atual). Nunca aceita caminho de arquivo, bucket, URL, papel ou identidade do payload.
- Somente após autorização, cliente administrativo interno baixa o caminho obtido do banco no bucket privado fixo materiais-alunos. Não encaminhar query, Range, condicionais, apikey ou Authorization do usuário à busca administrativa. Credencial administrativa permanece no servidor.
- Todas as respostas devem usar Cache-Control: private, no-store, Pragma: no-cache e Vary: Origin, Authorization; mensagens genéricas nas falhas. Não emitir redirects, signed URLs, caminhos ou tokens. CORS restrito, não wildcard. Reutilizar opções de cliente server existentes e validação de origem HTTPS.
- Endpoint entrega bytes application/octet-stream para o SDK 2.75.0 tratar como Blob; cliente reidentifica o Blob como application/pdf para manter abrir/baixar existentes. Não alterar dependências nem bundle vendor.
- Migração 005: policy de SELECT de storage.objects para materiais-alunos permite somente professor. Aluno ativo destinatário não baixa/lista/assina Storage diretamente. Demais grants, RLS de metadados e operações do professor preservados.
- Cliente mantém checagem de acesso para UX, mas proteção vem do servidor. downloadMaterial usa functions.invoke com ID; nenhum Storage.download pelo aluno. GET/HEAD do novo endpoint não entregam bytes.
- HTTP: controles positivos de bytes no endpoint; repetir mesmo URL, corpo e JWT após desativação, desassociação e retirada deve negar; incluir Range/condicionais como tentativas sem alterar contrato. Confirmar aluno B/visitante negados, aluno ativo não acessa Storage direto por nenhuma das duas rotas, não assina nem lista. Não aceitar HTTP200 como negação nem usar cache-busting para o endpoint novo.
- SQL: manter suíte de autorização/edição e atualizar expectativas de download direto: aluno sempre negado, professor autorizado. Não apagar testes para ocultar falha; comportamento aprovado mudou explicitamente para negar Storage direto.

## Transição e limites

Implantar e validar primeiro somente no projeto descartável autorizado. Produção tinha zero materiais/objetos; reler antes de qualquer transição. Se houver objetos/URLs antigos, interromper rollout automático para tratar invalidação e comprovar negação das URLs antigas; mudar policy não prova eliminação de cache legado. Arquivos já recebidos não podem ser recolhidos.

Preservar fixes anteriores e diff sem commit. Sem novas dependências, credenciais em fontes, e-mails reais, dados reais em testes, push ou publicação automática. Novos testes locais RED/GREEN e revisão independente antes da implantação. Execução real SQL/HTTP deve provar estado final e limpeza de fixtures.

Referências primárias: https://supabase.com/docs/guides/storage/cdn/smart-cdn ; https://supabase.com/docs/guides/functions/auth ; SDK instalado node_modules/@supabase/functions-js/src/FunctionsClient.ts (2.75.0 usa Blob apenas com application/octet-stream).
