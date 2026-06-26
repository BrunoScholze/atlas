# Atlas Code — Três Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar repositório local por projeto ao PROJETOS.md, reformatar ARQUIVOS ANALISADOS em árvore, e adicionar botão de copiar nome de arquivo nos blocos diff.

**Architecture:** Três mudanças independentes — (1) servidor Node lê `Repositorio:` do PROJETOS.md em vez do `.env`, (2) CLAUDE.md instrui o agente a gerar ARQUIVOS ANALISADOS em escadinha e popup.js renderiza com `<pre>`, (3) `construirDiffBlock()` ganha um botão ⎘ que copia o caminho para o clipboard.

**Tech Stack:** Node.js/Express (server), Chrome Extension MV3 (plugin), Markdown (CLAUDE.md/PROJETOS.md)

## Global Constraints

- Nenhum handler `onclick` inline no HTML — todos os eventos via `addEventListener` (CSP MV3)
- O `.env` permanece em `server/.env` (dotenv já configurado assim)
- `escapeHtml()` (com `e` minúsculo) é a função usada dentro de `construirDiffBlock()` — não confundir com `escaparHtml()` usada em `renderCodeBlock()`
- Após qualquer mudança no plugin, recarregar a extensão em `chrome://extensions` antes de testar

---

## Task 1: Repositório por projeto (PROJETOS.md + servidor)

**Files:**
- Modify: `PROJETOS.md`
- Modify: `server/index.js` — `parseProjetos()` linha 95 e `executarAnalise()` linha 530
- Modify: `server/.env`
- Move: pasta `app-minha-producao/` → `repos/app-minha-producao/`

**Interfaces:**
- Produces: `parseProjetos()` retorna objetos com campo `repositorio: string` adicional
- Produces: `executarAnalise()` resolve `repoPath` a partir de `proj.repositorio` com fallback para `REPO_PATH`

---

- [ ] **Step 1: Criar pasta `repos/` e mover o repositório**

No PowerShell:
```powershell
New-Item -ItemType Directory -Path "C:\azure\atlas\repos" -Force
Move-Item "C:\azure\atlas\app-minha-producao" "C:\azure\atlas\repos\app-minha-producao"
```

Verificar:
```powershell
Test-Path "C:\azure\atlas\repos\app-minha-producao\src"
# deve retornar True
```

- [ ] **Step 2: Atualizar `server/.env`**

Arquivo `server/.env` — alterar a linha `REPO_PATH`:

```
PORT=3000
CONTEXT_PATH=C:\azure\atlas
OUTPUT_PATH=C:\azure\atlas\output.txt
REPO_PATH=C:\azure\atlas\repos\app-minha-producao
TEMP_PATH=C:\azure\atlas\temp
```

- [ ] **Step 3: Adicionar campo `Repositorio:` em `PROJETOS.md`**

Arquivo `PROJETOS.md` — inserir a linha `Repositorio:` no bloco do projeto:

```markdown
## app-minha-prod
Nome: APP Minha Prod
Descrição: Aplicativo mobile Ionic/Angular — Minha Totvs Prod
CLAUDE: CLAUDE.md
Funcionalidades: Funcionalidades-App-minha-prod.md
Repositorio: repos/app-minha-producao
Azure: https://dev.azure.com/totvstfs/Linha-Datasul-Mobile/_git/app-minha-producao
Status: ativo
```

- [ ] **Step 4: Atualizar `parseProjetos()` em `server/index.js`**

Localizar a função `parseProjetos()` (linha 95). Adicionar `repositorio` ao objeto retornado.

Trecho atual (linha 106–115):
```js
    projetos.push({
      slug,
      nome: meta.nome || slug,
      descricao: meta['descrição'] || meta.descricao || '',
      status: meta.status || 'ativo',
      claude: meta.claude || 'CLAUDE.md',
      funcionalidades: meta.funcionalidades || 'Funcionalidades.md',
      azure: meta.azure || ''
    });
```

Substituir por:
```js
    projetos.push({
      slug,
      nome: meta.nome || slug,
      descricao: meta['descrição'] || meta.descricao || '',
      status: meta.status || 'ativo',
      claude: meta.claude || 'CLAUDE.md',
      funcionalidades: meta.funcionalidades || 'Funcionalidades.md',
      repositorio: meta.repositorio || '',
      azure: meta.azure || ''
    });
```

- [ ] **Step 5: Usar `proj.repositorio` em `executarAnalise()`**

Localizar em `executarAnalise()` as linhas que definem `repoPath` (linha ~530):

```js
    const outputPath = process.env.OUTPUT_PATH;
    const repoPath = process.env.REPO_PATH;
    const ps1Path = path.join(process.env.CONTEXT_PATH, 'scripts', 'run-claude.ps1');
```

Substituir por:
```js
    const outputPath = process.env.OUTPUT_PATH;
    const repoPath = (() => {
      if (projetoSlug) {
        try {
          const projetosMd2 = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'PROJETOS.md'), 'utf8');
          const proj2 = parseProjetos(projetosMd2).find(p => p.slug === projetoSlug);
          if (proj2 && proj2.repositorio) {
            return path.join(process.env.CONTEXT_PATH, proj2.repositorio);
          }
        } catch (e) { /* fallback abaixo */ }
      }
      return process.env.REPO_PATH;
    })();
    const ps1Path = path.join(process.env.CONTEXT_PATH, 'scripts', 'run-claude.ps1');
```

- [ ] **Step 6: Verificar**

Reiniciar o servidor:
```powershell
# Parar processo atual se houver
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
# Iniciar
node C:\azure\atlas\server\index.js
```

Verificar health:
```powershell
Invoke-WebRequest http://localhost:3000/health | Select-Object -ExpandProperty Content
# Esperado: {"status":"ok"}
```

Verificar que a lista de projetos ainda retorna:
```powershell
Invoke-WebRequest http://localhost:3000/projetos | Select-Object -ExpandProperty Content
# Esperado: JSON com app-minha-prod
```

Abrir `debug.txt` após uma análise real e confirmar que `Repo path:` aponta para `C:\azure\atlas\repos\app-minha-producao`.

- [ ] **Step 7: Commit**

```powershell
git add PROJETOS.md server/index.js server/.env
git commit -m "feat: repositorio local por projeto em PROJETOS.md"
```

---

## Task 2: ARQUIVOS ANALISADOS em escadinha

**Files:**
- Modify: `CLAUDE.md` — template do Passo 4 e Regras absolutas (seção ARQUIVOS ANALISADOS)
- Modify: `plugin/popup.js` — função `renderTexto()` (linha ~677)
- Modify: `plugin/popup.css` — adicionar `.tree-block`

**Interfaces:**
- O agente passa a gerar linhas com `└─` e recuo de 2 espaços por nível
- `renderTexto()` detecta blocos com `└─` e os envolve em `<pre class="tree-block">` em vez de `<p>`

---

- [ ] **Step 1: Atualizar o template de ARQUIVOS ANALISADOS no `CLAUDE.md`**

Localizar no `CLAUDE.md` o bloco (linha ~109–119):
```
----------------------------------------
ARQUIVOS ANALISADOS
----------------------------------------
Prioritários:
- src/caminho/arquivo1.html
- src/caminho/arquivo1.ts

Contexto:
- src/caminho/outro.ts
```

Substituir por:
```
----------------------------------------
ARQUIVOS ANALISADOS
----------------------------------------
- src/caminho/arquivo1.html
  └─ src/caminho/arquivo1.ts (componente)
     └─ src/caminho/servico.service.ts (serviço injetado)
        └─ src/caminho/backend.p (backend chamado)
```

- [ ] **Step 2: Atualizar a Regra 9 no `CLAUDE.md`**

Localizar a linha (linha ~141):
```
9. ARQUIVOS ANALISADOS e OBSERVAÇÕES ficam SEMPRE depois do COMO RESOLVER.
```

Substituir por:
```
9. ARQUIVOS ANALISADOS e OBSERVAÇÕES ficam SEMPRE depois do COMO RESOLVER.
   ARQUIVOS ANALISADOS: lista TODOS os arquivos abertos em formato de árvore.
   - Primeira linha: arquivo raiz (ex: `- src/app/page.html`)
   - Cada dependência em nova linha com recuo de 2 espaços e prefixo `└─`
   - Acrescente 2 espaços de recuo por nível adicional
   - Sem subseções "Prioritários" ou "Contexto" — apenas a árvore
   - Inclua TODOS os arquivos que abriu, mesmo os que não continham o bug
```

- [ ] **Step 3: Adicionar `.tree-block` ao `popup.css`**

Localizar no `popup.css` a seção de blocos de código (próximo à linha 500). Adicionar após `.diff-lines`:

```css
/* ============================================================ TREE BLOCK — ARQUIVOS ANALISADOS */
.tree-block {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.7;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--border2);
  border-radius: 6px;
  padding: 10px 14px;
  margin: 6px 0;
  white-space: pre;
  overflow-x: auto;
  color: var(--text);
}
```

- [ ] **Step 4: Atualizar `renderSecao()` em `popup.js` para detectar seções de árvore**

`renderSecao()` processa o texto linha por linha no loop principal. Para evitar que cada linha com `└─` vire um `<pre>` separado, a detecção precisa acontecer **antes do loop**, no topo da função.

Localizar `renderSecao()` (linha ~726). O início da função é:

```js
function renderSecao(texto) {
  if (!texto) return '';
  let html = '';
  const linhas = texto.split('\n');
  let i = 0;
```

Substituir por:

```js
function renderSecao(texto) {
  if (!texto) return '';

  // Seção inteira é uma árvore de arquivos — renderiza como bloco único
  if (texto.includes('└─')) {
    return `<pre class="tree-block">${escapeHtml(texto)}</pre>`;
  }

  let html = '';
  const linhas = texto.split('\n');
  let i = 0;
```

**Por que funciona:** `renderSecao()` recebe o conteúdo da seção inteiro (já extraído por `extrairSecao()`). Detectar `└─` no texto completo e retornar um único `<pre>` preserva todos os recuos e quebras de linha da árvore. `escapeHtml` já está definido no mesmo arquivo (linha ~845).

- [ ] **Step 5: Verificar visualmente**

1. Recarregar extensão em `chrome://extensions` → botão "Recarregar"
2. Abrir o plugin em qualquer aba
3. Se houver um resultado salvo no storage: ele aparece na tela de resultado → seção "ARQUIVOS ANALISADOS" deve exibir a árvore em fonte monospace com recuos alinhados
4. Para testar sem rodar análise real, colar o seguinte em `output.txt`:

```
========================================
AGENTE DE CHAMADOS — ANÁLISE DO TICKET
========================================

TICKET   : TEST-001 — Teste de árvore
DATA     : 2026-06-26

----------------------------------------
FUNCIONALIDADES IDENTIFICADAS
----------------------------------------
- Login — motivo: mencionado no título

----------------------------------------
LOCALIZAÇÃO DO PROBLEMA
----------------------------------------
Arquivo: `login.page.html`, linha 42
Campo de senha não exibe erro de validação.

----------------------------------------
CAUSA PROVÁVEL
----------------------------------------
Binding do campo usa variável errada.

----------------------------------------
COMO RESOLVER
----------------------------------------
Corrigir o binding:

DIFF_START arquivo: src/app/login/login.page.html linha: 42
  <ion-input type="password">
- [formControlName]="senhaErrada"
+ [formControlName]="senha"
  </ion-input>
DIFF_END

A variável correta é `senha`, não `senhaErrada`.

----------------------------------------
ARQUIVOS ANALISADOS
----------------------------------------
- src/app/login/login.page.html
  └─ src/app/login/login.page.ts (componente)
     └─ src/app/services/auth.service.ts (serviço injetado)
        └─ back/login.p (backend chamado)

----------------------------------------
OBSERVAÇÕES
----------------------------------------
- Verificar outros campos do formulário com o mesmo padrão.

========================================
```

Abrir `chrome://extensions`, recarregar extensão, abrir popup → clicar em Limpar se necessário → re-abrir → deve mostrar resultado de teste com árvore formatada.

- [ ] **Step 6: Commit**

```powershell
git add CLAUDE.md plugin/popup.js plugin/popup.css
git commit -m "feat: ARQUIVOS ANALISADOS em formato de arvore"
```

---

## Task 3: Botão copiar nome do arquivo no diff

**Files:**
- Modify: `plugin/popup.js` — `construirDiffBlock()` (linha 792) e handler em `configurarEventos()` (linha 212)
- Modify: `plugin/popup.css` — adicionar `.btn-copiar-arquivo` e `.btn-copiar-arquivo.copiado`

**Interfaces:**
- `construirDiffBlock(nomeArquivo, itens, linhaRef, linhaRefIsBlockStart, caminhoArquivo)` — novo 5º parâmetro opcional; default = `nomeArquivo`
- Callers em `renderSecao()` passam `caminho` como 5º argumento no bloco DIFF_START

---

- [ ] **Step 1: Adicionar CSS do botão copiar em `popup.css`**

Após `.btn-toggle-view:hover` (linha 498), adicionar:

```css
.btn-copiar-arquivo {
  padding: 2px 7px; font-size: 11px;
  font-family: 'Consolas', 'Monaco', monospace;
  border: 1px solid #d0d7de; border-radius: 4px;
  background: #f6f8fa; color: #57606a;
  cursor: pointer; transition: background .15s, color .15s, opacity .15s;
  opacity: 0.6;
}
.btn-copiar-arquivo:hover { background: #eaeef2; color: #24292f; opacity: 1; }
.btn-copiar-arquivo.copiado { color: #1a7f37; border-color: #1a7f37; background: #dafbe1; opacity: 1; }

.diff-block.view-dark .btn-copiar-arquivo {
  background: #1e1e1e; color: #e0e0e0; border-color: #555;
}
.diff-block.view-dark .btn-copiar-arquivo.copiado {
  color: #57ab5a; border-color: #57ab5a; background: #1c2f1d;
}
```

- [ ] **Step 2: Atualizar `construirDiffBlock()` para aceitar `caminhoArquivo` e incluir o botão**

Localizar a assinatura da função (linha ~792):
```js
function construirDiffBlock(nomeArquivo, itens, linhaRef, linhaRefIsBlockStart) {
```

Substituir por:
```js
function construirDiffBlock(nomeArquivo, itens, linhaRef, linhaRefIsBlockStart, caminhoArquivo) {
  const pathParaCopiar = caminhoArquivo || nomeArquivo;
```

Localizar o `return` da função que começa com `<div class="diff-block"` (linha ~827):
```js
  return `
    <div class="diff-block" data-view="light">
      <div class="diff-header">
        <span class="diff-file-icon">▣</span>
        <span class="diff-filename">${escapeHtml(nomeArquivo)}</span>
        <div class="diff-header-right">
          <span class="diff-legend">
            <span class="leg-rem">- removido</span>
            <span class="leg-add">+ adicionado</span>
          </span>
          <button class="btn-toggle-view" title="Alternar modo escuro">&lt;/&gt;</button>
        </div>
      </div>
      <div class="diff-lines">${linhasHtml}</div>
    </div>
  `;
```

Substituir por:
```js
  return `
    <div class="diff-block" data-view="light">
      <div class="diff-header">
        <span class="diff-file-icon">▣</span>
        <span class="diff-filename">${escapeHtml(nomeArquivo)}</span>
        <button class="btn-copiar-arquivo" data-filepath="${escapeHtml(pathParaCopiar)}" title="Copiar caminho do arquivo">⎘</button>
        <div class="diff-header-right">
          <span class="diff-legend">
            <span class="leg-rem">- removido</span>
            <span class="leg-add">+ adicionado</span>
          </span>
          <button class="btn-toggle-view" title="Alternar modo escuro">&lt;/&gt;</button>
        </div>
      </div>
      <div class="diff-lines">${linhasHtml}</div>
    </div>
  `;
```

- [ ] **Step 3: Passar `caminho` ao chamar `construirDiffBlock()` no bloco DIFF_START**

Localizar em `renderSecao()` a linha (dentro do bloco `if (linha.trim().startsWith('DIFF_START'))`):
```js
      html += construirDiffBlock(nomeArq, itens, linhaRef, false);
```

Substituir por:
```js
      html += construirDiffBlock(nomeArq, itens, linhaRef, false, caminho);
```

Para o bloco fallback ```diff, a chamada existente não tem caminho completo disponível — deixar sem 5º argumento (usa nomeArq como fallback):
```js
      html += construirDiffBlock(nomeArq, itens, linhaRef, true);
```
(Não alterar esta linha — já está correta com o novo default.)

- [ ] **Step 4: Adicionar handler do botão copiar em `configurarEventos()`**

Localizar em `configurarEventos()` o handler do `document.addEventListener('click', ...)` (linha ~278). Dentro do callback, após o bloco `const btn = e.target.closest('.btn-toggle-view')`:

```js
    const btn = e.target.closest('.btn-toggle-view');
    if (btn) {
      const block = btn.closest('.diff-block, .code-block');
      if (block) block.classList.toggle('view-dark');
    }
```

Adicionar logo depois:
```js
    const btnCopy = e.target.closest('.btn-copiar-arquivo');
    if (btnCopy) {
      const filepath = btnCopy.dataset.filepath || '';
      navigator.clipboard.writeText(filepath).then(() => {
        btnCopy.textContent = '✓';
        btnCopy.classList.add('copiado');
        setTimeout(() => {
          btnCopy.textContent = '⎘';
          btnCopy.classList.remove('copiado');
        }, 1500);
      });
    }
```

- [ ] **Step 5: Verificar visualmente**

1. Recarregar extensão em `chrome://extensions`
2. Se o resultado de teste do Task 2 ainda estiver no storage, reabrir o popup
3. A seção "COMO RESOLVER" deve mostrar o diff com o botão ⎘ ao lado do nome do arquivo
4. Clicar em ⎘ → ícone muda para ✓ verde por 1.5s → Ctrl+V em qualquer campo de texto confirma que `src/app/login/login.page.html` foi copiado

- [ ] **Step 6: Commit**

```powershell
git add plugin/popup.js plugin/popup.css
git commit -m "feat: botao copiar caminho do arquivo no header do diff"
```

---

## Verificação final integrada

- [ ] Reiniciar o servidor com `node C:\azure\atlas\server\index.js`
- [ ] Confirmar em `chrome://extensions` que a extensão está carregada
- [ ] Rodar uma análise real via plugin
- [ ] No resultado: verificar que `ARQUIVOS ANALISADOS` exibe árvore com `└─`
- [ ] Clicar ⎘ em algum diff e confirmar que o caminho é copiado
- [ ] Verificar no log (`/download/log/latest`) que `Repo path:` aponta para `repos/app-minha-producao`
