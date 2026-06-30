# Dashboard "Mesa de Controle" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar sub-projeto React em `atlas/dashboard/` que exibe métricas de todas as execuções do plugin, servido pelo mesmo Express em `localhost:3000/dashboard`.

**Architecture:** O servidor Express salva automaticamente um JSON por execução em `execucoes/<projeto>/`, expõe 3 novos endpoints de agregação, e serve o build Vite em `/dashboard`. O React app tem sidebar fixa com 3 páginas: Overview (KPIs + gráficos), Execuções (tabela filtrada), Efetividade (métricas de resolução). Zero impacto no plugin existente.

**Tech Stack:** Node.js/Express (existente), React 18, Vite 5, React Router 6, Recharts 2, CSS puro.

## Global Constraints

- Sem Tailwind, sem dependências além de react, react-dom, react-router-dom, recharts, vite, @vitejs/plugin-react
- Paleta de cores: `#F7F7F7` (bg), `#FFFFFF` (surface), `#111111` (text), `#E0E0E0` (border), `#22c55e` (success), `#AAAAAA` (muted)
- `salvarExecucao()` NUNCA pode lançar exceção nem bloquear o resultado da análise — toda exceção é silenciosa
- Tokens: estimativa `Math.round(chars / 4)` — nunca buscar da API
- `dashboard/dist/` é o output do build Vite; Express serve essa pasta em `/dashboard`
- Rotas React: `/dashboard/overview`, `/dashboard/execucoes`, `/dashboard/efetividade`
- `executarRefinamento` passa a aceitar `ticketId` e `titulo` como parâmetros adicionais
- Plugin `popup.js`: `reenviarAnalise()` inclui `ticketId` e `titulo` no body do POST `/refinar`

---

## File Map

### Criados
- `dashboard/package.json`
- `dashboard/vite.config.js`
- `dashboard/index.html`
- `dashboard/src/main.jsx`
- `dashboard/src/App.jsx`
- `dashboard/src/index.css`
- `dashboard/src/api.js`
- `dashboard/src/components/Sidebar.jsx`
- `dashboard/src/components/KPICard.jsx`
- `dashboard/src/components/StatusBadge.jsx`
- `dashboard/src/pages/Overview.jsx`
- `dashboard/src/pages/Execucoes.jsx`
- `dashboard/src/pages/Efetividade.jsx`

### Modificados
- `server/index.js` — adiciona `lerTodasExecucoes()`, `lerTodosFeedbacks()`, `salvarExecucao()`, endpoints `/dashboard/*`, `express.static`, e chamada a `salvarExecucao` ao final de `executarAnalise` e `executarRefinamento`
- `plugin/popup.js` — `reenviarAnalise()` envia `ticketId` e `titulo` no body

---

## Task 1: Server — salvarExecucao + endpoints + static

**Files:**
- Modify: `server/index.js`

**Interfaces:**
- Produces: `GET /dashboard/overview`, `GET /dashboard/execucoes`, `GET /dashboard/efetividade`, `GET /dashboard/*` (static)
- Produces: `salvarExecucao(dados)` chamado internamente
- Produces: `executarRefinamento(requestId, refinamento, projetoSlug, ticketId, titulo, inicio, logFile)` — nova assinatura

- [ ] **Step 1: Adicionar `lerTodasExecucoes` e `lerTodosFeedbacks` em `server/index.js`**

Inserir logo após a linha `const analises = {};` (por volta da linha 30 do arquivo):

```js
function lerTodasExecucoes() {
  const base = path.join(process.env.CONTEXT_PATH, 'execucoes');
  if (!fs.existsSync(base)) return [];
  const todos = [];
  for (const dir of fs.readdirSync(base)) {
    const dirPath = path.join(base, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    for (const arq of fs.readdirSync(dirPath)) {
      if (!arq.endsWith('.json')) continue;
      try { todos.push(JSON.parse(fs.readFileSync(path.join(dirPath, arq), 'utf8'))); } catch { /* ignora */ }
    }
  }
  return todos.sort((a, b) => b.timestamp - a.timestamp);
}

function lerTodosFeedbacks() {
  const base = path.join(process.env.CONTEXT_PATH, 'feedback');
  if (!fs.existsSync(base)) return [];
  const todos = [];
  for (const dir of fs.readdirSync(base)) {
    const dirPath = path.join(base, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    for (const arq of fs.readdirSync(dirPath)) {
      if (!arq.endsWith('.json')) continue;
      try { todos.push(JSON.parse(fs.readFileSync(path.join(dirPath, arq), 'utf8'))); } catch { /* ignora */ }
    }
  }
  return todos;
}

function salvarExecucao(dados) {
  try {
    const dir = path.join(process.env.CONTEXT_PATH, 'execucoes', dados.projeto || 'sem-projeto');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const nome = `${(dados.ticketId || 'sem-ticket').replace(/[^a-z0-9\-]/gi, '-')}-${dados.timestamp}.json`;
    fs.writeFileSync(path.join(dir, nome), JSON.stringify(dados, null, 2), 'utf8');
  } catch { /* silencioso */ }
}
```

- [ ] **Step 2: Chamar `salvarExecucao` ao final de `executarAnalise`**

Na linha 884 (após `analises[requestId] = { status: statusFinal, analise, inicio, logPath: logFile };`), adicionar:

```js
      // Salva registro da execução para o dashboard
      // Nota: funcIds e arquivos já foram extraídos nas linhas anteriores do mesmo callback
      const execTokensOut = Math.round(analise.length / 4);
      salvarExecucao({
        requestId,
        ticketId:          body.ticketId || '',
        titulo:            body.titulo || '',
        projeto:           projetoSlug || '',
        prioridade:        body.prioridade || '',
        tipo:              body.tipo || '',
        tempoAnalise:      Math.round((Date.now() - execInicio) / 1000),
        tokensEntrada:     promptTokens,
        tokensSaida:       execTokensOut,
        tokensTotal:       promptTokens + execTokensOut,
        funcionalidades:   funcIds
          ? funcIds.split('\n').filter(l => l.trim().startsWith('-'))
              .map(l => l.replace(/^[-\s]+/, '').split(' —')[0].trim()).filter(Boolean)
          : [],
        arquivosAnalisados: arquivos
          ? [...arquivos.matchAll(/\b((?:src|back)[\\/][\w.\-\\/]+\.\w+)/g)].map(m => m[1])
          : [],
        temPdf:            !!pdfPath,
        temObservacao:     !!(body.observacao && body.observacao.trim()),
        observacao:        (body.observacao || '').slice(0, 500),
        isRefinamento:     false,
        textoRefinamento:  null,
        statusFinal,
        timestamp:         Date.now()
      });
```

- [ ] **Step 3: Atualizar assinatura de `executarRefinamento` e chamar `salvarExecucao` ao final**

Linha 906 — alterar a assinatura de:
```js
async function executarRefinamento(requestId, refinamento, projetoSlug, inicio, logFile) {
```
para:
```js
async function executarRefinamento(requestId, refinamento, projetoSlug, ticketId, titulo, inicio, logFile) {
```

Linha 1002 — após `analises[requestId] = { status: 'done', analise, inicio, logPath: logFile };`, adicionar:

```js
    const refTokensIn  = Math.round(promptRefinamento.length / 4);
    const refTokensOut = Math.round(analise.length / 4);
    const extrairSecaoRefArr = (texto, secao) => {
      const re = new RegExp(`-{2,}\\s*\\r?\\n\\s*${secao}\\s*\\r?\\n-{2,}\\r?\\n([\\s\\S]*?)(?=\\n-{10,}|\\n={8,}|$)`, 'i');
      const m = texto.match(re);
      return m ? m[1].trim() : '';
    };
    const funcRaw = extrairSecaoRefArr(analise, 'FUNCIONALIDADES IDENTIFICADAS');
    const arqRaw  = extrairSecaoRefArr(analise, 'ARQUIVOS ANALISADOS');
    salvarExecucao({
      requestId,
      ticketId:          ticketId || '',
      titulo:            titulo || '',
      projeto:           projetoSlug || '',
      prioridade:        '',
      tipo:              '',
      tempoAnalise:      Math.round((Date.now() - execInicio) / 1000),
      tokensEntrada:     refTokensIn,
      tokensSaida:       refTokensOut,
      tokensTotal:       refTokensIn + refTokensOut,
      funcionalidades:   funcRaw
        ? funcRaw.split('\n').filter(l => l.trim().startsWith('-'))
            .map(l => l.replace(/^[-\s]+/, '').split(' —')[0].trim()).filter(Boolean)
        : [],
      arquivosAnalisados: arqRaw
        ? [...arqRaw.matchAll(/\b((?:src|back)[\\/][\w.\-\\/]+\.\w+)/g)].map(m => m[1])
        : [],
      temPdf:            false,
      temObservacao:     false,
      observacao:        '',
      isRefinamento:     true,
      textoRefinamento:  refinamento,
      statusFinal:       'done',
      timestamp:         Date.now()
    });
```

Também atualizar a chamada a `executarRefinamento` no handler do `POST /refinar`. Encontrar:
```js
  const { refinamento, projeto } = req.body;
```
Alterar para:
```js
  const { refinamento, projeto, ticketId, titulo } = req.body;
```
E a chamada:
```js
  executarRefinamento(requestId, refinamento, projeto || '', inicio, logFile);
```
Alterar para:
```js
  executarRefinamento(requestId, refinamento, projeto || '', ticketId || '', titulo || '', inicio, logFile);
```

- [ ] **Step 4: Adicionar os 3 endpoints GET /dashboard/* e o express.static**

Logo antes de `app.listen(PORT, ...)` (última linha do arquivo), inserir:

```js
// -------------------------------------------------------
// Dashboard — endpoints de dados
// -------------------------------------------------------
app.get('/dashboard/overview', (req, res) => {
  const todos     = lerTodasExecucoes();
  const feedbacks = lerTodosFeedbacks();

  const total          = todos.length;
  const resolvidos     = feedbacks.filter(f => f.status === 'resolved').length;
  const totalFeedback  = feedbacks.length;
  const taxaResolucao  = totalFeedback > 0 ? Math.round((resolvidos / totalFeedback) * 1000) / 10 : 0;
  const comTempo       = todos.filter(e => e.tempoAnalise > 0);
  const tempoMedio     = comTempo.length > 0
    ? Math.round(comTempo.reduce((s, e) => s + e.tempoAnalise, 0) / comTempo.length)
    : 0;
  const tokensTotal = todos.reduce((s, e) => s + (e.tokensTotal || 0), 0);

  const agora = Date.now();
  const porDia = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(agora - (27 - i) * 24 * 3600 * 1000);
    d.setHours(0, 0, 0, 0);
    const ini = d.getTime();
    const fim = ini + 24 * 3600 * 1000;
    const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return {
      data,
      total:     todos.filter(e => e.timestamp >= ini && e.timestamp < fim).length,
      resolvidos: feedbacks.filter(f => f.timestamp >= ini && f.timestamp < fim && f.status === 'resolved').length
    };
  });

  const statusCounts = {};
  todos.forEach(e => { statusCounts[e.statusFinal] = (statusCounts[e.statusFinal] || 0) + 1; });
  const porStatus = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  const projCounts = {};
  todos.forEach(e => { projCounts[e.projeto || 'sem-projeto'] = (projCounts[e.projeto || 'sem-projeto'] || 0) + 1; });
  const porProjeto = Object.entries(projCounts)
    .map(([projeto, total]) => ({ projeto, total }))
    .sort((a, b) => b.total - a.total);

  res.json({ kpis: { totalAnalises: total, taxaResolucao, tempoMedio, tokensTotal }, porDia, porStatus, porProjeto });
});

app.get('/dashboard/execucoes', (req, res) => {
  const { page = '1', limit = '50', projeto, status, busca, periodo } = req.query;
  let todos = lerTodasExecucoes();

  if (projeto) todos = todos.filter(e => e.projeto === projeto);
  if (status)  todos = todos.filter(e => e.statusFinal === status);
  if (busca) {
    const q = busca.toLowerCase();
    todos = todos.filter(e =>
      (e.ticketId || '').toLowerCase().includes(q) ||
      (e.titulo || '').toLowerCase().includes(q)
    );
  }
  if (periodo && periodo !== 'tudo') {
    if (periodo === 'hoje') {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      todos = todos.filter(e => e.timestamp >= hoje.getTime());
    } else {
      const dias  = periodo === '7d' ? 7 : 30;
      const limite = Date.now() - dias * 24 * 3600 * 1000;
      todos = todos.filter(e => e.timestamp >= limite);
    }
  }

  const total  = todos.length;
  const pg     = Math.max(1, parseInt(page));
  const lim    = Math.min(200, Math.max(1, parseInt(limit)));
  const inicio = (pg - 1) * lim;
  res.json({ total, page: pg, limit: lim, execucoes: todos.slice(inicio, inicio + lim) });
});

app.get('/dashboard/efetividade', (req, res) => {
  const todos     = lerTodasExecucoes();
  const feedbacks = lerTodosFeedbacks();

  const agora = Date.now();
  const taxaPorSemana = Array.from({ length: 8 }, (_, i) => {
    const ini = agora - (8 - i) * 7 * 24 * 3600 * 1000;
    const fim = agora - (7 - i) * 7 * 24 * 3600 * 1000;
    const label = new Date(fim).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return {
      semana:     label,
      total:      todos.filter(e => e.timestamp >= ini && e.timestamp < fim).length,
      resolvidos: feedbacks.filter(f => f.timestamp >= ini && f.timestamp < fim && f.status === 'resolved').length
    };
  });

  const comRefinamento  = todos.filter(e => e.isRefinamento).length;
  const semRefinamento  = todos.filter(e => !e.isRefinamento).length;

  const funcCounts = {};
  todos.forEach(e => (e.funcionalidades || []).forEach(f => { funcCounts[f] = (funcCounts[f] || 0) + 1; }));
  const topFuncionalidades = Object.entries(funcCounts)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total).slice(0, 10);

  const arqCounts = {};
  todos.forEach(e => (e.arquivosAnalisados || []).forEach(a => {
    const nome = a.split(/[\\/]/).pop();
    arqCounts[nome] = (arqCounts[nome] || 0) + 1;
  }));
  const topArquivos = Object.entries(arqCounts)
    .map(([arquivo, total]) => ({ arquivo, total }))
    .sort((a, b) => b.total - a.total).slice(0, 10);

  const refinamentos = todos
    .filter(e => e.isRefinamento && e.textoRefinamento)
    .slice(0, 20)
    .map(e => ({ ticketId: e.ticketId, titulo: e.titulo, textoRefinamento: e.textoRefinamento, statusFinal: e.statusFinal, timestamp: e.timestamp }));

  res.json({ taxaPorSemana, refinamentoStats: { comRefinamento, semRefinamento }, topFuncionalidades, topArquivos, refinamentos });
});

// Dashboard — serve build React
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard', 'dist')));
app.get('/dashboard', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'dist', 'index.html'))
);
app.get('/dashboard/*', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'dist', 'index.html'))
);
```

- [ ] **Step 5: Testar os endpoints com curl**

```bash
# Reiniciar o servidor
cd /Users/brunoscholze/Documents/GitHub/atlas/server && node index.js &
sleep 2

# Verificar overview (pode estar vazio, mas não deve dar erro 500)
curl -s http://localhost:3000/dashboard/overview | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('kpis:', JSON.stringify(j.kpis)); console.log('OK')"

# Verificar execucoes
curl -s "http://localhost:3000/dashboard/execucoes?limit=5" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('total:', j.total, '| OK')"

# Verificar efetividade
curl -s http://localhost:3000/dashboard/efetividade | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('taxaPorSemana length:', j.taxaPorSemana.length, '| OK')"
```

Esperado: todos retornam JSON sem erro 500. `taxaPorSemana.length` deve ser 8.

- [ ] **Step 6: Commit**

```bash
cd /Users/brunoscholze/Documents/GitHub/atlas
git add server/index.js
git commit -m "feat: salvarExecucao + endpoints dashboard no servidor"
```

---

## Task 2: Plugin — ticketId/titulo no body do /refinar

**Files:**
- Modify: `plugin/popup.js:994`

**Interfaces:**
- Consumes: `state.dadosTicket.ticketId`, `state.dadosTicket.titulo` (já existem no state)
- Produces: POST `/refinar` body inclui `ticketId` e `titulo`

- [ ] **Step 1: Atualizar `reenviarAnalise()` no popup.js**

Linha 994 — alterar:
```js
      body: JSON.stringify({ refinamento: texto, projeto: state.projetoSelecionado || '' })
```
para:
```js
      body: JSON.stringify({
        refinamento: texto,
        projeto:     state.projetoSelecionado || '',
        ticketId:    state.dadosTicket?.ticketId || '',
        titulo:      state.dadosTicket?.titulo   || ''
      })
```

- [ ] **Step 2: Verificar manualmente**

Abrir o plugin, fazer uma análise completa, depois clicar "Ainda não resolveu", digitar algo e clicar "Reenviar análise". Não deve dar erro. O arquivo `execucoes/<projeto>/` deve conter um JSON com `isRefinamento: true` e o `textoRefinamento` preenchido.

- [ ] **Step 3: Commit**

```bash
cd /Users/brunoscholze/Documents/GitHub/atlas
git add plugin/popup.js
git commit -m "feat: envia ticketId e titulo no body do POST /refinar"
```

---

## Task 3: Dashboard — scaffold Vite + layout + componentes base

**Files:**
- Create: `dashboard/package.json`
- Create: `dashboard/vite.config.js`
- Create: `dashboard/index.html`
- Create: `dashboard/src/main.jsx`
- Create: `dashboard/src/App.jsx`
- Create: `dashboard/src/index.css`
- Create: `dashboard/src/api.js`
- Create: `dashboard/src/components/Sidebar.jsx`
- Create: `dashboard/src/components/KPICard.jsx`
- Create: `dashboard/src/components/StatusBadge.jsx`

**Interfaces:**
- Produces: `fetchOverview()`, `fetchExecucoes(params)`, `fetchEfetividade()` de `api.js`
- Produces: `<Sidebar />`, `<KPICard label value sub color />`, `<StatusBadge status />`
- Produces: app rodando em `http://localhost:5173` (dev) com sidebar e rota `/overview` visível

- [ ] **Step 1: Criar `dashboard/package.json`**

```json
{
  "name": "atlas-dashboard",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.2"
  }
}
```

- [ ] **Step 2: Criar `dashboard/vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  server: {
    proxy: {
      '/dashboard/overview':     'http://localhost:3000',
      '/dashboard/execucoes':    'http://localhost:3000',
      '/dashboard/efetividade':  'http://localhost:3000',
    }
  }
})
```

- [ ] **Step 3: Criar `dashboard/index.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Atlas Code — Mesa de Controle</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Criar `dashboard/src/index.css`**

```css
:root {
  --bg: #F7F7F7;
  --surface: #FFFFFF;
  --border: #E0E0E0;
  --text: #111111;
  --muted: #AAAAAA;
  --muted2: #666666;
  --success: #22c55e;
  --sidebar-w: 220px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); font-size: 13px; }
a { text-decoration: none; color: inherit; }
button { font-family: inherit; cursor: pointer; }
```

- [ ] **Step 5: Criar `dashboard/src/api.js`**

```js
export const fetchOverview    = () => fetch('/dashboard/overview').then(r => r.json());
export const fetchExecucoes   = (p) => fetch('/dashboard/execucoes?' + new URLSearchParams(p)).then(r => r.json());
export const fetchEfetividade = () => fetch('/dashboard/efetividade').then(r => r.json());
```

- [ ] **Step 6: Criar `dashboard/src/components/Sidebar.jsx`**

```jsx
import { NavLink } from 'react-router-dom';

const links = [
  { to: '/overview',     label: 'Overview' },
  { to: '/execucoes',    label: 'Execuções' },
  { to: '/efetividade',  label: 'Efetividade' },
];

export default function Sidebar() {
  return (
    <nav style={{
      width: 'var(--sidebar-w)', background: 'var(--surface)',
      borderRight: '1px solid var(--border)', padding: '24px 0',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh', flexShrink: 0
    }}>
      <div style={{ padding: '0 20px 28px' }}>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>Atlas Code</div>
        <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 2 }}>Mesa de Controle</div>
      </div>
      {links.map(l => (
        <NavLink key={l.to} to={l.to} style={({ isActive }) => ({
          padding: '9px 20px', fontSize: 13,
          color: isActive ? 'var(--text)' : 'var(--muted2)',
          fontWeight: isActive ? 600 : 400,
          background: isActive ? 'var(--bg)' : 'transparent',
          borderLeft: isActive ? '3px solid var(--text)' : '3px solid transparent',
        })}>
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 7: Criar `dashboard/src/components/KPICard.jsx`**

```jsx
export default function KPICard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '20px 24px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted2)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 8: Criar `dashboard/src/components/StatusBadge.jsx`**

```jsx
const MAP = {
  done:        { label: 'Concluída',     bg: '#f0fdf4', color: '#16a34a' },
  no_subject:  { label: 'Sem assunto',   bg: '#fef9c3', color: '#a16207' },
  error:       { label: 'Erro',          bg: '#fef2f2', color: '#dc2626' },
  cancelled:   { label: 'Cancelada',     bg: '#f3f4f6', color: '#6b7280' },
  resolved:    { label: 'Resolvido',     bg: '#f0fdf4', color: '#16a34a' },
  unresolved:  { label: 'Não resolvido', bg: '#fef2f2', color: '#dc2626' },
};

export default function StatusBadge({ status }) {
  const s = MAP[status] || { label: status || '—', bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}
```

- [ ] **Step 9: Criar `dashboard/src/App.jsx`**

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import Execucoes from './pages/Execucoes';
import Efetividade from './pages/Efetividade';
import './index.css';

export default function App() {
  return (
    <BrowserRouter basename="/dashboard">
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '32px', overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview"    element={<Overview />} />
            <Route path="/execucoes"   element={<Execucoes />} />
            <Route path="/efetividade" element={<Efetividade />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
```

- [ ] **Step 10: Criar `dashboard/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 11: Instalar dependências e verificar que o app sobe**

```bash
cd /Users/brunoscholze/Documents/GitHub/atlas/dashboard
npm install
npm run dev
```

Esperado: Vite sobe em `http://localhost:5173`. Abrir no browser, verificar que a sidebar aparece com os 3 links. Pode dar erro de rota no conteúdo (páginas ainda não existem) — isso é esperado.

Encerrar o servidor de dev com Ctrl+C.

- [ ] **Step 12: Commit**

```bash
cd /Users/brunoscholze/Documents/GitHub/atlas
git add dashboard/
git commit -m "feat: scaffold Vite + layout sidebar + componentes base do dashboard"
```

---

## Task 4: Dashboard — Página Overview

**Files:**
- Create: `dashboard/src/pages/Overview.jsx`

**Interfaces:**
- Consumes: `fetchOverview()` de `../api` — retorna `{ kpis, porDia, porStatus, porProjeto }`
- Consumes: `KPICard` de `../components/KPICard`
- Produces: página completa com 4 KPI cards + line chart + donut + bar chart horizontal

- [ ] **Step 1: Criar `dashboard/src/pages/Overview.jsx`**

```jsx
import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import KPICard from '../components/KPICard';
import { fetchOverview } from '../api';

const STATUS_COLORS = { done: '#22c55e', no_subject: '#f59e0b', error: '#ef4444', cancelled: '#9ca3af' };

function fmtTempo(s) {
  if (!s) return '—';
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}
function fmtTokens(n) {
  if (!n) return '0';
  return n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

export default function Overview() {
  const [data, setData] = useState(null);

  useEffect(() => { fetchOverview().then(setData).catch(console.error); }, []);

  if (!data) return <div style={{ color: 'var(--muted2)', padding: 40 }}>Carregando...</div>;

  const { kpis, porDia, porStatus, porProjeto } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Overview</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KPICard label="Total de análises" value={kpis.totalAnalises} />
        <KPICard label="Taxa de resolução" value={`${kpis.taxaResolucao}%`} color="#16a34a" sub="do total com feedback" />
        <KPICard label="Tempo médio" value={fmtTempo(kpis.tempoMedio)} sub="por análise" />
        <KPICard label="Tokens usados" value={fmtTokens(kpis.tokensTotal)} sub="estimativa total" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Análises por dia — últimas 4 semanas</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={porDia}>
            <XAxis dataKey="data" tick={{ fontSize: 11 }} interval={6} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="total"     name="Total"     stroke="#111" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="resolvidos" name="Resolvidos" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Status das análises</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={porStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {porStatus.map(e => <Cell key={e.name} fill={STATUS_COLORS[e.name] || '#9ca3af'} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Análises por projeto</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porProjeto} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="projeto" tick={{ fontSize: 11 }} width={140} />
              <Tooltip />
              <Bar dataKey="total" fill="#111" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar no browser**

```bash
cd /Users/brunoscholze/Documents/GitHub/atlas/dashboard
npm run dev
```

Abrir `http://localhost:5173/dashboard/overview`. Confirmar: 4 KPI cards aparecem, 3 gráficos aparecem (podem estar vazios se não há dados). Sem erros no console. Encerrar dev server.

- [ ] **Step 3: Commit**

```bash
cd /Users/brunoscholze/Documents/GitHub/atlas
git add dashboard/src/pages/Overview.jsx
git commit -m "feat: página Overview com KPIs e gráficos Recharts"
```

---

## Task 5: Dashboard — Página Execuções

**Files:**
- Create: `dashboard/src/pages/Execucoes.jsx`

**Interfaces:**
- Consumes: `fetchExecucoes(params)` de `../api` — retorna `{ total, page, limit, execucoes }`
- Consumes: `StatusBadge` de `../components/StatusBadge`
- Produces: tabela filtrada com paginação

- [ ] **Step 1: Criar `dashboard/src/pages/Execucoes.jsx`**

```jsx
import { useEffect, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import { fetchExecucoes } from '../api';

const STATUS_OPTS  = ['done', 'no_subject', 'error', 'cancelled'];
const PERIODO_OPTS = [
  { label: 'Tudo',    value: 'tudo' },
  { label: 'Hoje',    value: 'hoje' },
  { label: '7 dias',  value: '7d'   },
  { label: '30 dias', value: '30d'  },
];

function fmtTempo(s) { return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; }
function fmtData(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const filterStyle = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
  fontSize: 12, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)'
};

export default function Execucoes() {
  const [data, setData]       = useState({ total: 0, execucoes: [] });
  const [projetos, setProjetos] = useState([]);
  const [filters, setFilters] = useState({ page: 1, limit: 50, projeto: '', status: '', busca: '', periodo: 'tudo' });

  useEffect(() => {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([k, v]) => v !== '' && v !== 'tudo' && k !== 'page' || k === 'page' || k === 'limit')
    );
    fetchExecucoes(params)
      .then(d => {
        setData(d);
        const ps = [...new Set(d.execucoes.map(e => e.projeto).filter(Boolean))];
        setProjetos(prev => [...new Set([...prev, ...ps])]);
      })
      .catch(console.error);
  }, [filters]);

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v, page: 1 }));
  const totalPages = Math.ceil(data.total / filters.limit);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Execuções</h1>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={filters.busca} onChange={e => set('busca', e.target.value)}
          placeholder="Buscar por ticket ou título..."
          style={{ ...filterStyle, width: 220 }} />

        <select value={filters.projeto} onChange={e => set('projeto', e.target.value)} style={filterStyle}>
          <option value="">Todos os projetos</option>
          {projetos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={filters.status} onChange={e => set('status', e.target.value)} style={filterStyle}>
          <option value="">Todos os status</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {PERIODO_OPTS.map(p => (
          <button key={p.value} onClick={() => set('periodo', p.value)} style={{
            ...filterStyle,
            background: filters.periodo === p.value ? 'var(--text)' : 'var(--surface)',
            color:      filters.periodo === p.value ? '#fff' : 'var(--muted2)',
          }}>
            {p.label}
          </button>
        ))}

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted2)' }}>
          {data.total} execuções
        </span>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              {['Ticket', 'Título', 'Projeto', 'Tempo', 'Tokens', 'Funcionalidades', 'Ref.', 'Status', 'Data'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted2)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.execucoes.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--muted2)' }}>Nenhuma execução encontrada</td></tr>
            )}
            {data.execucoes.map((e, i) => (
              <tr key={e.requestId || i}
                style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={ev => ev.currentTarget.style.background = ''}>
                <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{e.ticketId || '—'}</td>
                <td style={{ padding: '10px 14px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.titulo}>{e.titulo || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--muted2)' }}>{e.projeto || '—'}</td>
                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{e.tempoAnalise ? fmtTempo(e.tempoAnalise) : '—'}</td>
                <td style={{ padding: '10px 14px' }}>{e.tokensTotal ? e.tokensTotal.toLocaleString('pt-BR') : '—'}</td>
                <td style={{ padding: '10px 14px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={(e.funcionalidades || []).join(', ')}>
                  {(e.funcionalidades || []).slice(0, 2).join(', ') || '—'}
                  {(e.funcionalidades || []).length > 2 ? ` +${e.funcionalidades.length - 2}` : ''}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {e.isRefinamento
                    ? <span title={e.textoRefinamento || ''} style={{ cursor: 'help', color: '#d97706', fontWeight: 600 }}>Sim</span>
                    : <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
                <td style={{ padding: '10px 14px' }}><StatusBadge status={e.statusFinal} /></td>
                <td style={{ padding: '10px 14px', color: 'var(--muted2)', whiteSpace: 'nowrap' }}>{fmtData(e.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <button onClick={() => setFilters(f => ({ ...f, page: Math.max(1, f.page - 1) }))}
            disabled={filters.page === 1} style={filterStyle}>←</button>
          <span style={{ fontSize: 12, color: 'var(--muted2)' }}>{filters.page} / {totalPages}</span>
          <button onClick={() => setFilters(f => ({ ...f, page: Math.min(totalPages, f.page + 1) }))}
            disabled={filters.page === totalPages} style={filterStyle}>→</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar no browser**

```bash
cd /Users/brunoscholze/Documents/GitHub/atlas/dashboard
npm run dev
```

Abrir `http://localhost:5173/dashboard/execucoes`. Confirmar: filtros aparecem, tabela aparece (vazia se sem dados), sem erros no console. Encerrar dev server.

- [ ] **Step 3: Commit**

```bash
cd /Users/brunoscholze/Documents/GitHub/atlas
git add dashboard/src/pages/Execucoes.jsx
git commit -m "feat: página Execuções com filtros e paginação"
```

---

## Task 6: Dashboard — Página Efetividade

**Files:**
- Create: `dashboard/src/pages/Efetividade.jsx`

**Interfaces:**
- Consumes: `fetchEfetividade()` de `../api` — retorna `{ taxaPorSemana, refinamentoStats, topFuncionalidades, topArquivos, refinamentos }`
- Consumes: `StatusBadge` de `../components/StatusBadge`
- Produces: página com 2 charts linha superior + 2 bar charts + tabela de refinamentos

- [ ] **Step 1: Criar `dashboard/src/pages/Efetividade.jsx`**

```jsx
import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import StatusBadge from '../components/StatusBadge';
import { fetchEfetividade } from '../api';

function fmtData(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 };

export default function Efetividade() {
  const [data, setData] = useState(null);

  useEffect(() => { fetchEfetividade().then(setData).catch(console.error); }, []);

  if (!data) return <div style={{ color: 'var(--muted2)', padding: 40 }}>Carregando...</div>;

  const { taxaPorSemana, refinamentoStats, topFuncionalidades, topArquivos, refinamentos } = data;
  const totalRef = (refinamentoStats.comRefinamento || 0) + (refinamentoStats.semRefinamento || 0);
  const pieData  = [
    { name: 'Sem refinamento', value: refinamentoStats.semRefinamento || 0 },
    { name: 'Com refinamento', value: refinamentoStats.comRefinamento || 0 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Efetividade</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Taxa de resolução por semana</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={taxaPorSemana}>
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total"     name="Total"     stroke="#111" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="resolvidos" name="Resolvidos" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Uso de refinamento</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                <Cell fill="#111" />
                <Cell fill="#f59e0b" />
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted2)', marginTop: 8 }}>
            {totalRef > 0
              ? `${Math.round((refinamentoStats.comRefinamento / totalRef) * 100)}% precisaram de refinamento`
              : 'Sem dados ainda'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Top funcionalidades analisadas</div>
          {topFuncionalidades.length === 0
            ? <div style={{ color: 'var(--muted2)', fontSize: 12 }}>Sem dados ainda</div>
            : <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topFuncionalidades} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={150} />
                  <Tooltip />
                  <Bar dataKey="total" name="Análises" fill="#111" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Top arquivos mais analisados</div>
          {topArquivos.length === 0
            ? <div style={{ color: 'var(--muted2)', fontSize: 12 }}>Sem dados ainda</div>
            : <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topArquivos} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="arquivo" tick={{ fontSize: 11 }} width={180} />
                  <Tooltip />
                  <Bar dataKey="total" name="Aparições" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>}
        </div>
      </div>

      {refinamentos.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
            Tickets que usaram refinamento
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['Ticket', 'Título', 'Texto enviado', 'Status', 'Data'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted2)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {refinamentos.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{r.ticketId || '—'}</td>
                  <td style={{ padding: '10px 14px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo || '—'}</td>
                  <td style={{ padding: '10px 14px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted2)' }} title={r.textoRefinamento}>{r.textoRefinamento}</td>
                  <td style={{ padding: '10px 14px' }}><StatusBadge status={r.statusFinal} /></td>
                  <td style={{ padding: '10px 14px', color: 'var(--muted2)', whiteSpace: 'nowrap' }}>{fmtData(r.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar no browser**

```bash
cd /Users/brunoscholze/Documents/GitHub/atlas/dashboard
npm run dev
```

Abrir `http://localhost:5173/dashboard/efetividade`. Confirmar: os 2 charts aparecem, os 2 bar charts aparecem (com mensagem "Sem dados ainda" se vazios), sem erros no console. Encerrar dev server.

- [ ] **Step 3: Commit**

```bash
cd /Users/brunoscholze/Documents/GitHub/atlas
git add dashboard/src/pages/Efetividade.jsx
git commit -m "feat: página Efetividade com gráficos de resolução e refinamento"
```

---

## Task 7: Build e integração final

**Files:**
- None (build gera `dashboard/dist/`)

**Interfaces:**
- Consumes: `dashboard/dist/` servido pelo Express em `/dashboard`
- Produces: `http://localhost:3000/dashboard` funcionando

- [ ] **Step 1: Fazer o build**

```bash
cd /Users/brunoscholze/Documents/GitHub/atlas/dashboard
npm run build
```

Esperado: pasta `dashboard/dist/` criada com `index.html` e assets. Sem erros de build.

- [ ] **Step 2: Reiniciar o servidor e verificar**

```bash
# Matar servidor existente se rodando
pkill -f "node index.js" 2>/dev/null || true
sleep 1

# Subir servidor
cd /Users/brunoscholze/Documents/GitHub/atlas/server
node index.js &
sleep 2

# Verificar que o dashboard responde
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard
# Esperado: 200

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard/overview
# Esperado: 200 (JSON)
```

- [ ] **Step 3: Abrir no browser e verificar as 3 páginas**

Abrir `http://localhost:3000/dashboard` no browser.

Checklist:
- [ ] Sidebar aparece com os 3 links
- [ ] Redirect automático para `/dashboard/overview`
- [ ] Overview: 4 KPI cards, 3 gráficos
- [ ] Execuções: filtros e tabela
- [ ] Efetividade: charts e tabela
- [ ] Sem erros de console (F12)
- [ ] Rotas funcionam ao clicar na sidebar (sem reload de página)

- [ ] **Step 4: Commit final**

```bash
cd /Users/brunoscholze/Documents/GitHub/atlas
git add dashboard/dist/ dashboard/
git commit -m "feat: build do dashboard Mesa de Controle integrado ao servidor"
```
