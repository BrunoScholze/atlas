# UX — Feedback, Botões e @Menção de Arquivos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar redesign de botões com confetti, sistema de feedback persistente com tela de estatísticas, e `@` menção de arquivos nos campos de texto.

**Architecture:** Quatro tarefas independentes e sequenciais: (1) botões + confetti no plugin, (2) endpoints de feedback no servidor, (3) tela de stats no plugin, (4) `@` menção nos textareas e injeção de conteúdo no servidor. Cada tarefa é auto-suficiente e testável individualmente.

**Tech Stack:** Chrome Extension MV3, Vanilla JS, CSS (vars de tema existentes), Express.js, `canvas-confetti` (browser bundle local, ~7 KB)

## Global Constraints

- Sem frameworks externos além de `canvas-confetti` (um único arquivo .js local em `plugin/vendor/confetti.js`)
- Gráficos em SVG puro — sem Chart.js, sem D3
- Todas as cores usam as CSS vars do tema: `var(--text)`, `var(--surface)`, `var(--border)`, `var(--accent)` etc.
- Chrome MV3: scripts locais apenas; nada carregado de CDN em runtime
- Dados de feedback salvos em `C:\azure\atlas\feedback\<projeto>\<ticket>-<ts>.json` (via servidor)
- Máximo 3 arquivos por `@` menção; limite 2000 chars por arquivo injetado
- `plugin/popup.js` tem 1017 linhas; `plugin/popup.css` tem 624 linhas; `server/index.js` tem 835 linhas — não reorganizar nem dividir arquivos
- Nenhuma alteração em `manifest.json`, `content.js` ou scripts de injeção Jira

---

## File Map

| Arquivo | O que muda |
|---|---|
| `plugin/vendor/confetti.js` | **Criar** — bundle do canvas-confetti (baixar via PowerShell) |
| `plugin/popup.html` | Substituir `.actions` por 3 botões; adicionar modal; adicionar `<script vendor/confetti.js>`; adicionar tela stats; botão stats fixo; dropdown de menção nos textareas |
| `plugin/popup.js` | Novos handlers de botões + modal + confetti + salvarFeedback + tela stats + SVG chart + @menção |
| `plugin/popup.css` | Estilos: btn-success, modal-overlay, tela-stats, stat-card, stats-chart, stats-table, mencao-dropdown |
| `server/index.js` | Endpoints: `POST /feedback`, `GET /feedback/stats`, `GET /arquivos`; injeção de @menção em `montarPrompt()` |

---

## Task 1 — Botões redesign + confetti

**Files:**
- Create: `plugin/vendor/confetti.js`
- Modify: `plugin/popup.html` (linhas 211-223, mais final do body)
- Modify: `plugin/popup.js` (linhas 270-273 e 930+)
- Modify: `plugin/popup.css` (final do arquivo, linha 625+)

**Interfaces:**
- Produces: `salvarFeedback(status)` (função JS global — Task 2 vai implementá-la de verdade; aqui apenas esqueleto stub), `dispararConfetti()`, `mostrarModal()`, `fecharModal()`

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

- [ ] **Step 2: Atualizar `plugin/popup.html` — botões e modal**

Localizar e substituir o bloco `.resultado-actions` existente (linhas 211-223):

```html
<!-- REMOVER este bloco inteiro: -->
    <div class="resultado-actions">
      <div id="refinamentoWrap" style="display:none" class="refinamento-wrap">
        <textarea id="refinamentoTexto" class="s2-textarea"
          placeholder="Descreva o que ainda não funcionou..." rows="3"></textarea>
        <div class="refinamento-btn-row">
          <button id="btnReenviarAnalise" class="btn btn-primary-sm">Reenviar análise</button>
        </div>
      </div>
      <div class="actions">
        <button id="btnNovaAnalise" class="btn btn-secondary">Voltar para o início</button>
        <button id="btnAindaNaoResolveu" class="btn btn-primary-sm">Ainda não resolveu</button>
      </div>
    </div>
```

Substituir por:

```html
    <div class="resultado-actions">
      <div id="refinamentoWrap" style="display:none" class="refinamento-wrap">
        <textarea id="refinamentoTexto" class="s2-textarea"
          placeholder="Descreva o que ainda não funcionou. Pode citar arquivos com @caminho/do/arquivo.ts"
          rows="3"></textarea>
        <div id="mencaoDropdownRefinamento" class="mencao-dropdown" style="display:none"></div>
        <div class="refinamento-btn-row">
          <button id="btnReenviarAnalise" class="btn btn-primary-sm">Reenviar análise</button>
        </div>
      </div>
      <div class="actions-row">
        <button id="btnInicioConfirm" class="btn btn-ghost-sm">← Início</button>
        <button id="btnAindaNaoResolveu" class="btn btn-primary-sm">Ainda não resolveu</button>
        <button id="btnResolvido" class="btn btn-success">✓ Resolvido!</button>
      </div>
    </div>
```

Adicionar o modal de confirmação ANTES de `<script src="popup.js"></script>`:

```html
  <!-- Modal: confirmação ao ir para o início -->
  <div id="modalResolucao" class="modal-overlay" style="display:none" aria-modal="true" role="dialog">
    <div class="modal-box">
      <p class="modal-msg">O chamado foi resolvido?</p>
      <div class="modal-btns">
        <button id="modalSim" class="btn btn-success-sm">Sim</button>
        <button id="modalNao" class="btn btn-danger-sm">Não</button>
        <button id="modalCancelar" class="btn btn-ghost-sm">Cancelar</button>
      </div>
    </div>
  </div>

  <script src="vendor/confetti.js"></script>
  <script src="popup.js"></script>
```

---

- [ ] **Step 3: Atualizar `plugin/popup.js` — remover referência a `btnNovaAnalise` e adicionar novos handlers**

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

- [ ] **Step 4: Adicionar funções novas ao final de `plugin/popup.js` (antes da última linha)**

Adicionar antes do último `}` ou após `resetarFormulario`:

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
  // Stub — implementado de verdade na Task 2
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
  } catch { /* falha silenciosa — não bloqueia o fluxo */ }
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

Acrescentar após a última linha (624):

```css
/* ============================================================ BOTÕES RESULTADO — 3 colunas */
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

1. Recarregar extensão em `chrome://extensions`
2. Abrir popup, iniciar análise com um ticket de teste, aguardar resultado
3. Confirmar 3 botões: `← Início` à esquerda, `Ainda não resolveu` no centro, `✓ Resolvido!` à direita
4. Clicar `← Início` → modal aparece com "O chamado foi resolvido?" + 3 botões
5. Cancelar modal → permanece na tela resultado
6. Clicar `✓ Resolvido!` → confetti dispara + volta para tela inicial após ~2s
7. Verificar que o console mostra erro de rede em `/feedback` (endpoint não existe ainda — Task 2)

---

- [ ] **Step 7: Commit**

```bash
git add plugin/vendor/confetti.js plugin/popup.html plugin/popup.js plugin/popup.css
git commit -m "feat: botoes resultado redesign + confetti + modal resolucao"
```

---

## Task 2 — Endpoints de feedback no servidor

**Files:**
- Modify: `server/index.js` (adicionar após linha 301 — após `GET /download/log/latest`)

**Interfaces:**
- Consumes: `POST /feedback` body: `{ ticketId, titulo, projeto, status, tempoAnalise, analiseTexto, observacao }`
- Produces: `POST /feedback` → `{ sucesso: true }`, `GET /feedback/stats` → objeto com métricas, `GET /feedback/list` → lista de execuções

---

- [ ] **Step 1: Adicionar `POST /feedback` em `server/index.js`**

Adicionar após o bloco `GET /download/log/latest` (depois da linha `});` que fecha esse handler, em torno da linha 300):

```js
// -------------------------------------------------------
// POST /feedback — salva resultado de uma análise
// -------------------------------------------------------
app.post('/feedback', (req, res) => {
  const { ticketId, titulo, projeto, status, tempoAnalise, analiseTexto, observacao } = req.body || {};

  const VALID_STATUS = ['resolved', 'unresolved', 'unresolved_refined'];
  if (!VALID_STATUS.includes(status)) {
    return res.status(400).json({ sucesso: false, erro: 'status inválido' });
  }

  // Extrai funcionalidades e arquivos analisados do texto da análise
  const extrairSecao = (texto, secao) => {
    const re = new RegExp(`-{2,}\\s*\\r?\\n\\s*${secao}\\s*\\r?\\n-{2,}\\r?\\n([\\s\\S]*?)(?=\\n-{10,}|\\n={8,}|$)`, 'i');
    const m = (texto || '').match(re);
    return m ? m[1].trim() : '';
  };

  const funcText = extrairSecao(analiseTexto, 'FUNCIONALIDADES IDENTIFICADAS');
  const arqText  = extrairSecao(analiseTexto, 'ARQUIVOS ANALISADOS');

  const funcionalidades    = funcText ? funcText.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').split(' —')[0].trim()) : [];
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
// GET /feedback/stats — métricas agregadas
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

  // Últimas 6 semanas
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

## Task 3 — Tela de estatísticas no plugin

**Files:**
- Modify: `plugin/popup.html` (adicionar `#telaStats` e botão de stats fixo)
- Modify: `plugin/popup.js` (adicionar navegação, `carregarStats()`, SVG chart, render tabela)
- Modify: `plugin/popup.css` (estilos da tela de stats)

**Interfaces:**
- Consumes: `GET /feedback/stats` da Task 2
- Produces: nova tela acessível via botão `📊` fixo no canto superior esquerdo

---

- [ ] **Step 1: Adicionar botão de stats fixo e tela `#telaStats` em `plugin/popup.html`**

Logo após `<button class="theme-toggle" ...>...</button>` (linha ~12), adicionar:

```html
  <!-- Botão de estatísticas — fixo no canto superior esquerdo -->
  <button class="stats-toggle" id="btnAbrirStats" title="Ver histórico de análises">📊</button>
```

Antes do bloco `<script src="vendor/confetti.js">`, adicionar a nova tela:

```html
  <!-- ============================================================ TELA STATS -->
  <div id="telaStats" style="display:none" class="tela-stats">
    <div class="stats-header">
      <button id="btnFecharStats" class="btn-ghost-sm">← Voltar</button>
      <span class="stats-titulo">Histórico de Análises</span>
    </div>
    <div class="stats-scroll">

      <div class="stats-cards">
        <div class="stat-card">
          <span class="stat-num" id="statTotal">—</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="stat-card stat-card-green">
          <span class="stat-num" id="statPct">—</span>
          <span class="stat-label">Resolvidos</span>
        </div>
        <div class="stat-card">
          <span class="stat-num" id="statTempo">—</span>
          <span class="stat-label">Tempo médio</span>
        </div>
      </div>

      <div class="stats-chart-wrap">
        <div class="stats-chart-titulo">Análises por semana</div>
        <svg id="statsChart" class="stats-chart" viewBox="0 0 540 120" preserveAspectRatio="none"></svg>
      </div>

      <div class="stats-table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Título</th>
              <th>Data</th>
              <th>Tempo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="statsTableBody"></tbody>
        </table>
      </div>

    </div>
  </div>
```

---

- [ ] **Step 2: Atualizar `mostrarTela()` em `plugin/popup.js` para incluir `telaStats`**

Localizar `function mostrarTela(tela)` (linha 932) e adicionar uma linha antes de `document.body.style.minHeight`:

```js
  document.getElementById('telaStats').style.display = tela === 'stats' ? 'block' : 'none';
```

---

- [ ] **Step 3: Adicionar eventos do botão de stats em `configurarEventos()` em `plugin/popup.js`**

No final de `configurarEventos()` (antes do fechamento `}`), adicionar:

```js
  document.getElementById('btnAbrirStats').addEventListener('click', abrirStats);
  document.getElementById('btnFecharStats').addEventListener('click', () => mostrarTela('selecao'));
```

---

- [ ] **Step 4: Adicionar funções de stats ao final de `plugin/popup.js`**

Após as funções de confetti (Task 1), adicionar:

```js
// ============================================================ TELA STATS

async function abrirStats() {
  mostrarTela('stats');
  document.getElementById('statTotal').textContent = '...';
  document.getElementById('statPct').textContent   = '...';
  document.getElementById('statTempo').textContent = '...';
  document.getElementById('statsTableBody').innerHTML = '';
  document.getElementById('statsChart').innerHTML     = '';

  try {
    const res  = await fetch(`${SERVER_URL}/feedback/stats`);
    const data = await res.json();
    renderStats(data);
  } catch {
    document.getElementById('statTotal').textContent = 'Erro';
  }
}

function renderStats(data) {
  // Cards
  document.getElementById('statTotal').textContent =
    data.total || '0';
  document.getElementById('statPct').textContent =
    data.total > 0 ? Math.round((data.resolvidos / data.total) * 100) + '%' : '—';
  document.getElementById('statTempo').textContent =
    data.tempoMedio > 0 ? formatarTempo(data.tempoMedio) : '—';

  // SVG bar chart
  renderBarChart(data.porSemana || []);

  // Tabela
  const tbody  = document.getElementById('statsTableBody');
  const linhas = (data.execucoes || []).slice(0, 50);
  if (!linhas.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="stats-empty">Nenhuma análise registrada ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = linhas.map(e => {
    const data_ = new Date(e.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const tempo = e.tempoAnalise > 0 ? formatarTempo(e.tempoAnalise) : '—';
    const badge = e.status === 'resolved'
      ? '<span class="badge badge-ok">Resolvido</span>'
      : '<span class="badge badge-no">Não resolvido</span>';
    return `<tr>
      <td class="stats-id">${escaparHtml(e.ticketId || '—')}</td>
      <td class="stats-titulo-cel">${escaparHtml((e.titulo || '—').slice(0, 45))}</td>
      <td>${data_}</td>
      <td>${tempo}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

function renderBarChart(semanas) {
  const svg    = document.getElementById('statsChart');
  if (!semanas.length) { svg.innerHTML = ''; return; }
  const max    = Math.max(...semanas.map(s => s.total), 1);
  const W      = 540;
  const H      = 120;
  const padL   = 8;
  const padR   = 8;
  const padTop = 12;
  const padBot = 28;
  const n      = semanas.length;
  const barW   = Math.floor((W - padL - padR) / n) - 6;
  const chartH = H - padTop - padBot;

  const barras = semanas.map((s, i) => {
    const x       = padL + i * ((W - padL - padR) / n) + 3;
    const hTotal  = s.total   > 0 ? Math.max(4, Math.round((s.total   / max) * chartH)) : 0;
    const hResolv = s.resolvidos > 0 ? Math.round((s.resolvidos / max) * chartH) : 0;
    const yTotal  = padTop + chartH - hTotal;
    const yResolv = padTop + chartH - hResolv;

    return `
      <rect x="${x}" y="${yTotal}" width="${barW}" height="${hTotal}" rx="3" fill="var(--border2)" />
      <rect x="${x}" y="${yResolv}" width="${barW}" height="${hResolv}" rx="3" fill="#16a34a" />
      <text x="${x + barW / 2}" y="${H - 6}" text-anchor="middle" class="chart-label">${escaparHtml(s.label)}</text>
      ${s.total > 0 ? `<text x="${x + barW / 2}" y="${yTotal - 3}" text-anchor="middle" class="chart-num">${s.total}</text>` : ''}
    `;
  }).join('');

  svg.innerHTML = `
    <style>
      .chart-label { font-size: 9px; fill: var(--muted2); font-family: inherit; }
      .chart-num   { font-size: 9px; fill: var(--muted2); font-family: inherit; }
    </style>
    ${barras}
  `;
}

function formatarTempo(seg) {
  if (seg < 60) return seg + 's';
  return Math.floor(seg / 60) + 'm' + (seg % 60 > 0 ? (seg % 60) + 's' : '');
}
```

---

- [ ] **Step 5: Adicionar estilos da tela stats em `plugin/popup.css`**

Após os estilos da Task 1, adicionar:

```css
/* ============================================================ BOTÃO STATS FIXO */
.stats-toggle {
  position: fixed; top: 16px; left: 16px; z-index: 9999;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 999px; width: 36px; height: 36px;
  font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .25s, border-color .25s;
}
.stats-toggle:hover { border-color: var(--border2); }

/* ============================================================ TELA STATS */
.tela-stats {
  background: var(--bg); min-height: 400px;
  transition: background .25s;
}

.stats-header {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  transition: background .25s;
  position: sticky; top: 0; z-index: 10;
}

.stats-titulo {
  font-size: 13px; font-weight: 600; color: var(--text);
}

.stats-scroll {
  overflow-y: auto; max-height: 560px;
  display: flex; flex-direction: column; gap: 16px;
  padding: 16px;
}

/* Cards */
.stats-cards {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
}
.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 12px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  transition: background .25s;
}
.stat-card-green .stat-num { color: #16a34a; }
.stat-num   { font-size: 24px; font-weight: 700; color: var(--text); }
.stat-label { font-size: 11px; color: var(--muted2); }

/* Chart */
.stats-chart-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 12px 8px;
  transition: background .25s;
}
.stats-chart-titulo {
  font-size: 11px; font-weight: 600; color: var(--muted2);
  margin-bottom: 8px; text-transform: uppercase; letter-spacing: .04em;
}
.stats-chart {
  width: 100%; height: 120px; display: block;
  overflow: visible;
}

/* Tabela */
.stats-table-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  transition: background .25s;
}
.stats-table {
  width: 100%; border-collapse: collapse;
  font-size: 12px; color: var(--text);
}
.stats-table th {
  padding: 8px 10px; text-align: left;
  font-size: 10px; font-weight: 600; color: var(--muted2);
  text-transform: uppercase; letter-spacing: .04em;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.stats-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.stats-table tr:last-child td { border-bottom: none; }
.stats-id { font-weight: 600; font-size: 11px; color: var(--muted2); white-space: nowrap; }
.stats-titulo-cel { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stats-empty { text-align: center; color: var(--muted2); padding: 24px; }

.badge {
  display: inline-block; padding: 2px 8px;
  border-radius: 999px; font-size: 10px; font-weight: 600;
  white-space: nowrap;
}
.badge-ok  { background: #dcfce7; color: #16a34a; }
.badge-no  { background: #fee2e2; color: #dc2626; }
[data-theme="dark"] .badge-ok { background: #14532d44; color: #4ade80; }
[data-theme="dark"] .badge-no { background: #7f1d1d44; color: #f87171; }
```

---

- [ ] **Step 6: Verificar visualmente**

1. Recarregar extensão
2. Verificar que o botão `📊` aparece fixo no canto superior esquerdo (sem sobreposição com o toggle de tema)
3. Clicar `📊` → tela de stats abre
4. Se houver feedback salvo (Task 2), os cards e a tabela preenchem com dados reais
5. Se não houver dados, cards mostram `0` e a tabela mostra "Nenhuma análise registrada ainda"
6. Clicar `← Voltar` → retorna para tela de seleção
7. Verificar que o botão `📊` aparece em TODAS as telas (é `position: fixed`)

---

- [ ] **Step 7: Commit**

```bash
git add plugin/popup.html plugin/popup.js plugin/popup.css
git commit -m "feat: tela de estatisticas com cards, grafico SVG e tabela"
```

---

## Task 4 — `@` Menção de arquivo

**Files:**
- Modify: `plugin/popup.html` — placeholder do textarea de detalhes (linha 107)
- Modify: `plugin/popup.js` — `carregarArquivosProjeto()`, `configurarMencaoArquivo()`, chamar em `configurarEventos()`
- Modify: `plugin/popup.css` — estilos do dropdown de menção
- Modify: `server/index.js` — endpoint `GET /arquivos`, `injetarArquivosReferenciados()`, chamada em `montarPrompt()`

**Interfaces:**
- Consumes: `GET /arquivos?projeto=<slug>` → `{ arquivos: string[] }`
- Produces: dropdown de menção nos dois textareas; servidor injeta conteúdo de arquivos referenciados no prompt

---

- [ ] **Step 1: Adicionar dropdown de menção no textarea de detalhes em `plugin/popup.html`**

Localizar (linha ~102):
```html
      <div class="field-wrap" id="fieldWrapDetalhes" style="display:none">
        <span class="float-label">Detalhes chaves / dicas</span>
        <textarea
          id="descricaoTextarea"
          class="s2-textarea"
          placeholder="Ex: O campo Quantidade fica em branco ao salvar. O botão Confirmar some depois do segundo clique..."
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
          placeholder="Detalhe o mais profundo possível. Pode citar arquivos com @caminho/do/arquivo.ts"
          rows="4"
        ></textarea>
        <div id="mencaoDropdownDetalhes" class="mencao-dropdown" style="display:none"></div>
```

(Atenção: manter o `</div>` de fechamento do `field-wrap` que vem depois do `<p class="descricao-erro">`.)

---

- [ ] **Step 2: Adicionar endpoint `GET /arquivos` em `server/index.js`**

Adicionar após o endpoint `GET /funcionalidades` (após linha ~275):

```js
// -------------------------------------------------------
// GET /arquivos?projeto=<slug> — lista arquivos do projeto para @menção
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

- [ ] **Step 3: Adicionar função `injetarArquivosReferenciados` e chamar em `montarPrompt` em `server/index.js`**

Adicionar a função auxiliar logo antes de `function montarPrompt(...)` (linha ~171):

```js
// Detecta @caminho/arquivo.ext no texto e injeta conteúdo (máx 3 arquivos, 2000 chars cada)
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
    } catch { /* arquivo não existe — ignora */ }
  }
  return secoes.length ? '\n\n' + secoes.join('\n\n') : '';
}
```

Dentro de `function montarPrompt(dados, claudeMd, funcionalidadesMd)`, localizar a linha:
```js
OBSERVACAO     : ${truncar(dados.observacao, 1000) || 'Nenhuma observação adicional'}
```

Substituir por:
```js
OBSERVACAO     : ${truncar(dados.observacao, 1000) || 'Nenhuma observação adicional'}${injetarArquivosReferenciados(dados.observacao, dados.repoPath || '')}
```

Em `executarAnalise`, o `repoPath` é calculado DEPOIS de `montarPrompt()` ser chamado (bug na ordem atual). É necessário mover o bloco de cálculo de `repoPath` para ANTES da chamada `montarPrompt`.

Localizar em `executarAnalise` a sequência (em torno da linha 506-510):
```js
    // Monta prompt
    log.info('Montando prompt...');
    addLog(requestId, 'Montando contexto completo do chamado...');
    const prompt = montarPrompt(dados, claudeMd, funcionalidadesMd);
    log.info(`Prompt montado: ${prompt.length} chars`);
    addLog(requestId, `Contexto pronto — ${prompt.length.toLocaleString('pt-BR')} chars`);
```

Substituir por:

```js
    // Resolve repoPath antes de montar o prompt (necessário para injeção de @menções)
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
    addLog(requestId, `Contexto pronto — ${prompt.length.toLocaleString('pt-BR')} chars`);
```

Depois, localizar o bloco original de cálculo de `repoPath` (em torno da linha 554-565, APÓS a gravação do debug.txt):
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

Substituir por (sem a declaração `const repoPath`, pois já foi declarada acima):
```js
    const outputPath = process.env.OUTPUT_PATH;
```

---

- [ ] **Step 4: Adicionar função `carregarArquivosProjeto` e `configurarMencaoArquivo` em `plugin/popup.js`**

Adicionar após `// ============================================================ FEEDBACK / MODAL / CONFETTI` (após as funções da Task 1):

```js
// ============================================================ @MENÇÃO DE ARQUIVO

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

Em `irParaFormulario()` (linha ~57), após a linha `mostrarTela('formulario');`, adicionar:

```js
  carregarArquivosProjeto();
```

Em `configurarEventos()`, no final (antes do `}`), adicionar:

```js
  // @menção nos dois textareas
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

Após os estilos da Task 3, adicionar:

```css
/* ============================================================ @MENÇÃO */
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

- [ ] **Step 7: Verificar funcionalidade de @menção**

1. Recarregar extensão
2. Selecionar um projeto e clicar Iniciar
3. Marcar checkbox "Fornecer mais detalhes"
4. Digitar `@create` no textarea → dropdown deve aparecer com arquivos que contenham "create"
5. Clicar num item → caminho inserido no texto como `@src/app/...`
6. Testar também no campo "Ainda não resolveu" (tela resultado)
7. Testar endpoint: `GET http://localhost:3000/arquivos?projeto=<seu-slug>` → deve retornar lista de arquivos

Para verificar injeção no prompt: iniciar uma análise com `@src/app/algum/arquivo.ts` na observação, depois verificar o `debug.txt` em `C:\azure\atlas\debug.txt` e confirmar que o conteúdo do arquivo aparece sob `=== ARQUIVO REFERENCIADO ===`.

---

- [ ] **Step 8: Commit**

```bash
git add plugin/popup.html plugin/popup.js plugin/popup.css server/index.js
git commit -m "feat: @mencao de arquivo nos textareas com injecao de conteudo no prompt"
```

---

## Sequência de execução

```
Task 1 (botões + confetti) → reiniciar extensão → testar 3 botões + modal + confetti
Task 2 (endpoints feedback) → reiniciar servidor → testar POST /feedback e GET /feedback/stats
Task 3 (tela stats) → reiniciar extensão → testar botão 📊 e tela de stats
Task 4 (@menção) → reiniciar extensão + servidor → testar dropdown e injeção no prompt
```
