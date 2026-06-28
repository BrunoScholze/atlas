========================================
COMO ADICIONAR UM NOVO PROJETO NO ATLAS CODE
========================================

Cada projeto no Atlas Code tem 3 elementos:
  1. Um bloco em PROJETOS.md
  2. Um arquivo de instrucoes do agente (CLAUDE.md ou um exclusivo)
  3. Um arquivo de funcionalidades exclusivo (Funcionalidades-Nome-Do-Projeto.md)

O servidor le esses arquivos automaticamente ao receber uma analise.
Nao ha necessidade de alterar codigo — so criar os arquivos e reiniciar.

----------------------------------------
PASSO 1 — Registrar o projeto em PROJETOS.md
----------------------------------------

Abra C:\azure\atlas\PROJETOS.md e adicione um novo bloco no final:

  ## novo-slug
  Nome: Nome Legivel do Projeto
  Descricao: Breve descricao do que e o projeto
  CLAUDE: CLAUDE.md
  Funcionalidades: Funcionalidades-Nome-Do-Projeto.md
  Azure: https://dev.azure.com/organização/repositorio/_git/nome-do-repo
  Status: ativo

Regras:
  - ## novo-slug      → identificador unico, sem espacos, so minusculas e hifens
  - Nome:             → aparece no dropdown do plugin para o usuario selecionar
  - CLAUDE:           → pode reutilizar o CLAUDE.md existente ou criar um exclusivo
  - Funcionalidades:  → nome do arquivo que voce vai criar no Passo 3
  - Azure:            → URL base do repositorio no Azure DevOps (sem path de arquivo)
  - Status: ativo     → so projetos com Status: ativo aparecem no plugin

----------------------------------------
PASSO 2 — Criar (ou reutilizar) o arquivo de instrucoes do agente
----------------------------------------

Se o novo projeto usa o mesmo app e segue o mesmo padrao do APP Minha Prod,
pode apontar CLAUDE: CLAUDE.md e pular este passo.

Se o projeto tiver tecnologia ou fluxo diferente (ex: outro framework, outro backend),
crie um arquivo exclusivo:

  C:\azure\atlas\CLAUDE-nome-do-projeto.md

Copie o CLAUDE.md existente como base e ajuste:
  - A secao "Quem voce e" (nome do app)
  - A secao "Contexto do sistema" (tecnologias, repositorio, etc.)
  - O campo CLAUDE: no PROJETOS.md deve apontar para esse novo arquivo

----------------------------------------
PASSO 3 — Criar o arquivo de funcionalidades
----------------------------------------

Crie o arquivo:

  C:\azure\atlas\Funcionalidades-Nome-Do-Projeto.md

Modelo de cabecalho:

  # Funcionalidades — Nome Do Projeto

  > Mapa de funcionalidades e arquivos suspeitos do projeto Nome Do Projeto.
  > O agente consulta este arquivo para montar a lista de fontes a analisar.
  >
  > Repositorio do app: C:\azure\caminho\para\o\repositorio

  ---

Para cada funcionalidade do projeto, adicione uma secao:

  ## Nome da Funcionalidade
  Descricao: O que essa funcionalidade faz (contexto para o agente entender antes de abrir o codigo).
  Arquivos suspeitos:
  - src\caminho\do\arquivo.html
  - src\caminho\do\arquivo.ts
  - src\caminho\do\arquivo.scss

  ---

Dicas:
  - Quanto mais descricao, melhor o agente entende sem precisar ler tudo
  - Liste todos os arquivos que podem estar envolvidos, nao so o principal
  - Se a funcionalidade tem sub-componentes (ex: modais, componentes filhos),
    mencione-os na descricao para o agente saber que deve rastrear

----------------------------------------
PASSO 4 — Reiniciar o servidor
----------------------------------------

Pare o servidor atual e inicie novamente:

  node C:\azure\atlas\server\index.js

O projeto novo ja aparece no dropdown do plugin imediatamente.

----------------------------------------
CHECKLIST RAPIDO
----------------------------------------

[ ] Bloco adicionado em PROJETOS.md com slug, Nome, CLAUDE, Funcionalidades, Azure e Status: ativo
[ ] Arquivo Funcionalidades-Nome-Do-Projeto.md criado em C:\azure\atlas\
[ ] Funcionalidades preenchidas com descricao e arquivos suspeitos
[ ] CLAUDE.md criado/reutilizado conforme necessidade
[ ] Servidor reiniciado
[ ] Plugin recarregado em chrome://extensions (se necessario)
[ ] Projeto aparece no dropdown e analise funciona

========================================
