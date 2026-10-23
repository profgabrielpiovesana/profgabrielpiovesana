# Área do aluno — desenho da primeira versão

Data: 2026-10-23. Estado: proposta para revisão de Gabriel.

## Objetivo e decisões de Gabriel

Acrescentar ao site de aulas uma área privada para os alunos acessarem os
materiais de aula e as listas que Gabriel liberar. O acesso permanece enquanto
a pessoa for sua aluna; Gabriel poderá desativá-lo quando o acompanhamento
terminar. O público inicial varia aproximadamente de dois a seis alunos.

Decisões confirmadas na conversa:

- Gabriel convida cada aluno pelo e-mail; o aluno define a própria senha.
- Gabriel administra alunos, convites, arquivos e permissões em um painel no
  próprio site.
- Materiais e listas podem ser destinados individualmente aos alunos.
- Os vídeos ficam para outra etapa.

## Situação atual verificada

O repositório `profgabrielpiovesana/profgabrielpiovesana` contém um site estático
em HTML, CSS e JavaScript, publicado no GitHub Pages. `index.html` usa
`estilos/site.css` e `scripts/app.js`; a biblioteca pública é carregada de
`dados/materiais.json`, com PDFs em `arquivos/`. O checkout inspecionado está
limpo, na branch `main`, com HEAD `7659efa`.

Não existe implementação de login, servidor, banco de dados ou armazenamento
privado no checkout. O relato de Gabriel é que não houve trabalho no notebook.
Nenhuma conta ou configuração externa de Supabase foi verificada nesta etapa.

## Abordagens consideradas

1. **Painel do professor dentro do site e serviços privados no Supabase.**
   Reaproveita o GitHub Pages e o visual atual. Gabriel faz o trabalho cotidiano
   pelo site. Requer implementar a administração e configurar o serviço externo.
   É o caminho recomendado pelo Codex e escolhido por Gabriel.
2. **Área do aluno no site, administração pelo painel do Supabase.**
   Reduz a primeira implementação, mas exige que Gabriel use ferramentas
   técnicas para cadastrar e administrar alunos e arquivos. Não foi a opção
   escolhida.

A escolha do Supabase como serviço é proposta técnica do Codex, dando
continuidade à alternativa discutida. Ele reúne autenticação, banco de dados,
armazenamento privado e funções de servidor, mantendo o site no GitHub Pages.
Este documento não pressupõe que uma conta já exista nem contrata plano pago.

## Escopo funcional

### Acesso e conta do aluno

1. Gabriel informa nome e e-mail no seu painel e envia um convite.
2. O destinatário abre o convite e define a senha na área do aluno.
3. Nos acessos seguintes, entra com e-mail e senha.
4. A biblioteca mostra somente os materiais publicados para aquele aluno e os
   dados necessários para reconhecê-los.
5. Há recuperação de senha e opção de sair.

O cadastro público fica desabilitado. Um usuário autenticado sem cadastro de
aluno ativo e sem permissão administrativa não recebe acesso à biblioteca.
Convites expirados podem ser reenviados por Gabriel; reenviar um convite não
cria alunos duplicados nem reativa um aluno desligado silenciosamente.

### Painel de Gabriel

- Consultar alunos ativos, convites pendentes e acessos desativados.
- Convidar um aluno, reenviar convite e ativar ou desativar o acesso.
- Enviar um PDF com título, tipo (material de aula ou lista), data de referência
  e uma descrição opcional.
- Escolher um ou vários alunos que podem acessar o mesmo arquivo. O PDF é
  armazenado uma única vez e associado aos destinatários escolhidos.
- Alterar os dados do material, acrescentar ou remover destinatários e retirar
  o material de circulação.

O estado de aluno ativo é explícito. O tempo de acompanhamento é variável;
nesta primeira versão o encerramento é manual, sem cobrança ou vencimento
automático. A data do material serve para organização, não para agendamento.

### Biblioteca do aluno

Apresentar título, tipo, data e descrição dos materiais liberados, ordenados dos
mais recentes para os mais antigos. Permitir pesquisar pelo título e filtrar
entre material de aula e lista. Cada item oferece abrir e baixar o PDF.

O estado vazio informa que ainda não há materiais liberados. Erros de login,
convite expirado, senha esquecida e acesso desativado têm mensagens próprias,
sem mostrar dados de outros alunos ou detalhes técnicos do serviço.

## Limites da primeira versão

- Um professor administrador; não há criação de contas administrativas pelo
  navegador ou mudança de papel feita pelo próprio aluno.
- PDFs privados, inicialmente com limite proposto de 20 MB por arquivo.
- Sem vídeos, pagamentos, correção automática, entrega de respostas ou chat.
- Sem turmas formais; um material pode ser liberado a vários alunos escolhidos.
- A biblioteca pública atual continua pública. Os arquivos privados e os dados
  dos alunos não entram no repositório, no catálogo público ou no GitHub Pages.
- O encerramento do acesso bloqueia novos pedidos ao servidor. Arquivos já
  baixados ou abertos pelo aluno não podem ser recolhidos.

O limite de arquivo, a ordenação e o mecanismo de bloqueio manual são escolhas
iniciais do Codex, sujeitas à revisão de Gabriel.

## Organização técnica proposta

### Interface

Manter a implementação estática existente e acrescentar páginas independentes
para entrada/definição e recuperação de senha, biblioteca do aluno e painel do
professor. Acrescentar um acesso à área do aluno na navegação pública, incluindo
no celular. Reaproveitar cores, tipografia e estilos do site e isolar os scripts
privados da renderização da biblioteca pública.

Os formulários devem funcionar por teclado, ter rótulos visíveis, mensagens
associadas aos campos, estados de carregamento e disposição adequada no celular.
Dados como título, nome e descrição são exibidos como texto, sem interpretar
HTML fornecido pelo usuário.

### Autenticação e administração

Usar Supabase Auth para sessões, convites, definição e recuperação de senha.
As operações administrativas de convite e reenvio ficam em uma Edge Function,
que valida a sessão e a permissão de professor antes de usar credenciais
privilegiadas. A chave secreta nunca é enviada ao navegador ou versionada.

O professor inicial é cadastrado por procedimento de configuração explícito.
Não existe regra de tornar o primeiro visitante administrador. A permissão
administrativa vem de uma tabela protegida, não de metadados que o usuário pode
editar. Autenticação válida sozinha não concede privilégios administrativos.

Os endereços de retorno dos e-mails e as origens autorizadas devem corresponder
à URL real do projeto no GitHub Pages, incluindo o caminho
`/profgabrielpiovesana/`, e ao ambiente local de desenvolvimento.

### Dados e arquivos

Modelo mínimo proposto:

- `professores`: identificador de autenticação autorizado para administrar.
- `alunos`: identificador de autenticação, nome, estado ativo/inativo e datas.
  O e-mail necessário à administração não é exposto aos outros alunos.
- `materiais_privados`: identificador, título, tipo, descrição, data de referência,
  caminho interno do arquivo, nome original e estado publicado/retirado.
- `acessos_materiais`: associação única entre material e aluno.

Todos esses dados ficam protegidos por políticas RLS (permissões verificadas
no banco). O aluno pode consultar somente o necessário da própria conta e os
materiais publicados associados a ela. Escritas nessas tabelas e upload ou
remoção de PDFs são exclusivos do professor.

Os PDFs ficam em um bucket privado. A política de leitura do arquivo confere a
sessão, aluno ativo, material publicado e associação ao aluno. Essa verificação
é feita também no download, não apenas na listagem da interface. Os nomes dos
objetos usam identificadores gerados, sem e-mail ou nome do aluno no caminho.

Preferir download autenticado e abertura de um objeto local no navegador após
receber o arquivo. Evitar links assinados duradouros: eles poderiam continuar
válidos até expirar, mesmo depois da desativação do aluno. A aplicação descarta
as URLs locais que criou quando elas deixam de ser necessárias e não instala
cache offline dos materiais privados.

O envio de um PDF só é apresentado como concluído depois que arquivo, metadados
e destinatários estiverem registrados. Se uma etapa falhar, o painel deve
mostrar a falha e limpar o arquivo incompleto quando possível. A retirada de
circulação é reversível e já bloqueia leituras pelo estado do material; exclusão
definitiva, se oferecida, exige confirmação e não deve apagar outro material.

### Configuração externa necessária

- Projeto Supabase de Gabriel, chave pública e URL de acesso.
- Configuração do banco, bucket privado, função administrativa e professor.
- Serviço de e-mail SMTP para convites e recuperação de senha. O remetente
  padrão de testes do Supabase só envia para endereços da equipe do projeto;
  não serve para convidar alunos reais.
- Credenciais privilegiadas e de SMTP inseridas somente nos ambientes seguros
  dos provedores, sem solicitá-las na conversa ou colocá-las no código público.

O painel permite trabalhar sem abrir ferramentas técnicas no dia a dia, mas a
configuração inicial desses serviços continua necessária. Não assumir que todo
o funcionamento de e-mail ou armazenamento estará coberto por planos gratuitos.
Escolha de provedor de e-mail e eventuais custos serão definidos com Gabriel
antes de qualquer contratação.

## Critérios de conclusão e verificações

1. Professor convida usuário e o fluxo real de e-mail/definição de senha funciona
   com um endereço de teste autorizado por Gabriel.
2. Aluno A acessa somente os próprios materiais. Aluno B não obtém os PDFs ou
   dados de A, mesmo chamando diretamente as APIs com identificadores conhecidos.
3. Sem login, acesso a dados e PDFs privados é negado.
4. Ao desativar A, pedidos de listagem e download são negados mesmo que ele
   ainda mantenha uma sessão aberta. Reativar restaura os materiais ainda
   associados. Retirar uma associação ou um material bloqueia o novo download.
5. Aluno não consegue convidar pessoas, enviar arquivos, alterar seu estado,
   conceder permissões ou tornar-se professor por chamada direta à API.
6. Um PDF pode ser compartilhado com vários alunos sem uploads duplicados;
   falhas de upload/registro não aparecem como sucesso.
7. Convite expirado, senha incorreta, recuperação, saída e ausência de materiais
   têm tratamento verificável. Não há cadastro público funcional.
8. Interface verificada em navegador real, em computador e largura de celular,
   incluindo navegação por teclado e biblioteca pública existente.
9. Testes de permissões demonstram negação antes da correção das políticas; a
   validação não se limita a esconder botões ou usar respostas simuladas.
10. Publicação só é considerada completa com serviço externo configurado,
    testes reais, publicação GitHub Pages verificada e dados privados ausentes
    do repositório. Resultados locais/simulados e verificações reais são
    apresentados separadamente.

## Próxima etapa

Revisão deste desenho por Gabriel. Após a aprovação, escrever o plano de
implementação, preparar os testes de acesso e construir em etapas. Até aqui
não há código de produto, serviço contratado ou área privada publicada.

## Referências técnicas consultadas

- [Convites e limites de credenciais administrativas](https://supabase.com/docs/guides/auth/users).
- [Armazenamento privado](https://supabase.com/docs/guides/storage/buckets/fundamentals).
- [Políticas de acesso aos arquivos](https://supabase.com/docs/guides/storage/security/access-control).
- [Downloads e validade de links assinados](https://supabase.com/docs/guides/storage/serving/downloads).
- [Remetente de e-mail e limitações do SMTP de testes](https://supabase.com/docs/guides/auth/auth-smtp).
