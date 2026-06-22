# Agente de Chamados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o sistema completo "Agente de Chamados" — um plugin Chrome que lê dados do Jira, envia para um servidor Node.js local, que executa o Claude Code no repositório do app e retorna a análise formatada para o dev.

**Architecture:** Plugin Chrome extrai dados do DOM do Jira e envia via POST para um servidor Express local (localhost:3000) junto com o PDF do chamado. O servidor monta o prompt, executa `claude.bat` (que roda `claude --print` no repositório), lê o `output.txt` gerado e retorna o resultado. O plugin renderiza a análise em seções visuais.

**Tech Stack:** Node.js + Express + Multer (servidor), Chrome Extension Manifest V3 (plugin), JavaScript puro, Claude Code CLI (`claude --print`)

---

## Mapa de Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `server/package.json` | Dependências do servidor |
| `server/.env` | Caminhos configuráveis (sem hardcode) |
| `server/index.js` | Express: GET /health, GET /funcionalidades, POST /analisar |
| `scripts/claude.bat` | Executa `claude --print` no repositório e redireciona para output.txt |
| `plugin/manifest.json` | Configuração da extensão Chrome (Manifest V3) |
| `plugin/content.js` | Extrai dados do DOM do Jira e responde mensagens do popup |
| `plugin/popup.html` | Interface do plugin (480px, auto-height) |
| `plugin/popup.css` | Estilos do popup |
| `plugin/popup.js` | Lógica do popup: carrega funcionalidades, coleta dados, envia, renderiza resultado |
| `plugin/icons/icon128.png` | Ícone da extensão |
| `temp/` | Pasta para PDFs temporários (criada pelo servidor se não existir) |
| `output.txt` | Arquivo de resultado gerado pelo Claude Code (lido pelo servidor) |

---

## Task 1: Estrutura base do servidor Node.js

**Files:**
- Create: `server/package.json`
- Create: `server/.env`

- [ ] **Step 1: Criar pasta do servidor e package.json**

```bash
mkdir server
```

Criar `server/package.json`:
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
    "multer": "^1.4.5-lts.1"
  }
}
```

- [ ] **Step 2: Criar .env com os caminhos**

Criar `server/.env` (ajustar caminhos conforme a máquina):
```
PORT=3000
REPO_PATH=C:\azure\app-bot\app-minha-producao
CONTEXT_PATH=C:\azure\app-bot
OUTPUT_PATH=C:\azure\app-bot\output.txt
BAT_PATH=C:\azure\app-bot\scripts\claude.bat
TEMP_PATH=C:\azure\app-bot\temp
```

- [ ] **Step 3: Instalar dependências**

```bash
cd server
npm install
```

Resultado esperado: pasta `node_modules` criada, sem erros.

- [ ] **Step 4: Commit**

```bash
git add server/package.json server/package-lock.json server/.env
git commit -m "feat: estrutura base do servidor Node.js"
```

---

## Task 2: Endpoint GET /health

**Files:**
- Create: `server/index.js`

- [ ] **Step 1: Criar index.js com o endpoint /health**

Criar `server/index.js`:
```javascript
// Servidor do Agente de Chamados Minha Totvs Prod
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Verifica se o servidor está rodando
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`[Servidor] Rodando em http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Testar manualmente**

```bash
cd server
node index.js
# Em outro terminal:
curl http://localhost:3000/health
```

Resultado esperado:
```json
{"status":"ok"}
```

- [ ] **Step 3: Parar o servidor (Ctrl+C) e commitar**

```bash
git add server/index.js
git commit -m "feat: endpoint GET /health"
```

---

## Task 3: Endpoint GET /funcionalidades

**Files:**
- Modify: `server/index.js`

O `Funcionalidades.md` usa o padrão `## Nome da Funcionalidade` para os títulos. O endpoint extrai esses títulos via regex.

- [ ] **Step 1: Adicionar o endpoint /funcionalidades no index.js**

Adicionar após o `app.get('/health', ...)` e antes do `app.listen`:

```javascript
const fs = require('fs');
const path = require('path');

// Retorna lista de funcionalidades do Funcionalidades.md
app.get('/funcionalidades', (req, res) => {
  try {
    const funcionalidadesMdPath = path.join(process.env.CONTEXT_PATH, 'Funcionalidades.md');
    const conteudo = fs.readFileSync(funcionalidadesMdPath, 'utf8');

    // Extrai títulos de seção: linhas que começam com "## "
    const funcionalidades = conteudo
      .split('\n')
      .filter(linha => linha.startsWith('## '))
      .map(linha => linha.replace('## ', '').trim());

    console.log(`[/funcionalidades] Retornando ${funcionalidades.length} funcionalidades`);
    res.json({ funcionalidades });
  } catch (err) {
    console.error('[/funcionalidades] Erro ao ler Funcionalidades.md:', err.message);
    res.status(500).json({ sucesso: false, erro: 'Erro ao ler Funcionalidades.md: ' + err.message });
  }
});
```

> **Atenção:** mova o `require('fs')` e `require('path')` para o topo do arquivo, logo após o `require('dotenv').config()`.

- [ ] **Step 2: Testar manualmente**

```bash
cd server
node index.js
# Em outro terminal:
curl http://localhost:3000/funcionalidades
```

Resultado esperado (funcionalidades extraídas do `Funcionalidades.md`):
```json
{
  "funcionalidades": [
    "Login",
    "Apontamento de ordem de produção por cronômetro",
    "Apontamento de ordem de produção por formulário (sem cronômetro)"
  ]
}
```

- [ ] **Step 3: Parar o servidor e commitar**

```bash
git add server/index.js
git commit -m "feat: endpoint GET /funcionalidades lendo Funcionalidades.md"
```

---

## Task 4: Script claude.bat

**Files:**
- Create: `scripts/claude.bat`

- [ ] **Step 1: Criar a pasta scripts e o arquivo .bat**

```bash
mkdir scripts
```

Criar `scripts/claude.bat`:
```bat
@echo off
:: Script que executa o Claude Code no repositório do app
:: Argumento %1: prompt completo (entre aspas)
:: Saída: redirecionada para OUTPUT_PATH pelo servidor Node

cd /d "%REPO_PATH%"
claude --print %1
```

> **Nota:** O Node injeta `REPO_PATH` como variável de ambiente do processo filho. O `claude --print` executa o Claude Code no modo não-interativo, escreve o resultado no stdout, e o Node redireciona para `output.txt`.

- [ ] **Step 2: Testar o bat manualmente no terminal**

Abra um terminal, defina a variável e teste:
```cmd
set REPO_PATH=C:\azure\app-bot\app-minha-producao
C:\azure\app-bot\scripts\claude.bat "Responda apenas: olá mundo"
```

Resultado esperado: Claude Code imprime `olá mundo` no terminal.

- [ ] **Step 3: Commitar**

```bash
git add scripts/claude.bat
git commit -m "feat: script claude.bat para executar analise via Claude Code"
```

---

## Task 5: Endpoint POST /analisar

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Adicionar multer e a função montarPrompt no index.js**

Adicionar no topo do arquivo (após os requires existentes):
```javascript
const multer = require('multer');
const { exec } = require('child_process');

// Configura multer para salvar PDFs na pasta temp/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempPath = process.env.TEMP_PATH;
    // Cria a pasta temp/ se não existir
    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { recursive: true });
    }
    cb(null, tempPath);
  },
  filename: (req, file, cb) => {
    const ticketId = req.body.ticketId || 'ticket';
    const timestamp = Date.now();
    cb(null, `${ticketId}_${timestamp}.pdf`);
  }
});
const upload = multer({ storage });

// Monta o prompt completo que será enviado ao Claude Code
function montarPrompt(dados, claudeMd, funcionalidadesMd) {
  return `
${claudeMd}

---
${funcionalidadesMd}

---
TICKET_ID      : ${dados.ticketId || ''}
TITULO         : ${dados.titulo || ''}
DESCRICAO      : ${dados.descricao || ''}
PRIORIDADE     : ${dados.prioridade || ''}
TIPO           : ${dados.tipo || ''}
RESPONSAVEL    : ${dados.responsavel || ''}
COMENTARIOS    : ${dados.comentarios || ''}
HISTORICO      : ${dados.historico || ''}
FUNCIONALIDADES: ${dados.funcionalidades || ''}
OBSERVACAO     : ${dados.observacao || 'Nenhuma observação adicional'}
ANEXO          : ${dados.pdfPath || ''}
  `.trim();
}
```

- [ ] **Step 2: Adicionar o endpoint POST /analisar**

Adicionar após o endpoint `/funcionalidades` e antes do `app.listen`:
```javascript
// Recebe os dados do plugin e executa a análise via Claude Code
app.post('/analisar', upload.single('pdf'), async (req, res) => {
  const pdfPath = req.file ? req.file.path : null;

  // Validação: PDF é obrigatório
  if (!pdfPath) {
    return res.status(400).json({ sucesso: false, erro: 'PDF do chamado não enviado.' });
  }

  try {
    // Lê os arquivos de contexto
    const claudeMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'claude.md'), 'utf8');
    const funcionalidadesMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'Funcionalidades.md'), 'utf8');

    // Monta os dados com o caminho do PDF salvo
    const dados = { ...req.body, pdfPath };
    const prompt = montarPrompt(dados, claudeMd, funcionalidadesMd);

    console.log(`[/analisar] Ticket: ${dados.ticketId} | Funcionalidades: ${dados.funcionalidades}`);
    console.log('[/analisar] Executando Claude Code...');

    // Escapa o prompt para passar como argumento ao .bat
    // Substitui aspas duplas por aspas simples para evitar quebrar o argumento
    const promptEscapado = prompt
      .replace(/"/g, "'")
      .replace(/\r?\n/g, ' ');

    const env = {
      ...process.env,
      REPO_PATH: process.env.REPO_PATH,
      OUTPUT_PATH: process.env.OUTPUT_PATH
    };

    const comando = `"${process.env.BAT_PATH}" "${promptEscapado}"`;

    exec(comando, { timeout: 180000, env }, (err, stdout, stderr) => {
      // Deleta o PDF temporário (independente de sucesso ou erro)
      try { fs.unlinkSync(pdfPath); } catch (e) { console.warn('[/analisar] Aviso: não foi possível deletar PDF:', e.message); }

      if (err && err.killed) {
        console.error('[/analisar] Timeout atingido (3 minutos)');
        return res.status(504).json({ sucesso: false, erro: 'Timeout: a análise demorou mais de 3 minutos.' });
      }

      if (err && err.code !== 0) {
        console.error('[/analisar] Erro ao executar .bat:', err.message);
        return res.status(500).json({ sucesso: false, erro: 'Erro ao executar análise: ' + err.message });
      }

      // Lê o output.txt gerado pelo Claude Code
      try {
        const output = fs.readFileSync(process.env.OUTPUT_PATH, 'utf8');
        console.log('[/analisar] Análise concluída com sucesso.');
        res.json({ sucesso: true, analise: output });
      } catch (e) {
        console.error('[/analisar] Erro ao ler output.txt:', e.message);
        res.status(500).json({ sucesso: false, erro: 'Erro ao ler resultado da análise: ' + e.message });
      }
    });
  } catch (err) {
    // Deleta o PDF em caso de erro antes do exec
    if (pdfPath) {
      try { fs.unlinkSync(pdfPath); } catch (e) { /* ignora */ }
    }
    console.error('[/analisar] Erro interno:', err.message);
    res.status(500).json({ sucesso: false, erro: 'Erro interno: ' + err.message });
  }
});
```

- [ ] **Step 3: Testar com curl enviando um PDF de teste**

```bash
cd server
node index.js
# Em outro terminal (precisa de um PDF qualquer para testar):
curl -X POST http://localhost:3000/analisar \
  -F "ticketId=TEST-001" \
  -F "titulo=Teste de análise" \
  -F "descricao=Descrição do teste" \
  -F "prioridade=Alta" \
  -F "tipo=bug" \
  -F "responsavel=Dev" \
  -F "comentarios=Nenhum" \
  -F "historico=Nenhum" \
  -F "funcionalidades=Login" \
  -F "pdf=@C:\caminho\para\qualquer\arquivo.pdf"
```

Resultado esperado: `{ "sucesso": true, "analise": "... conteúdo do output.txt ..." }`

- [ ] **Step 4: Parar o servidor e commitar**

```bash
git add server/index.js
git commit -m "feat: endpoint POST /analisar com execucao do Claude Code via .bat"
```

---

## Task 6: Plugin — manifest.json e ícone

**Files:**
- Create: `plugin/manifest.json`
- Create: `plugin/icons/icon128.png`

- [ ] **Step 1: Criar a pasta plugin/icons**

```bash
mkdir plugin\icons
```

- [ ] **Step 2: Criar plugin/manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Agente de Chamados Totvs",
  "version": "1.0.0",
  "description": "Analisa chamados do Jira e localiza problemas no código",
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": [
    "https://*.atlassian.net/*",
    "http://localhost:3000/*"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icons/icon128.png"
  },
  "content_scripts": [{
    "matches": ["https://*.atlassian.net/browse/*"],
    "js": ["content.js"]
  }]
}
```

- [ ] **Step 3: Criar um ícone placeholder 128x128**

Crie um arquivo PNG 128x128 qualquer e salve em `plugin/icons/icon128.png`. Pode usar qualquer imagem PNG renomeada — será substituída por um ícone definitivo depois.

- [ ] **Step 4: Carregar no Chrome para validar o manifest**

```
1. Abrir chrome://extensions
2. Ativar "Modo do desenvolvedor" (toggle no canto superior direito)
3. Clicar em "Carregar sem compactação"
4. Selecionar a pasta: C:\azure\app-bot\plugin
```

Resultado esperado: extensão carregada sem erros vermelhos.

- [ ] **Step 5: Commitar**

```bash
git add plugin/manifest.json plugin/icons/icon128.png
git commit -m "feat: manifest.json do plugin Chrome"
```

---

## Task 7: content.js — extração de dados do Jira

**Files:**
- Create: `plugin/content.js`

- [ ] **Step 1: Criar plugin/content.js**

```javascript
// Script injetado nas páginas de ticket do Jira
// Extrai dados do DOM e responde mensagens do popup

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getDadosTicket') {
    const dados = extrairDadosJira();
    sendResponse(dados);
  }
  return true; // mantém o canal aberto para resposta assíncrona
});

function extrairDadosJira() {
  // Extrai o ID do ticket da URL (ex: /browse/DMANUFATURA-14158)
  const urlPartes = window.location.pathname.split('/browse/');
  const ticketId = urlPartes.length > 1 ? urlPartes[1] : '';

  // Seletores baseados na estrutura do Jira Cloud
  const titulo = document.querySelector('[data-testid="issue.views.issue-base.foundation.summary.heading"]')
    ?.textContent?.trim() || '';

  const descricao = document.querySelector('[data-testid="issue.views.issue-base.foundation.description.rendered-field"]')
    ?.textContent?.trim() || '';

  const prioridade = document.querySelector('[data-testid*="priority"] span')
    ?.textContent?.trim() || '';

  const tipo = document.querySelector('[data-testid*="issuetype"] span')
    ?.textContent?.trim() || '';

  const responsavel = document.querySelector('[data-testid*="assignee"]')
    ?.textContent?.trim() || '';

  // Coleta todos os comentários visíveis
  const comentariosEls = document.querySelectorAll('[data-testid*="comment-base"]');
  const comentarios = Array.from(comentariosEls)
    .map(el => el.textContent?.trim())
    .filter(Boolean)
    .join('\n---\n');

  return {
    ticketId,
    titulo,
    descricao,
    prioridade,
    tipo,
    responsavel,
    comentarios,
    historico: '' // histórico de alterações não é acessível via DOM público do Jira
  };
}
```

- [ ] **Step 2: Recarregar o plugin no Chrome e testar**

```
1. chrome://extensions → clicar no ícone de recarregar da extensão
2. Abrir qualquer ticket no Jira: https://seu-dominio.atlassian.net/browse/TICKET-123
3. Abrir DevTools (F12) → Console
4. Executar no console:
   chrome.runtime.sendMessage({action: 'getDadosTicket'}, console.log)
```

Resultado esperado: objeto com `ticketId`, `titulo`, `descricao`, etc. preenchidos com os dados do ticket aberto.

- [ ] **Step 3: Commitar**

```bash
git add plugin/content.js
git commit -m "feat: content.js extraindo dados do DOM do Jira"
```

---

## Task 8: popup.html e popup.css — interface do plugin

**Files:**
- Create: `plugin/popup.html`
- Create: `plugin/popup.css`

- [ ] **Step 1: Criar plugin/popup.html**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agente de Chamados</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>

  <!-- Header -->
  <header class="header">
    <span class="header-title">Agente de Chamados</span>
    <span class="status-indicator" id="statusIndicator" title="Verificando servidor...">
      <span class="status-dot" id="statusDot"></span>
      <span class="status-text" id="statusText">Verificando...</span>
    </span>
  </header>

  <!-- Tela principal (formulário) -->
  <div id="telaFormulario">

    <!-- Dados do ticket -->
    <section class="section">
      <label class="section-label">Ticket</label>
      <div class="ticket-info" id="ticketInfo">
        <span class="ticket-id" id="ticketId">—</span>
        <span class="ticket-titulo" id="ticketTitulo">Carregando dados do Jira...</span>
      </div>
      <div class="jira-status" id="jiraStatus"></div>
    </section>

    <!-- Funcionalidades com problema (multiselect com tags) -->
    <section class="section">
      <label class="section-label">Funcionalidades com problema <span class="required">*</span></label>
      <div class="tags-container" id="tagsContainer">
        <!-- Tags das funcionalidades selecionadas -->
      </div>
      <div class="select-wrapper">
        <select id="funcionalidadesSelect" class="select-input">
          <option value="" disabled selected>Selecione a ou as funcionalidades com problema</option>
        </select>
      </div>
    </section>

    <!-- Anexar PDF -->
    <section class="section">
      <label class="section-label">PDF do chamado <span class="required">*</span></label>
      <div class="dropzone" id="dropzone">
        <input type="file" id="pdfInput" accept=".pdf" class="file-input" />
        <div class="dropzone-content" id="dropzoneContent">
          <span class="dropzone-icon">📎</span>
          <span class="dropzone-text">Arraste o PDF aqui ou <strong>clique para selecionar</strong></span>
          <span class="dropzone-hint">Apenas arquivos .pdf</span>
        </div>
        <div class="dropzone-filename" id="dropzoneFilename" style="display:none"></div>
      </div>
    </section>

    <!-- Observação adicional -->
    <section class="section">
      <label class="checkbox-label">
        <input type="checkbox" id="checkObservacao" />
        Adicionar informações para o agente
      </label>
      <textarea
        id="observacaoTextarea"
        class="textarea"
        style="display:none"
        placeholder="Descreva o passo a passo do erro, mensagem exata, comportamento esperado vs real, versão afetada..."
        rows="4"
      ></textarea>
    </section>

    <!-- Botão iniciar -->
    <div class="actions">
      <button id="btnIniciar" class="btn btn-primary" disabled>Iniciar</button>
    </div>

  </div>

  <!-- Tela de loading -->
  <div id="telaLoading" style="display:none" class="loading-screen">
    <div class="spinner"></div>
    <p class="loading-text">Analisando...</p>
    <p class="loading-hint">Pode levar até 3 minutos</p>
  </div>

  <!-- Tela de resultado -->
  <div id="telaResultado" style="display:none">

    <div class="resultado-header">
      <h2 class="resultado-titulo">Análise concluída</h2>
    </div>

    <div class="resultado-secao" id="secaoLocalizacao">
      <h3 class="secao-titulo">📍 Localização do Problema</h3>
      <div class="secao-conteudo destaque" id="conteudoLocalizacao"></div>
    </div>

    <div class="resultado-secao" id="secaoCausa">
      <h3 class="secao-titulo">🔍 Causa Provável</h3>
      <div class="secao-conteudo" id="conteudoCausa"></div>
    </div>

    <div class="resultado-secao" id="secaoResolver">
      <h3 class="secao-titulo">🛠️ Como Resolver</h3>
      <div class="secao-conteudo" id="conteudoResolver"></div>
    </div>

    <div class="resultado-secao" id="secaoArquivos">
      <h3 class="secao-titulo">📂 Arquivos Analisados</h3>
      <div class="secao-conteudo" id="conteudoArquivos"></div>
    </div>

    <div class="resultado-secao" id="secaoObservacoes">
      <h3 class="secao-titulo">⚠️ Observações</h3>
      <div class="secao-conteudo" id="conteudoObservacoes"></div>
    </div>

    <div class="actions resultado-actions">
      <button id="btnCopiar" class="btn btn-secondary">Copiar resultado</button>
      <button id="btnNovaAnalise" class="btn btn-primary">Nova análise</button>
    </div>

  </div>

  <!-- Tela de erro -->
  <div id="telaErro" style="display:none" class="erro-screen">
    <p class="erro-icone">❌</p>
    <p class="erro-mensagem" id="erroMensagem"></p>
    <button id="btnTentarNovamente" class="btn btn-primary">Tentar novamente</button>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Criar plugin/popup.css**

```css
/* Reset e base */
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  width: 480px;
  min-height: 200px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  color: #1a1a2e;
  background: #f8f9fa;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #1a1a2e;
  color: white;
}

.header-title { font-weight: 600; font-size: 14px; }

.status-indicator { display: flex; align-items: center; gap: 6px; font-size: 11px; }

.status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #888;
}

.status-dot.online { background: #4caf50; }
.status-dot.offline { background: #f44336; }

/* Sections */
.section {
  padding: 12px 16px;
  border-bottom: 1px solid #e9ecef;
  background: white;
}

.section-label {
  display: block;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6c757d;
  margin-bottom: 8px;
}

.required { color: #dc3545; }

/* Ticket info */
.ticket-info { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.ticket-id { font-weight: 700; color: #0052cc; font-size: 12px; }
.ticket-titulo { font-size: 12px; color: #333; }

.jira-status {
  margin-top: 4px;
  font-size: 11px;
  color: #6c757d;
}

.jira-status.ok { color: #4caf50; }
.jira-status.erro { color: #f44336; }

/* Tags (funcionalidades selecionadas) */
.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  min-height: 0;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: #e3f2fd;
  border: 1px solid #90caf9;
  border-radius: 12px;
  font-size: 11px;
  color: #1565c0;
}

.tag-remove {
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  color: #1565c0;
  border: none;
  background: none;
  padding: 0;
}

.tag-remove:hover { color: #dc3545; }

/* Select */
.select-wrapper { position: relative; }

.select-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background: white;
  font-size: 12px;
  color: #495057;
  cursor: pointer;
  appearance: none;
}

.select-input:focus { outline: none; border-color: #0052cc; }

/* Dropzone */
.dropzone {
  position: relative;
  border: 2px dashed #ced4da;
  border-radius: 6px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  background: #fafafa;
}

.dropzone:hover, .dropzone.dragover {
  border-color: #0052cc;
  background: #f0f4ff;
}

.dropzone.com-arquivo { border-color: #4caf50; background: #f1f8f1; }

.file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

.dropzone-content { display: flex; flex-direction: column; gap: 4px; pointer-events: none; }
.dropzone-icon { font-size: 20px; }
.dropzone-text { font-size: 12px; color: #495057; }
.dropzone-hint { font-size: 11px; color: #adb5bd; }
.dropzone-filename { font-size: 12px; color: #4caf50; font-weight: 500; }

/* Checkbox e textarea */
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  color: #495057;
}

.textarea {
  width: 100%;
  margin-top: 10px;
  padding: 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  color: #495057;
  resize: vertical;
}

.textarea:focus { outline: none; border-color: #0052cc; }

/* Botões */
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  background: white;
  border-top: 1px solid #e9ecef;
}

.btn {
  padding: 8px 20px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-primary { background: #0052cc; color: white; }
.btn-primary:not(:disabled):hover { background: #0043a8; }

.btn-secondary { background: #e9ecef; color: #495057; }
.btn-secondary:hover { background: #dee2e6; }

/* Loading */
.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  background: white;
  gap: 12px;
}

.spinner {
  width: 36px; height: 36px;
  border: 3px solid #e9ecef;
  border-top-color: #0052cc;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.loading-text { font-weight: 600; color: #1a1a2e; }
.loading-hint { font-size: 11px; color: #adb5bd; }

/* Resultado */
.resultado-header {
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e9ecef;
}

.resultado-titulo { font-size: 14px; color: #1a1a2e; }

.resultado-secao { background: white; border-bottom: 1px solid #e9ecef; }

.secao-titulo {
  padding: 10px 16px 0;
  font-size: 12px;
  font-weight: 700;
  color: #495057;
}

.secao-conteudo {
  padding: 6px 16px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: #333;
  white-space: pre-wrap;
}

.secao-conteudo.destaque {
  background: #fff8e1;
  border-left: 3px solid #ffc107;
  margin: 6px 16px 10px;
  padding: 8px 12px;
  border-radius: 0 4px 4px 0;
  font-family: monospace;
  font-size: 11px;
}

.resultado-actions { border-top: 1px solid #e9ecef; }

/* Erro */
.erro-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px;
  background: white;
  gap: 12px;
  text-align: center;
}

.erro-icone { font-size: 32px; }
.erro-mensagem { font-size: 12px; color: #dc3545; max-width: 380px; line-height: 1.5; }
```

- [ ] **Step 3: Recarregar o plugin e verificar o HTML**

```
1. chrome://extensions → recarregar a extensão
2. Abrir qualquer aba do Chrome e clicar no ícone do plugin
3. O popup deve abrir em 480px de largura sem erros de console
```

- [ ] **Step 4: Commitar**

```bash
git add plugin/popup.html plugin/popup.css
git commit -m "feat: popup.html e popup.css da interface do plugin"
```

---

## Task 9: popup.js — lógica completa do plugin

**Files:**
- Create: `plugin/popup.js`

- [ ] **Step 1: Criar plugin/popup.js**

```javascript
// Lógica do popup do Agente de Chamados
// URL do servidor local — alterar para URL da VM quando migrar
const SERVER_URL = 'http://localhost:3000';

// Estado da aplicação
const state = {
  funcionalidadesSelecionadas: [],  // lista de strings selecionadas
  pdfFile: null,                     // File object do PDF
  dadosTicket: {}                    // dados extraídos do Jira
};

// --- Inicialização ---

document.addEventListener('DOMContentLoaded', async () => {
  await verificarServidor();
  await carregarFuncionalidades();
  await carregarDadosTicket();
  configurarEventos();
});

// --- Verificação do servidor ---

async function verificarServidor() {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.classList.add('online');
      text.textContent = 'Servidor online';
    } else {
      throw new Error('resposta não ok');
    }
  } catch (e) {
    dot.classList.add('offline');
    text.textContent = 'Servidor offline';
    console.warn('[popup] Servidor indisponível:', e.message);
  }
}

// --- Funcionalidades ---

async function carregarFuncionalidades() {
  const select = document.getElementById('funcionalidadesSelect');
  try {
    const res = await fetch(`${SERVER_URL}/funcionalidades`);
    const { funcionalidades } = await res.json();
    funcionalidades.forEach(nome => {
      const opt = document.createElement('option');
      opt.value = nome;
      opt.textContent = nome;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('[popup] Erro ao carregar funcionalidades:', e.message);
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Erro ao carregar funcionalidades';
    opt.disabled = true;
    select.appendChild(opt);
  }
}

function adicionarTag(nome) {
  // Evita duplicata
  if (state.funcionalidadesSelecionadas.includes(nome)) return;

  state.funcionalidadesSelecionadas.push(nome);

  const container = document.getElementById('tagsContainer');
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.dataset.valor = nome;
  tag.innerHTML = `${nome} <button class="tag-remove" title="Remover">×</button>`;
  tag.querySelector('.tag-remove').addEventListener('click', () => removerTag(nome));
  container.appendChild(tag);

  verificarBotao();
}

function removerTag(nome) {
  state.funcionalidadesSelecionadas = state.funcionalidadesSelecionadas.filter(f => f !== nome);
  const container = document.getElementById('tagsContainer');
  const tag = container.querySelector(`[data-valor="${nome}"]`);
  if (tag) container.removeChild(tag);
  verificarBotao();
}

// --- Dados do Jira ---

async function carregarDadosTicket() {
  const statusEl = document.getElementById('jiraStatus');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('/browse/')) {
      statusEl.textContent = 'Abra um ticket do Jira para carregar os dados automaticamente.';
      return;
    }

    const dados = await chrome.tabs.sendMessage(tab.id, { action: 'getDadosTicket' });

    if (dados && dados.ticketId) {
      state.dadosTicket = dados;
      document.getElementById('ticketId').textContent = dados.ticketId;
      document.getElementById('ticketTitulo').textContent = dados.titulo || '(sem título)';
      statusEl.textContent = '✓ Dados carregados do Jira';
      statusEl.className = 'jira-status ok';
    } else {
      statusEl.textContent = 'Não foi possível carregar os dados do ticket.';
      statusEl.className = 'jira-status erro';
    }
  } catch (e) {
    statusEl.textContent = 'Não foi possível carregar os dados do ticket.';
    statusEl.className = 'jira-status erro';
    console.warn('[popup] Erro ao carregar dados do Jira:', e.message);
  }
}

// --- Eventos ---

function configurarEventos() {
  // Seleção de funcionalidade via select
  const select = document.getElementById('funcionalidadesSelect');
  select.addEventListener('change', () => {
    if (select.value) {
      adicionarTag(select.value);
      select.value = ''; // reseta o select após adicionar
    }
  });

  // Dropzone: arquivo via input
  const pdfInput = document.getElementById('pdfInput');
  pdfInput.addEventListener('change', () => {
    if (pdfInput.files[0]) definirPdf(pdfInput.files[0]);
  });

  // Dropzone: drag & drop
  const dropzone = document.getElementById('dropzone');
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      definirPdf(file);
    }
  });

  // Checkbox observação
  const checkObs = document.getElementById('checkObservacao');
  const textarea = document.getElementById('observacaoTextarea');
  checkObs.addEventListener('change', () => {
    textarea.style.display = checkObs.checked ? 'block' : 'none';
  });

  // Botão iniciar
  document.getElementById('btnIniciar').addEventListener('click', analisar);

  // Botão copiar resultado
  document.getElementById('btnCopiar').addEventListener('click', copiarResultado);

  // Botão nova análise
  document.getElementById('btnNovaAnalise').addEventListener('click', resetarFormulario);

  // Botão tentar novamente (tela de erro)
  document.getElementById('btnTentarNovamente').addEventListener('click', resetarFormulario);
}

function definirPdf(file) {
  state.pdfFile = file;
  const dropzone = document.getElementById('dropzone');
  const content = document.getElementById('dropzoneContent');
  const filename = document.getElementById('dropzoneFilename');

  dropzone.classList.add('com-arquivo');
  content.style.display = 'none';
  filename.style.display = 'block';
  filename.textContent = `✓ ${file.name}`;
  verificarBotao();
}

function verificarBotao() {
  const btn = document.getElementById('btnIniciar');
  const pronto = state.funcionalidadesSelecionadas.length > 0 && state.pdfFile !== null;
  btn.disabled = !pronto;
}

// --- Análise ---

async function analisar() {
  mostrarTela('loading');

  const formData = new FormData();
  formData.append('ticketId', state.dadosTicket.ticketId || '');
  formData.append('titulo', state.dadosTicket.titulo || '');
  formData.append('descricao', state.dadosTicket.descricao || '');
  formData.append('prioridade', state.dadosTicket.prioridade || '');
  formData.append('tipo', state.dadosTicket.tipo || '');
  formData.append('responsavel', state.dadosTicket.responsavel || '');
  formData.append('comentarios', state.dadosTicket.comentarios || '');
  formData.append('historico', state.dadosTicket.historico || '');
  formData.append('funcionalidades', state.funcionalidadesSelecionadas.join(', '));
  formData.append('pdf', state.pdfFile);

  const checkObs = document.getElementById('checkObservacao');
  if (checkObs.checked) {
    const obs = document.getElementById('observacaoTextarea').value.trim();
    if (obs) formData.append('observacao', obs);
  }

  try {
    const res = await fetch(`${SERVER_URL}/analisar`, {
      method: 'POST',
      body: formData
    });

    const json = await res.json();

    if (json.sucesso) {
      renderizarResultado(json.analise);
      mostrarTela('resultado');
    } else {
      mostrarErro(json.erro || 'Erro desconhecido na análise.');
    }
  } catch (e) {
    mostrarErro('Não foi possível conectar ao servidor. Verifique se ele está rodando em localhost:3000.');
  }
}

// --- Renderização do resultado ---

function renderizarResultado(texto) {
  // O output.txt segue um formato com seções delimitadas por "---"
  // Extrai cada seção pelo seu título

  document.getElementById('conteudoLocalizacao').textContent =
    extrairSecao(texto, 'LOCALIZAÇÃO DO PROBLEMA');

  document.getElementById('conteudoCausa').textContent =
    extrairSecao(texto, 'CAUSA PROVÁVEL');

  document.getElementById('conteudoResolver').textContent =
    extrairSecao(texto, 'COMO RESOLVER');

  document.getElementById('conteudoArquivos').textContent =
    extrairSecao(texto, 'ARQUIVOS ANALISADOS');

  document.getElementById('conteudoObservacoes').textContent =
    extrairSecao(texto, 'OBSERVAÇÕES');
}

function extrairSecao(texto, nomeSecao) {
  // Padrão: "--- NOME DA SEÇÃO ---\n conteúdo \n ---"
  const regex = new RegExp(
    `[-]{2,}\\s*${nomeSecao}\\s*[-]{2,}\\s*([\\s\\S]*?)(?=[-]{2,}|$)`,
    'i'
  );
  const match = texto.match(regex);
  return match ? match[1].trim() : '';
}

function copiarResultado() {
  const btn = document.getElementById('btnCopiar');
  // Coleta todo o texto das seções
  const secoes = ['conteudoLocalizacao', 'conteudoCausa', 'conteudoResolver', 'conteudoArquivos', 'conteudoObservacoes'];
  const texto = secoes
    .map(id => document.getElementById(id).textContent)
    .filter(Boolean)
    .join('\n\n');

  navigator.clipboard.writeText(texto).then(() => {
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = 'Copiar resultado'; }, 2000);
  });
}

// --- Controle de telas ---

function mostrarTela(tela) {
  document.getElementById('telaFormulario').style.display = tela === 'formulario' ? 'block' : 'none';
  document.getElementById('telaLoading').style.display  = tela === 'loading'    ? 'flex'  : 'none';
  document.getElementById('telaResultado').style.display = tela === 'resultado' ? 'block' : 'none';
  document.getElementById('telaErro').style.display     = tela === 'erro'       ? 'flex'  : 'none';
}

function mostrarErro(mensagem) {
  document.getElementById('erroMensagem').textContent = mensagem;
  mostrarTela('erro');
}

function resetarFormulario() {
  // Reseta estado
  state.funcionalidadesSelecionadas = [];
  state.pdfFile = null;

  // Limpa tags
  document.getElementById('tagsContainer').innerHTML = '';

  // Reseta dropzone
  const dropzone = document.getElementById('dropzone');
  dropzone.classList.remove('com-arquivo');
  document.getElementById('dropzoneContent').style.display = 'flex';
  document.getElementById('dropzoneFilename').style.display = 'none';
  document.getElementById('pdfInput').value = '';

  // Reseta observação
  document.getElementById('checkObservacao').checked = false;
  document.getElementById('observacaoTextarea').style.display = 'none';
  document.getElementById('observacaoTextarea').value = '';

  // Desabilita botão
  document.getElementById('btnIniciar').disabled = true;

  mostrarTela('formulario');
}
```

- [ ] **Step 2: Recarregar e testar o fluxo completo**

```
1. chrome://extensions → recarregar extensão
2. Garantir que o servidor Node está rodando: cd server && node index.js
3. Abrir um ticket no Jira e clicar no ícone do plugin
4. Verificar:
   - Status do servidor: deve aparecer verde "Servidor online"
   - Dados do ticket: ID e título carregados automaticamente
   - Funcionalidades: lista carregada do GET /funcionalidades
   - Selecionar uma funcionalidade: tag aparece
   - Remover tag: clica no X
   - Anexar PDF: arrastar ou clicar no browse
   - Botão "Iniciar" habilita após selecionar funcionalidade + PDF
```

- [ ] **Step 3: Testar o fluxo de análise end-to-end**

```
1. Com o servidor rodando e um ticket Jira aberto no Chrome
2. Selecionar uma funcionalidade + anexar PDF real do chamado
3. Clicar em "Iniciar"
4. Aguardar até 3 minutos
5. Verificar se o resultado aparece nas seções visuais
6. Testar "Copiar resultado" e "Nova análise"
```

- [ ] **Step 4: Commitar**

```bash
git add plugin/popup.js
git commit -m "feat: popup.js com fluxo completo de analise e renderizacao do resultado"
```

---

## Task 10: Criar output.txt inicial e pasta temp/

**Files:**
- Create: `output.txt`
- Create: `temp/.gitkeep`

- [ ] **Step 1: Criar output.txt vazio**

Criar `output.txt` na raiz de `C:\azure\app-bot\` com conteúdo vazio (o servidor vai sobrescrever após a primeira análise).

- [ ] **Step 2: Criar pasta temp com .gitkeep**

```bash
mkdir temp
echo "" > temp/.gitkeep
```

- [ ] **Step 3: Commitar**

```bash
git add output.txt temp/.gitkeep
git commit -m "feat: output.txt e pasta temp para PDFs temporarios"
```

---

## Task 11: Validação final end-to-end

**Sem novos arquivos — validação manual completa.**

- [ ] **Step 1: Iniciar o servidor**

```bash
cd C:\azure\app-bot\server
node index.js
```

Resultado esperado: `[Servidor] Rodando em http://localhost:3000`

- [ ] **Step 2: Verificar os 3 endpoints**

```bash
curl http://localhost:3000/health
# Esperado: {"status":"ok"}

curl http://localhost:3000/funcionalidades
# Esperado: {"funcionalidades":["Login","Apontamento de ordem de produção por cronômetro",...]}
```

- [ ] **Step 3: Abrir um ticket real no Jira e usar o plugin**

```
1. Abrir https://seu-dominio.atlassian.net/browse/TICKET-XXX
2. Clicar no ícone do Agente de Chamados
3. Confirmar: status verde, dados do Jira carregados
4. Selecionar a funcionalidade com problema
5. Anexar o PDF do chamado exportado do Jira
6. Clicar em Iniciar e aguardar
7. Confirmar: resultado aparece com Localização, Causa, Como Resolver
```

- [ ] **Step 4: Adicionar server/ ao .gitignore do node_modules**

Criar ou atualizar `.gitignore` na raiz:
```
server/node_modules/
temp/*.pdf
```

- [ ] **Step 5: Commit final**

```bash
git add .gitignore
git commit -m "chore: gitignore para node_modules e PDFs temporarios"
```

---

## Resumo da Ordem de Execução

1. Task 1 → Task 2 → Task 3 (servidor completo sem o POST)
2. Task 4 (claude.bat — testar manualmente antes de integrar)
3. Task 5 (POST /analisar — integra o bat)
4. Task 6 (manifest.json — carregar no Chrome)
5. Task 7 (content.js — testar extração do Jira)
6. Task 8 → Task 9 (popup completo)
7. Task 10 → Task 11 (validação final)
