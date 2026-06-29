# UX â€” Feedback, BotÃµes e @MenÃ§Ã£o de Arquivos â€” Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign de botÃµes com confetti, endpoints de feedback persistente, e `@` menÃ§Ã£o de arquivos nos campos de texto. Tela de estatÃ­sticas Ã© um React app separado â€” implementado em outra rodada.

**Architecture:** TrÃªs tarefas ativas + uma adiada: (1) botÃµes + confetti no plugin, (2) endpoints de feedback no servidor, (3) â¸ ADIADA â€” dashboard React em URL separada, (4) `@` menÃ§Ã£o nos textareas e injeÃ§Ã£o de conteÃºdo no servidor. Cada tarefa Ã© auto-suficiente e testÃ¡vel individualmente.

**Tech Stack:** Chrome Extension MV3, Vanilla JS, CSS (vars de tema existentes), Express.js, `canvas-confetti` (browser bundle local, ~7 KB)

## Global Constraints

- Sem frameworks externos alÃ©m de `canvas-confetti` (um Ãºnico arquivo .js local em `plugin/vendor/confetti.js`)
- Chrome MV3: scripts locais apenas; nada carregado de CDN em runtime
- Dados de feedback salvos em `C:\azure\atlas\feedback\<projeto>\<ticket>-<ts>.json` (via servidor)
- MÃ¡ximo 3 arquivos por `@` menÃ§Ã£o; limite 2000 chars por arquivo injetado
- `plugin/popup.js` tem 1017 linhas; `plugin/popup.css` tem 624 linhas; `server/index.js` tem 835 linhas â€” nÃ£o reorganizar nem dividir arquivos
- Nenhuma alteraÃ§Ã£o em `manifest.json`, `content.js` ou scripts de injeÃ§Ã£o Jira
- **Sem botÃ£o ðŸ“Š no plugin** â€” o acesso Ã s stats serÃ¡ via URL do dashboard React (Task 3, adiada)

---

## File Map

| Arquivo | O que muda |
|---|---|
| `plugin/vendor/confetti.js` | **Criar** â€” bundle do canvas-confetti (baixar via PowerShell) |
| `plugin/popup.html` | Substituir `.actions` por 3 botÃµes; adicionar modal; adicionar `<script vendor/confetti.js>`; dropdown de menÃ§Ã£o nos textareas |
| `plugin/popup.js` | Novos handlers de botÃµes + modal + confetti + salvarFeedback + @menÃ§Ã£o |
| `plugin/popup.css` | Estilos: btn-success, modal-overlay, tela-stats, stat-card, stats-chart, stats-table, mencao-dropdown |
| `server/index.js` | Endpoints: `POST /feedback`, `GET /feedback/stats`, `GET /arquivos`; injeÃ§Ã£o de @menÃ§Ã£o em `montarPrompt()` |

---

## Task 1 â€” BotÃµes redesign + confetti

**Files:**
- Create: `plugin/vendor/confetti.js`
- Modify: `plugin/popup.html` (linhas 211-223, mais final do body)
- Modify: `plugin/popup.js` (linhas 270-273 e 930+)
- Modify: `plugin/popup.css` (final do arquivo, linha 625+)

**Interfaces:**
- Produces: `salvarFeedback(status)` (funÃ§Ã£o JS global â€” Task 2 vai implementÃ¡-la de verdade; aqui apenas esqueleto stub), `dispararConfetti()`, `mostrarModal()`, `fecharModal()`

---

- [ ] **Step 1: Baixar canvas-confetti**

Criar a pasta `plugin/vendor/` e baixar o bundle:

```powershell
New-Item -ItemType Directory -Force "C:\azure\atlas\plugin\vendor"
Invoke-WebRequest "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js" -OutFile "C:\azure\atlas\plugin\vendor\confetti.js"
```

Verificar que o arquivo existe e tem > 5 KB:
```powershell
(Get-Item "C:\azure\atlas\plugin\vendor\confetti.js").Length
# Esperado: > 5000
```

---

- [ ] **Step 2: Atualizar `plugin/popup.html` â€” botÃµes e modal**

Localizar e substituir o bloco `.resultado-actions` existente (linhas 211-223):

```html
<!-- REMOVER este bloco inteiro: -->
    <div class="resultado-actions">
      <div id="refinamentoWrap" style="display:none" class="refinamento-wrap">
        <textarea id="refinamentoTexto" class="s2-textarea"
          placeholder="Descreva o que ainda nÃ£o funcionou..." rows="3"></textarea>
        <div class="refinamento-btn-row">
          <button id="btnReenviarAnalise" class="btn btn-primary-sm">Reenviar anÃ¡lise</button>
        </div>
      </div>
      <div class="actions">
        <button id="btnNovaAnalise" class="btn btn-secondary">Voltar para o inÃ­cio</button>
        <button id="btnAindaNaoResolveu" class="btn btn-primary-sm">Ainda nÃ£o resolveu</button>
      </div>
    </div>
```

Substituir por:

```html
    <div class="resultado-actions">
      <div id="refinamentoWrap" style="display:none" class="refinamento-wrap">
        <textarea id="refinamentoTexto" class="s2-textarea"
          placeholder="Descreva o que ainda nÃ£o funcionou. Pode citar arquivos com @caminho/do/arquivo.ts"
          rows="3"></textarea>
        <div id="mencaoDropdownRefinamento" class="mencao-dropdown" style="display:none"></div>
        <div class="refinamento-btn-row">
          <button id="btnReenviarAnalise" class="btn btn-primary-sm">Reenviar anÃ¡lise</button>
        </div>
      </div>
      <div class="actions-row">
        <button id="btnInicioConfirm" class="btn btn-ghost-sm">â† InÃ­cio</button>
        <button id="btnAindaNaoResolveu" class="btn btn-primary-sm">Ainda nÃ£o resolveu</button>
        <button id="btnResolvido" class="btn btn-success">âœ“ Resolvido!</button>
      </div>
    </div>
```

Adicionar o modal de confirmaÃ§Ã£o ANTES de `<script src="popup.js"></script>`:

```html
  <!-- Modal: confirmaÃ§Ã£o ao ir para o inÃ­cio -->
  <div id="modalResolucao" class="modal-overlay" style="display:none" aria-modal="true" role="dialog">
    <div class="modal-box">
      <p class="modal-msg">O chamado foi resolvido?</p>
      <div class="modal-btns">
        <button id="modalSim" class="btn btn-success-sm">Sim</button>
        <button id="modalNao" class="btn btn-danger-sm">NÃ£o</button>
        <button id="modalCancelar" class="btn btn-ghost-sm">Cancelar</button>
      </div>
    </div>
  </div>

  <script src="vendor/confetti.js"></script>
  <script src="popup.js"></script>
```

---

- [ ] **Step 3: Atualizar `plugin/popup.js` â€” remover referÃªncia a `btnNovaAnalise` e adicionar novos handlers**

Em `configurarEventos()` (linha ~270), localizar e substituir:

```js
// REMOVER:
  document.getElementById('btnNovaAnalise').addEventListener('click', resetarFormulario);
  document.getElementById('btnAindaNaoResolveu').addEventListener('click', toggleRefinamento);
```

Substituir por:

```js
  document.getElementById('btnInicioConfirm').addEventListener('click', abrirModalResolucao);
  document.getElementById('btnAindaNaoResolveu').addEventListener('click', toggleRefinamento);
  document.getElementById('btnResolvido').addEventListener('click', () => resolverChamado('resolved'));
  document.getElementById('modalSim').addEventListener('click', () => resolverChamado('resolved', true));
  document.getElementById('modalNao').addEventListener('click', () => resolverChamado('unresolved', true));
  document.getElementById('modalCancelar').addEventListener('click', fecharModal);
```

---

- [ ] **Step 4: Adicionar funÃ§Ãµes novas ao final de `plugin/popup.js` (antes da Ãºltima linha)**

Adicionar antes do Ãºltimo `}` ou apÃ³s `resetarFormulario`:

```js
// ============================================================ FEEDBACK / MODAL / CONFETTI

function abrirModalResolucao() {
  document.getElementById('modalResolucao').style.display = 'flex';
}

function fecharModal() {
  document.getElementById('modalResolucao').style.display = 'none';
}

async function resolverChamado(status, viaModal = false) {
  if (viaModal) fecharModal();
  await salvarFeedback(status);
  if (status === 'resolved') {
    dispararConfetti();
    setTimeout(resetarFormulario, 2200);
  } else {
    resetarFormulario();
  }
}

async function salvarFeedback(status) {
  // Stub â€” implementado de verdade na Task 2
  try {
    const stored = await chrome.storage.local.get(['inicio', 'resultado']);
    const tempoAnalise = stored.inicio ? Math.round((Date.now() - stored.inicio) / 1000) : 0;
    const analiseTexto = stored.resultado?.analise || '';
    await fetch(`${SERVER_URL}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketId:    state.dadosTicket?.ticketId || '',
        titulo:      state.dadosTicket?.titulo   || '',
        projeto:     state.projetoSelecionado    || '',
        status,
        tempoAnalise,
        analiseTexto,
        observacao:  document.getElementById('descricaoTextarea')?.value || ''
      })
    });
  } catch { /* falha silenciosa â€” nÃ£o bloqueia o fluxo */ }
}

function dispararConfetti() {
  if (typeof confetti !== 'function') return;
  const colors = ['#22c55e', '#16a34a', '#4ade80', '#bbf7d0', '#ffffff'];
  const end = Date.now() + 2000;
  const frame = () => {
    confetti({ particleCount: 4, angle: 60,  spread: 55, origin: { x: 0 }, colors });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
```

---

- [ ] **Step 5: Adicionar estilos ao final de `plugin/popup.css`**

Acrescentar apÃ³s a Ãºltima linha (624):

```css
/* ============================================================ BOTÃ•ES RESULTADO â€” 3 colunas */
.actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  transition: background .25s;
}

.btn-success {
  background: #16a34a; color: #fff;
  border: none; border-radius: 8px;
  padding: 8px 16px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: background .15s;
  white-space: nowrap;
}
.btn-success:hover { background: #15803d; }

.btn-ghost-sm {
  background: transparent; color: var(--muted2);
  border: 1px solid var(--border); border-radius: 8px;
  padding: 7px 12px; font-size: 12px;
  cursor: pointer; transition: border-color .15s, color .15s;
  white-space: nowrap;
}
.btn-ghost-sm:hover { border-color: var(--border2); color: var(--text); }

/* ============================================================ MODAL */
.modal-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px 28px;
  display: flex; flex-direction: column; gap: 18px;
  min-width: 280px; max-width: 360px;
  box-shadow: 0 8px 32px rgba(0,0,0,.18);
  transition: background .25s;
}
.modal-msg {
  font-size: 14px; font-weight: 600;
  color: var(--text); text-align: center;
}
.modal-btns {
  display: flex; gap: 8px; justify-content: center;
}
.btn-success-sm {
  background: #16a34a; color: #fff;
  border: none; border-radius: 8px;
  padding: 7px 18px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: background .15s;
}
.btn-success-sm:hover { background: #15803d; }

.btn-danger-sm {
  background: transparent; color: #dc2626;
  border: 1px solid #dc2626; border-radius: 8px;
  padding: 7px 18px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: background .15s, color .15s;
}
.btn-danger-sm:hover { background: #dc2626; color: #fff; }
```

---

- [ ] **Step 6: Verificar visualmente**

1. Recarregar extensÃ£o em `chrome://extensions`
2. Abrir popup, iniciar anÃ¡lise com um ticket de teste, aguardar resultado
3. Confirmar 3 botÃµes: `â† InÃ­cio` Ã  esquerda, `Ainda nÃ£o resolveu` no centro, `âœ“ Resolvido!` Ã  direita
4. Clicar `â† InÃ­cio` â†’ modal aparece com "O chamado foi resolvido?" + 3 botÃµes
5. Cancelar modal â†’ permanece na tela resultado
6. Clicar `âœ“ Resolvido!` â†’ confetti dispara + volta para tela inicial apÃ³s ~2s
7. Verificar que o console mostra erro de rede em `/feedback` (endpoint nÃ£o existe ainda â€” Task 2)

---

- [ ] **Step 7: Commit**

```bash
git add plugin/vendor/confetti.js plugin/popup.html plugin/popup.js plugin/popup.css
git commit -m "feat: botoes resultado redesign + confetti + modal resolucao"
```

---

## Task 2 â€” Endpoints de feedback no servidor

**Files:**
- Modify: `server/index.js` (adicionar apÃ³s linha 301 â€” apÃ³s `GET /download/log/latest`)

**Interfaces:**
- Consumes: `POST /feedback` body: `{ ticketId, titulo, projeto, status, tempoAnalise, analiseTexto, observacao }`
- Produces: `POST /feedback` â†’ `{ sucesso: true }`, `GET /feedback/stats` â†’ objeto com mÃ©tricas, `GET /feedback/list` â†’ lista de execuÃ§Ãµes

---

- [ ] **Step 1: Adicionar `POST /feedback` em `server/index.js`**

Adicionar apÃ³s o bloco `GET /download/log/latest` (depois da linha `});` que fecha esse handler, em torno da linha 300):

```js
// -------------------------------------------------------
// POST /feedback â€” salva resultado de uma anÃ¡lise
// -------------------------------------------------------
app.post('/feedback', (req, res) => {
  const { ticketId, titulo, projeto, status, tempoAnalise, analiseTexto, observacao } = req.body || {};

  const VALID_STATUS = ['resolved', 'unresolved', 'unresolved_refined'];
  if (!VALID_STATUS.includes(status)) {
    return res.status(400).json({ sucesso: false, erro: 'status invÃ¡lido' });
  }

  // Extrai funcionalidades e arquivos analisados do texto da anÃ¡lise
  const extrairSecao = (texto, secao) => {
    const re = new RegExp(`-{2,}\\s*\\r?\\n\\s*${secao}\\s*\\r?\\n-{2,}\\r?\\n([\\s\\S]*?)(?=\\n-{10,}|\\n={8,}|$)`, 'i');
    const m = (texto || '').match(re);
    return m ? m[1].trim() : '';
  };

  const funcText = extrairSecao(analiseTexto, 'FUNCIONALIDADES IDENTIFICADAS');
  const arqText  = extrairSecao(analiseTexto, 'ARQUIVOS ANALISADOS');

  const funcionalidades    = funcText ? funcText.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').split(' â€”')[0].trim()) : [];
  const arquivosAnalisados = arqText  ? [...arqText.matchAll(/`([^`]+\.\w+)`/g)].map(m => m[1]) : [];

  const slugProjeto = (projeto || 'sem-projeto').replace(/[^a-z0-9\-]/gi, '-');
  const feedbackDir = path.join(process.env.CONTEXT_PATH, 'feedback', slugProjeto);
  if (!fs.existsSync(feedbackDir)) fs.mkdirSync(feedbackDir, { recursive: true });

  const timestamp = Date.now();
  const nomeArq   = `${(ticketId || 'sem-ticket').replace(/[^a-z0-9\-]/gi, '-')}-${timestamp}.json`;
  const dados = {
    ticketId:         ticketId         || '',
    titulo:           titulo           || '',
    projeto:          projeto          || '',
    funcionalidades,
    arquivosAnalisados,
    observacao:       (observacao || '').slice(0, 500),
    tempoAnalise:     Number(tempoAnalise) || 0,
    timestamp,
    status
  };

  try {
    fs.writeFileSync(path.join(feedbackDir, nomeArq), JSON.stringify(dados, null, 2), 'utf8');
    res.json({ sucesso: true });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// -------------------------------------------------------
// GET /feedback/stats â€” mÃ©tricas agregadas
// -------------------------------------------------------
app.get('/feedback/stats', (req, res) => {
  const feedbackBase = path.join(process.env.CONTEXT_PATH, 'feedback');
  if (!fs.existsSync(feedbackBase)) {
    return res.json({ total: 0, resolvidos: 0, naoResolvidos: 0, tempoMedio: 0, porSemana: [], execucoes: [] });
  }

  const todos = [];
  for (const dir of fs.readdirSync(feedbackBase)) {
    const dirPath = path.join(feedbackBase, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    for (const arq of fs.readdirSync(dirPath)) {
      if (!arq.endsWith('.json')) continue;
      try {
        todos.push(JSON.parse(fs.readFileSync(path.join(dirPath, arq), 'utf8')));
      } catch { /* ignora arquivo corrompido */ }
    }
  }

  todos.sort((a, b) => b.timestamp - a.timestamp);

  const total        = todos.length;
  const resolvidos   = todos.filter(t => t.status === 'resolved').length;
  const naoResolvidos = total - resolvidos;

  const comTempo = todos.filter(t => t.tempoAnalise > 0);
  const tempoMedio = comTempo.length > 0
    ? Math.round(comTempo.reduce((s, t) => s + t.tempoAnalise, 0) / comTempo.length)
    : 0;

  // Ãšltimas 6 semanas
  const agora = Date.now();
  const porSemana = Array.from({ length: 6 }, (_, i) => {
    const ini   = agora - (i + 1) * 7 * 24 * 3600 * 1000;
    const fim   = agora - i * 7 * 24 * 3600 * 1000;
    const label = new Date(fim).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return {
      label,
      total:      todos.filter(t => t.timestamp >= ini && t.timestamp < fim).length,
      resolvidos: todos.filter(t => t.timestamp >= ini && t.timestamp < fim && t.status === 'resolved').length
    };
  }).reverse();

  res.json({ total, resolvidos, naoResolvidos, tempoMedio, porSemana, execucoes: todos.slice(0, 100) });
});
```

---

- [ ] **Step 2: Verificar endpoints**

Reiniciar servidor:
```powershell
# Ctrl+C no processo node, depois:
node "C:\azure\atlas\server\index.js"
```

Testar `POST /feedback`:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/feedback" -Method POST -ContentType "application/json" -Body '{"ticketId":"TEST-001","titulo":"Teste","projeto":"minha-totvs-prod","status":"resolved","tempoAnalise":120,"analiseTexto":"","observacao":""}'
# Esperado: { sucesso: true }
```

Testar `GET /feedback/stats`:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/feedback/stats"
# Esperado: { total: 1, resolvidos: 1, naoResolvidos: 0, tempoMedio: 120, porSemana: [...], execucoes: [...] }
```

Verificar arquivo criado:
```powershell
Get-ChildItem "C:\azure\atlas\feedback" -Recurse -Filter "*.json"
# Esperado: TEST-001-<timestamp>.json em feedback/minha-totvs-prod/
```

---

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: endpoints POST /feedback e GET /feedback/stats"
```

---

## Task 3 â€” â¸ ADIADA â€” Dashboard de EstatÃ­sticas (React, URL separada)

> **Esta task nÃ£o serÃ¡ implementada agora.** O dashboard de estatÃ­sticas serÃ¡ uma aplicaÃ§Ã£o React separada, servida pelo mesmo servidor Express em uma rota dedicada (ex: `http://localhost:3000/dashboard`). Implementar em rodada futura com seu prÃ³prio spec.
>
> **O que serÃ¡ construÃ­do no futuro:**
> - React app em `C:\azure\atlas\dashboard\` (Vite + React + Recharts ou Tremor)
> - Rota `GET /dashboard` no servidor servindo o build estÃ¡tico
> - PÃ¡ginas: KPIs, grÃ¡fico de tendÃªncia, tabela completa com todos os campos do feedback (ticketId, tÃ­tulo, projeto, funcionalidades, arquivos, observaÃ§Ã£o, tempo, status)
> - Filtros por projeto, perÃ­odo, status
> - Design minimalista com paleta consistente com o plugin

**O `GET /feedback/stats` e `GET /feedback/list` implementados na Task 2 jÃ¡ servem os dados para esse dashboard.**

---

## Task 4 â€” `@` MenÃ§Ã£o de arquivo

**Files:**
- Modify: `plugin/popup.html` â€” placeholder do textarea de detalhes (linha 107)
- Modify: `plugin/popup.js` â€” `carregarArquivosProjeto()`, `configurarMencaoArquivo()`, chamar em `configurarEventos()`
- Modify: `plugin/popup.css` â€” estilos do dropdown de menÃ§Ã£o
- Modify: `server/index.js` â€” endpoint `GET /arquivos`, `injetarArquivosReferenciados()`, chamada em `montarPrompt()`

**Interfaces:**
- Consumes: `GET /arquivos?projeto=<slug>` â†’ `{ arquivos: string[] }`
- Produces: dropdown de menÃ§Ã£o nos dois textareas; servidor injeta conteÃºdo de arquivos referenciados no prompt

---

- [ ] **Step 1: Adicionar dropdown de menÃ§Ã£o no textarea de detalhes em `plugin/popup.html`**

Localizar (linha ~102):
```html
      <div class="field-wrap" id="fieldWrapDetalhes" style="display:none">
        <span class="float-label">Detalhes chaves / dicas</span>
        <textarea
          id="descricaoTextarea"
          class="s2-textarea"
          placeholder="Ex: O campo Quantidade fica em branco ao salvar. O botÃ£o Confirmar some depois do segundo clique..."
          rows="4"
        ></textarea>
```

Substituir pelo bloco:
```html
      <div class="field-wrap" id="fieldWrapDetalhes" style="display:none">
        <span class="float-label">Detalhes chaves / dicas</span>
        <textarea
          id="descricaoTextarea"
          class="s2-textarea"
          placeholder="Detalhe o mais profundo possÃ­vel. Pode citar arquivos com @caminho/do/arquivo.ts"
          rows="4"
        ></textarea>
        <div id="mencaoDropdownDetalhes" class="mencao-dropdown" style="display:none"></div>
```

(AtenÃ§Ã£o: manter o `</div>` de fechamento do `field-wrap` que vem depois do `<p class="descricao-erro">`.)

---

- [ ] **Step 2: Adicionar endpoint `GET /arquivos` em `server/index.js`**

Adicionar apÃ³s o endpoint `GET /funcionalidades` (apÃ³s linha ~275):

```js
// -------------------------------------------------------
// GET /arquivos?projeto=<slug> â€” lista arquivos do projeto para @menÃ§Ã£o
// -------------------------------------------------------
app.get('/arquivos', (req, res) => {
  const projetoSlug = req.query.projeto || '';
  let funcFile = 'Funcionalidades.md';

  if (projetoSlug) {
    try {
      const projetosMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'PROJETOS.md'), 'utf8');
      const proj = parseProjetos(projetosMd).find(p => p.slug === projetoSlug);
      if (proj && proj.funcionalidades) funcFile = proj.funcionalidades;
    } catch { /* usa default */ }
  }

  try {
    const funcMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, funcFile), 'utf8');
    const arquivos = [...new Set(
      [...funcMd.matchAll(/\b((?:src|back)\/[\w.\-/]+\.(?:ts|html|scss|p|js|css|json|kt|java|xml))\b/g)]
        .map(m => m[1])
    )].sort();
    res.json({ arquivos });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});
```

---

- [ ] **Step 3: Adicionar funÃ§Ã£o `injetarArquivosReferenciados` e chamar em `montarPrompt` em `server/index.js`**

Adicionar a funÃ§Ã£o auxiliar logo antes de `function montarPrompt(...)` (linha ~171):

```js
// Detecta @caminho/arquivo.ext no texto e injeta conteÃºdo (mÃ¡x 3 arquivos, 2000 chars cada)
function injetarArquivosReferenciados(texto, repoPath) {
  if (!texto || !repoPath) return '';
  const MAX_ARQUIVOS = 3;
  const MAX_CHARS    = 2000;
  const matches = [...texto.matchAll(/@([\w.\-/]+\.(?:ts|html|scss|p|js|css|json|kt|java|xml))/g)];
  if (!matches.length) return '';

  const vistos = new Set();
  const secoes = [];
  for (const m of matches) {
    const rel = m[1];
    if (vistos.has(rel) || vistos.size >= MAX_ARQUIVOS) continue;
    vistos.add(rel);
    try {
      const conteudo = fs.readFileSync(path.join(repoPath, rel), 'utf8').slice(0, MAX_CHARS);
      secoes.push(`=== ARQUIVO REFERENCIADO: ${rel} ===\n${conteudo}\n${'='.repeat(42)}`);
    } catch { /* arquivo nÃ£o existe â€” ignora */ }
  }
  return secoes.length ? '\n\n' + secoes.join('\n\n') : '';
}
```

Dentro de `function montarPrompt(dados, claudeMd, funcionalidadesMd)`, localizar a linha:
```js
OBSERVACAO     : ${truncar(dados.observacao, 1000) || 'Nenhuma observaÃ§Ã£o adicional'}
```

Substituir por:
```js
OBSERVACAO     : ${truncar(dados.observacao, 1000) || 'Nenhuma observaÃ§Ã£o adicional'}${injetarArquivosReferenciados(dados.observacao, dados.repoPath || '')}
```

Em `executarAnalise`, o `repoPath` Ã© calculado DEPOIS de `montarPrompt()` ser chamado (bug na ordem atual). Ã‰ necessÃ¡rio mover o bloco de cÃ¡lculo de `repoPath` para ANTES da chamada `montarPrompt`.

Localizar em `executarAnalise` a sequÃªncia (em torno da linha 506-510):
```js
    // Monta prompt
    log.info('Montando prompt...');
    addLog(requestId, 'Montando contexto completo do chamado...');
    const prompt = montarPrompt(dados, claudeMd, funcionalidadesMd);
    log.info(`Prompt montado: ${prompt.length} chars`);
    addLog(requestId, `Contexto pronto â€” ${prompt.length.toLocaleString('pt-BR')} chars`);
```

Substituir por:

```js
    // Resolve repoPath antes de montar o prompt (necessÃ¡rio para injeÃ§Ã£o de @menÃ§Ãµes)
    const repoPath = (() => {
      if (projetoSlug) {
        try {
          const projetosMdTmp = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'PROJETOS.md'), 'utf8');
          const projTmp = parseProjetos(projetosMdTmp).find(p => p.slug === projetoSlug);
          if (projTmp && projTmp.repositorio) return path.join(process.env.CONTEXT_PATH, projTmp.repositorio);
        } catch { /* usa default */ }
      }
      return process.env.REPO_PATH;
    })();
    dados.repoPath = repoPath;

    // Monta prompt
    log.info('Montando prompt...');
    addLog(requestId, 'Montando contexto completo do chamado...');
    const prompt = montarPrompt(dados, claudeMd, funcionalidadesMd);
    log.info(`Prompt montado: ${prompt.length} chars`);
    addLog(requestId, `Contexto pronto â€” ${prompt.length.toLocaleString('pt-BR')} chars`);
```

Depois, localizar o bloco original de cÃ¡lculo de `repoPath` (em torno da linha 554-565, APÃ“S a gravaÃ§Ã£o do debug.txt):
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
```

Substituir por (sem a declaraÃ§Ã£o `const repoPath`, pois jÃ¡ foi declarada acima):
```js
    const outputPath = process.env.OUTPUT_PATH;
```

---

- [ ] **Step 4: Adicionar funÃ§Ã£o `carregarArquivosProjeto` e `configurarMencaoArquivo` em `plugin/popup.js`**

Adicionar apÃ³s `// ============================================================ FEEDBACK / MODAL / CONFETTI` (apÃ³s as funÃ§Ãµes da Task 1):

```js
// ============================================================ @MENÃ‡ÃƒO DE ARQUIVO

let _arquivosProjeto = [];

async function carregarArquivosProjeto() {
  if (!state.projetoSelecionado) return;
  try {
    const res  = await fetch(`${SERVER_URL}/arquivos?projeto=${encodeURIComponent(state.projetoSelecionado)}`);
    const data = await res.json();
    _arquivosProjeto = data.arquivos || [];
  } catch { _arquivosProjeto = []; }
}

function configurarMencaoArquivo(textarea, dropdownEl) {
  textarea.addEventListener('input', () => {
    const val = textarea.value;
    const cur = textarea.selectionStart;
    const atIdx = val.lastIndexOf('@', cur - 1);

    if (atIdx === -1) { dropdownEl.style.display = 'none'; return; }

    const entre = val.slice(atIdx + 1, cur);
    if (entre.includes(' ') || entre.includes('\n')) { dropdownEl.style.display = 'none'; return; }

    const query = entre.toLowerCase();
    const filtrados = _arquivosProjeto
      .filter(f => f.toLowerCase().includes(query))
      .slice(0, 8);

    if (!filtrados.length) { dropdownEl.style.display = 'none'; return; }

    dropdownEl.innerHTML = filtrados.map(f =>
      `<div class="mencao-item" data-path="${escaparHtml(f)}">
         <span class="mencao-nome">${escaparHtml(f.split('/').pop())}</span>
         <span class="mencao-path">${escaparHtml(f)}</span>
       </div>`
    ).join('');
    dropdownEl.style.display = 'block';
  });

  dropdownEl.addEventListener('mousedown', e => {
    const item = e.target.closest('.mencao-item');
    if (!item) return;
    e.preventDefault();

    const val    = textarea.value;
    const cur    = textarea.selectionStart;
    const atIdx  = val.lastIndexOf('@', cur - 1);
    const caminho = item.dataset.path;

    textarea.value = val.slice(0, atIdx) + '@' + caminho + val.slice(cur);
    const pos = atIdx + caminho.length + 1;
    textarea.setSelectionRange(pos, pos);
    dropdownEl.style.display = 'none';
    textarea.focus();
  });

  textarea.addEventListener('blur', () => {
    setTimeout(() => { dropdownEl.style.display = 'none'; }, 150);
  });

  textarea.addEventListener('keydown', e => {
    if (dropdownEl.style.display === 'none') return;
    if (e.key === 'Escape') { dropdownEl.style.display = 'none'; e.preventDefault(); }
  });
}
```

---

- [ ] **Step 5: Chamar `carregarArquivosProjeto` e `configurarMencaoArquivo` em `popup.js`**

Em `irParaFormulario()` (linha ~57), apÃ³s a linha `mostrarTela('formulario');`, adicionar:

```js
  carregarArquivosProjeto();
```

Em `configurarEventos()`, no final (antes do `}`), adicionar:

```js
  // @menÃ§Ã£o nos dois textareas
  configurarMencaoArquivo(
    document.getElementById('descricaoTextarea'),
    document.getElementById('mencaoDropdownDetalhes')
  );
  configurarMencaoArquivo(
    document.getElementById('refinamentoTexto'),
    document.getElementById('mencaoDropdownRefinamento')
  );
```

---

- [ ] **Step 6: Adicionar estilos do dropdown em `plugin/popup.css`**

ApÃ³s os estilos da Task 3, adicionar:

```css
/* ============================================================ @MENÃ‡ÃƒO */
.mencao-dropdown {
  position: absolute; left: 0; right: 0;
  background: var(--surface);
  border: 1px solid var(--border2);
  border-top: none;
  border-radius: 0 0 8px 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,.12);
  z-index: 100;
  max-height: 200px; overflow-y: auto;
}
.mencao-item {
  display: flex; flex-direction: column; gap: 1px;
  padding: 7px 12px; cursor: pointer;
  transition: background .1s;
}
.mencao-item:hover { background: var(--accent-lo); }
.mencao-nome { font-size: 12px; font-weight: 600; color: var(--text); }
.mencao-path { font-size: 10px; color: var(--muted2); }

/* Wrapper dos textareas precisa ser position:relative para o dropdown */
.field-wrap   { position: relative; }
.refinamento-wrap { position: relative; }
```

---

- [ ] **Step 7: Verificar funcionalidade de @menÃ§Ã£o**

1. Recarregar extensÃ£o
2. Selecionar um projeto e clicar Iniciar
3. Marcar checkbox "Fornecer mais detalhes"
4. Digitar `@create` no textarea â†’ dropdown deve aparecer com arquivos que contenham "create"
5. Clicar num item â†’ caminho inserido no texto como `@src/app/...`
6. Testar tambÃ©m no campo "Ainda nÃ£o resolveu" (tela resultado)
7. Testar endpoint: `GET http://localhost:3000/arquivos?projeto=<seu-slug>` â†’ deve retornar lista de arquivos

Para verificar injeÃ§Ã£o no prompt: iniciar uma anÃ¡lise com `@src/app/algum/arquivo.ts` na observaÃ§Ã£o, depois verificar o `debug.txt` em `C:\azure\atlas\debug.txt` e confirmar que o conteÃºdo do arquivo aparece sob `=== ARQUIVO REFERENCIADO ===`.

---

- [ ] **Step 8: Commit**

```bash
git add plugin/popup.html plugin/popup.js plugin/popup.css server/index.js
git commit -m "feat: @mencao de arquivo nos textareas com injecao de conteudo no prompt"
```

---

## SequÃªncia de execuÃ§Ã£o

```
Task 1 (botÃµes + confetti) â†’ reiniciar extensÃ£o â†’ testar 3 botÃµes + modal + confetti
Task 2 (endpoints feedback) â†’ reiniciar servidor â†’ testar POST /feedback e GET /feedback/stats
Task 4 (@menÃ§Ã£o) â†’ reiniciar extensÃ£o + servidor â†’ testar dropdown e injeÃ§Ã£o no prompt
```
