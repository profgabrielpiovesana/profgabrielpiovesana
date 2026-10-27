# Área do aluno por disciplina

Gabriel aprovou em 2026-10-26 a navegação e autorizou começar a implementação.

- Entrada do aluno: saudação pelo nome e cartões Matemática e Física.
- Disciplina: cartões Listas e Materiais de aula.
- Categoria: somente PDFs liberados ao aluno naquela disciplina/tipo, pesquisa e abrir/baixar existentes.
- Referência visual fornecida: fundo azul-marinho, contornos turquesa, ilustrações. Criar SVGs próprios: compasso, átomo, folha de exercícios e livro.
- Voltar por botões com foco adequado; telas vazias explícitas; layout utilizável a partir de 320px.
- Professor: somente campo obrigatório Disciplina no formulário e indicação na listagem/edição; conservar seu layout.
- Persistir `disciplina` (`matematica` ou `fisica`) em materiais_privados. Não inferir pelo título. Registros legados sem classificação permanecem acessíveis em Outros materiais, até classificação pelo professor.
- Preservar contas, destinatários, RLS, estado de publicação e download pela Edge Function. Sem dependências novas, sem imagens externas.
- Implementação e prévia locais primeiro. Publicação requer migração antes do frontend; autorização desta conversa é para começar a fazer, não para alterar produção.

Alternativa descartada: somente filtrar por palavras do título, pois classificaria PDFs incorretamente.
