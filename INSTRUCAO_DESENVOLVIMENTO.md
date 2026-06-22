# Instrução de Desenvolvimento — Agente de Chamados Minha Totvs Prod

## Contexto

Sistema composto por:
1. Plugin Google Chrome (extensão)
2. Servidor Node.js local (Express) exposto via ngrok
3. Script .bat que executa o Claude Code no repositório
4. Integração com Jira REST API

Fluxo: dev abre ticket no Jira → clica no plugin → seleciona funcionalidades com defeito
→ anexa PDF do chamado → adiciona observação opcional → sistema analisa o código
e retorna onde está o problema e como resolver.

---

## Estrutura de pastas

```
agente-chamados/
├── plugin/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
│   ├── content.js
│   └── icons/
│       └── icon128.png
├── server/
│   ├── index.js
│   ├── package.json
│   └── .env
├── scripts/
│   └── claude.bat
├── context/
│   ├── claude.md
│   └── Funcionalidades.md
├── temp/
│   └── (PDFs temporários ficam aqui)
├── output.txt
└── README.md
```

---

## PARTE 1 — Servidor Node.js (server/)

### package.json
```json
{
  "name": "agente-chamados-server",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": { "start": "node index.js" },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "multer": "^1.4.5"
  }
}
```

### .env
```
PORT=3000
REPO_PATH=C:\caminho\para\o\repositorio\do\app
CONTEXT_PATH=C:\caminho\para\agente-chamados\context
OUTPUT_PATH=C:\caminho\para\agente-chamados\output.txt
BAT_PATH=C:\caminho\para\agente-chamados\scripts\claude.bat
TEMP_PATH=C:\caminho\para\agente-chamados\temp
```

### index.js — endpoints

**GET /health**
Retorna `{ "status": "ok" }` — o plugin chama ao abrir pra verificar se o servidor está rodando.

**GET /funcionalidades**
Lê o arquivo `Funcionalidades.md` e retorna a lista de funcionalidades disponíveis como JSON:
```json
{
  "funcionalidades": [
    "Apontamento por cronômetro",
    "Apontamento de ordem de produção normal",
    "Criar ordem de produção rápida",
    "Criar ordem de produção genérica",
    "Solicitação de serviço"
  ]
}
```
O plugin usa essa lista para montar os checkboxes de seleção.

**POST /analisar**
Recebe multipart/form-data:
```
titulo         : string
descricao      : string  
prioridade     : string
tipo           : string
responsavel    : string
comentarios    : string
historico      : string
funcionalidades: string (lista separada por vírgula, ex: "Apontamento por cronômetro,Solicitação de serviço")
observacao     : string (opcional — texto livre do dev)
pdf            : arquivo PDF do chamado
```

O endpoint deve:
1. Salvar o PDF na pasta temp/ com nome único (ex: ticket_14158_timestamp.pdf)
2. Ler claude.md e Funcionalidades.md da pasta context/
3. Montar o prompt completo com todos os dados + caminho do PDF
4. Executar claude.bat passando o prompt como argumento
5. Aguardar retorno síncrono (timeout: 3 minutos)
6. Ler output.txt gerado pelo Claude Code
7. Deletar o PDF temporário
8. Retornar:
```json
{ "sucesso": true, "analise": "conteúdo do output.txt" }
```
ou em caso de erro:
```json
{ "sucesso": false, "erro": "mensagem do erro" }
```

### Como montar o prompt no Node

```javascript
function montarPrompt(dados, claudeMd, funcionalidadesMd) {
  return `
${claudeMd}

---
${funcionalidadesMd}

---
TICKET_ID     : ${dados.ticketId}
TITULO        : ${dados.titulo}
DESCRICAO     : ${dados.descricao}
PRIORIDADE    : ${dados.prioridade}
TIPO          : ${dados.tipo}
RESPONSAVEL   : ${dados.responsavel}
COMENTARIOS   : ${dados.comentarios}
HISTORICO     : ${dados.historico}
FUNCIONALIDADES: ${dados.funcionalidades}
OBSERVACAO    : ${dados.observacao || 'Nenhuma observação adicional'}
ANEXO         : ${dados.pdfPath}
  `.trim();
}
```

### Como executar o .bat

```javascript
const { exec } = require('child_process');
const fs = require('fs');

function executarAnalise(prompt, callback) {
  const promptEscapado = prompt.replace(/"/g, '\\"').replace(/\n/g, ' ');
  const comando = `"${process.env.BAT_PATH}" "${promptEscapado}"`;
  
  exec(comando, { timeout: 180000 }, (err, stdout, stderr) => {
    if (err && err.code !== 0) {
      return callback(null, 'Erro ao executar análise: ' + err.message);
    }
    try {
      const output = fs.readFileSync(process.env.OUTPUT_PATH, 'utf8');
      callback(output, null);
    } catch (e) {
      callback(null, 'Erro ao ler output.txt: ' + e.message);
    }
  });
}
```

---

## PARTE 2 — Script .bat (scripts/claude.bat)

```bat
@echo off
cd /d %REPO_PATH%
claude --print "%~1" > "%OUTPUT_PATH%"
```

Variáveis usadas via .env, injetadas pelo Node antes de executar.

---

## PARTE 3 — Plugin Chrome (plugin/)

### manifest.json
```json
{
  "manifest_version": 3,
  "name": "Agente de Chamados Totvs",
  "version": "1.0.0",
  "description": "Analisa chamados do Jira e localiza problemas no código",
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["https://*.atlassian.net/*", "https://*.ngrok.io/*", "http://localhost:3000/*"],
  "action": { "default_popup": "popup.html", "default_icon": "icons/icon128.png" },
  "content_scripts": [{
    "matches": ["https://*.atlassian.net/browse/*"],
    "js": ["content.js"]
  }]
}
```

### content.js
Script injetado nas páginas de ticket do Jira. Deve:
1. Detectar se está em uma página de ticket (URL com /browse/)
2. Extrair dados do DOM do Jira:
   - Título: `[data-testid="issue.views.issue-base.foundation.summary.heading"]`
   - Descrição: `[data-testid="issue.views.issue-base.foundation.description.rendered-field"]`
   - Prioridade: badge de prioridade
   - Tipo: ícone/label do tipo do issue
   - Responsável: assignee
   - Comentários: lista de comentários (usar Superpower se disponível para pegar mais dados)
   - ID do ticket: da URL ou do título da página
3. Responder a mensagens do popup via `chrome.runtime.onMessage`

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getDadosTicket') {
    const dados = extrairDadosJira();
    sendResponse(dados);
  }
  return true;
});

function extrairDadosJira() {
  return {
    ticketId: window.location.pathname.split('/browse/')[1] || '',
    titulo: document.querySelector('[data-testid*="summary"]')?.textContent?.trim() || '',
    descricao: document.querySelector('[data-testid*="description"]')?.textContent?.trim() || '',
    prioridade: document.querySelector('[data-testid*="priority"]')?.textContent?.trim() || '',
    tipo: document.querySelector('[data-testid*="issuetype"]')?.textContent?.trim() || '',
    responsavel: document.querySelector('[data-testid*="assignee"]')?.textContent?.trim() || '',
    comentarios: Array.from(document.querySelectorAll('[data-testid*="comment"]'))
      .map(el => el.textContent?.trim()).join('\n') || '',
    historico: ''
  };
}
```

### popup.html
Interface do plugin. Deve conter:

**Header**
- Nome "Agente de Chamados" + indicador de status do servidor (verde/vermelho)
- Status: bolinha verde = servidor online / vermelha = offline

**Seção: Dados do ticket (preenchidos automaticamente via Jira)**
- ID do ticket + título em campo read-only
- Indicador "Dados carregados do Jira ✓" ou "Não foi possível carregar dados"

**Seção: Funcionalidades com problema (multiselect com tags)**
- Visual: campo com tags removíveis — cada funcionalidade selecionada vira uma tag com X
  Exemplo: [ Apontamento por cronômetro ×  Login × ] ∨
- Lista de opções carregada via GET /funcionalidades
- Dev pode selecionar UMA ou VÁRIAS funcionalidades
- Ao menos uma obrigatória para habilitar o botão Iniciar
- Placeholder: "Selecione a ou as funcionalidades que estão com o problema"

**Seção: Anexar arquivo de simulação**
- Área de drop zone (drag & drop) + botão "browse"
- Aceita apenas PDF
- Mostra nome do arquivo após seleção
- Obrigatório para habilitar o botão Iniciar

**Seção: Observação adicional (opcional)**
- Checkbox: "Adicionar informações para o agente"
- Se marcado: exibe textarea abaixo
- Placeholder: "Descreva o passo a passo do erro, mensagem exata, comportamento esperado vs real..."
- Se desmarcado: textarea oculta e campo não é enviado

**Botão Iniciar**
- Texto: "Iniciar"
- Desabilitado (cinza) até: ao menos uma funcionalidade + PDF selecionados
- Habilitado quando pronto
- Durante análise: spinner + "Analisando... pode levar até 3 minutos"

**Área de resultado**
- Exibe o output.txt formatado em seções visuais:
  - Arquivos analisados
  - Localização do problema (destaque visual — arquivo + função + linha)
  - Causa provável
  - Como resolver
  - Observações
- Botão "Copiar resultado"
- Botão "Nova análise"

**Tamanho do popup**
- Largura: 480px
- Altura: auto (cresce conforme conteúdo, não usar altura fixa)

### popup.js — fluxo principal

```javascript
const SERVER_URL = 'https://SEU-NGROK-URL-AQUI'; // ou http://localhost:3000

// Ao abrir o popup
document.addEventListener('DOMContentLoaded', async () => {
  await verificarServidor();
  await carregarFuncionalidades();
  await carregarDadosTicket();
});

async function verificarServidor() {
  // GET /health — atualiza indicador de status
}

async function carregarFuncionalidades() {
  // GET /funcionalidades — monta checkboxes dinamicamente
}

async function carregarDadosTicket() {
  // chrome.tabs.sendMessage para content.js — preenche campos read-only
}

async function analisar() {
  // Valida seleções
  // Monta FormData com todos os dados + PDF
  // POST /analisar
  // Exibe loading
  // Ao retornar: renderiza resultado formatado
}
```

---

## PARTE 4 — ngrok

### Instalação
```bash
# Baixar em https://ngrok.com/download
# Ou via chocolatey:
choco install ngrok
```

### Uso
```bash
# Terminal 1: servidor Node
cd agente-chamados/server
npm install
npm start

# Terminal 2: ngrok
ngrok http 3000
# Copia a URL gerada (ex: https://abc123.ngrok.io)
# Cola no popup.js onde está SERVER_URL
```

---

## PARTE 5 — Instalar o plugin no Chrome

```
1. chrome://extensions
2. Ativar "Modo do desenvolvedor"
3. "Carregar sem compactação"
4. Selecionar pasta: agente-chamados/plugin
5. Acessar ticket no Jira e clicar no ícone
```

---

## Regras de desenvolvimento

1. JavaScript puro no plugin (sem frameworks)
2. Logs claros no console do servidor para facilitar debug
3. Tratar todos os erros com mensagens claras pro plugin exibir
4. Todos os caminhos configuráveis via .env — nenhum caminho hardcoded
5. Plugin funciona mesmo sem Superpower (extrai dados básicos do Jira)
6. PDF é deletado da pasta temp após a análise
7. Código comentado em português

---

## Ordem de desenvolvimento (incremental)

1. Servidor: GET /health e testar com curl
2. Servidor: GET /funcionalidades lendo o Funcionalidades.md
3. claude.bat: testar manualmente no terminal com um prompt simples
4. Servidor: POST /analisar completo — testar com Postman enviando PDF
5. Plugin: manifest.json + popup.html básico — carregar no Chrome
6. Plugin: content.js extraindo dados do Jira — testar em um ticket real
7. Plugin: conectar popup.js ao servidor — fluxo completo end to end
8. ngrok: expor e testar fora da máquina
9. Ajustes visuais do popup e tratamento de erros

