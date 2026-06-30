# Design: Mesa de Controle — Dashboard React

**Data:** 2026-06-30
**Status:** Aprovado para implementação

---

## Visão geral

Sub-projeto React (`atlas/dashboard/`) que exibe métricas de todas as execuções do plugin Atlas Code. Servido pelo mesmo Express em `http://localhost:3000/dashboard`. Zero impacto no plugin existente — dados são salvos assincronamente após cada análise.

---

## Dados capturados por execução

O servidor salva automaticamente `execucoes/<projeto>/<ticketId>-<timestamp>.json` ao final de TODA execução (done, no_subject, error, cancelled), sem ação do plugin.

```json
{
  "requestId": "uuid",
  "ticketId": "ATLAS-123",
  "titulo": "Erro ao salvar OP",
  "projeto": "minha-totvs-prod",
  "prioridade": "Alta",
  "tipo": "bug",
  "tempoAnalise": 251,
  "tokensEntrada": 4800,
  "tokensSaida": 620,
  "tokensTotal": 5420,
  "funcionalidades": ["Criar OP", "Editar OP"],
  "arquivosAnalisados": ["src/app/criar-op.component.ts"],
  "temPdf": true,
  "temObservacao": false,
  "observacao": "",
  "isRefinamento": false,
  "textoRefinamento": null,
  "statusFinal": "done",
  "timestamp": 1751234567890
}
```

**Campos-chave:**
- `funcionalidades` — extraídas do output do Claude (seção FUNCIONALIDADES IDENTIFICADAS)
- `arquivosAnalisados` — extraídos do output do Claude (seção ARQUIVOS ANALISADOS)
- `isRefinamento` — true quando veio de `POST /refinar` com `--continue`
- `textoRefinamento` — texto exato enviado no "Ainda não resolveu"
- `tokensEntrada/Saida/Total` — estimativa: `Math.round(chars / 4)`
- `statusFinal` — `done | no_subject | error | cancelled`

Feedback (resolvido/não) continua em `feedback/<projeto>/` e é cruzado na API por `ticketId`.

---

## Estrutura de pastas

```
atlas/
├── dashboard/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx                    ← React Router + Sidebar layout
│   │   ├── pages/
│   │   │   ├── Overview.jsx
│   │   │   ├── Execucoes.jsx
│   │   │   └── Efetividade.jsx
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── KPICard.jsx
│   │   │   └── StatusBadge.jsx
│   │   └── index.css                  ← paleta do plugin reutilizada
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── execucoes/
│   └── <projeto>/
│       └── <ticketId>-<ts>.json
└── server/index.js                    ← 4 mudanças (ver abaixo)
```

---

## Mudanças no servidor (`server/index.js`)

### 1. Função `salvarExecucao(dados)`

Chamada internamente ao final de `executarAnalise()` e `executarRefinamento()`. Nunca falha — toda exceção é silenciosa para não afetar o resultado da análise.

```js
function salvarExecucao(dados) {
  try {
    const dir = path.join(process.env.CONTEXT_PATH, 'execucoes', dados.projeto || 'sem-projeto');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const nome = `${(dados.ticketId || 'sem-ticket').replace(/[^a-z0-9\-]/gi, '-')}-${dados.timestamp}.json`;
    fs.writeFileSync(path.join(dir, nome), JSON.stringify(dados, null, 2), 'utf8');
  } catch { /* silencioso */ }
}
```

### 2. `GET /dashboard/execucoes`

Query params: `page` (default 1), `limit` (default 50), `projeto`, `status`, `busca`.

Lê todos os JSONs de `execucoes/`, filtra, pagina e retorna:
```json
{
  "total": 142,
  "page": 1,
  "limit": 50,
  "execucoes": [...]
}
```

### 3. `GET /dashboard/overview`

Retorna todos os dados necessários para a página Overview:

```json
{
  "kpis": {
    "totalAnalises": 142,
    "taxaResolucao": 73.2,
    "tempoMedio": 287,
    "tokensTotal": 892400
  },
  "porDia": [{ "data": "2026-06-24", "total": 8, "resolvidos": 6 }],
  "porStatus": [{ "name": "done", "value": 130 }, ...],
  "porProjeto": [{ "projeto": "minha-totvs-prod", "total": 110 }]
}
```

### 4. `GET /dashboard/efetividade`

Agrega dados para a Página Efetividade — processado server-side para não enviar centenas de registros brutos:

```json
{
  "taxaPorSemana": [{ "semana": "16/06", "total": 12, "resolvidos": 9 }],
  "refinamentoStats": { "comRefinamento": 18, "semRefinamento": 124 },
  "topFuncionalidades": [{ "nome": "Criar OP", "total": 34 }],
  "topArquivos": [{ "arquivo": "criar-op.component.ts", "total": 28 }],
  "refinamentos": [{ "ticketId": "...", "titulo": "...", "textoRefinamento": "...", "statusFinal": "..." }]
}
```

### 6. `express.static` + `GET /dashboard`

```js
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard', 'dist')));
app.get('/dashboard', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'dist', 'index.html'))
);
```

---

## Páginas do dashboard

### Sidebar (fixa em todas as páginas)
- Logo Atlas Code
- Links: Overview / Execuções / Efetividade
- Indicador: ponto verde "Servidor online"

### Página 1 — Overview

**KPI cards (linha superior):**
| Card | Valor | Sub |
|------|-------|-----|
| Total de análises | 142 | +8 esta semana |
| Taxa de resolução | 73% | resolvido / total com feedback |
| Tempo médio | 4m 47s | por análise |
| Tokens usados | 892K | estimativa total |

**Gráficos:**
- Line chart (largura total): análises por dia — últimas 4 semanas. Duas linhas: total e resolvidas.
- Donut chart: distribuição por status (done / no_subject / error / cancelled)
- Bar chart horizontal: análises por projeto

### Página 2 — Execuções

**Filtros acima da tabela:**
- Dropdown Projeto
- Dropdown Status (done / no_subject / error / cancelled)
- Dropdown Período (hoje / 7d / 30d / tudo)
- Campo de busca por ticketId ou título

**Tabela (colunas):**
| Ticket | Título | Projeto | Tempo | Tokens | Funcionalidades | Refinamento | Status | Data |
|--------|--------|---------|-------|--------|-----------------|-------------|--------|------|

- Refinamento: badge "Sim" com tooltip mostrando o texto enviado
- Status: badge colorido (verde/vermelho/cinza)
- Paginação: 50 por página

### Página 3 — Efetividade

**Gráficos:**
- Line chart: taxa de resolução por semana (últimas 8 semanas)
- Donut: % que usou refinamento vs resolveu na primeira análise
- Bar chart horizontal: top 10 funcionalidades mais analisadas (proxy para áreas com mais bugs)
- Bar chart horizontal: top 10 arquivos mais aparecidos em ARQUIVOS ANALISADOS

**Tabela inferior:**
- Top tickets com refinamento: ticketId, título, texto do refinamento, status final

---

## Stack React

| Dependência | Versão | Uso |
|-------------|--------|-----|
| react + react-dom | 18 | base |
| react-router-dom | 6 | navegação sidebar |
| recharts | 2 | todos os gráficos |
| vite | 5 | build tool |

Sem Tailwind. CSS puro com variáveis da mesma paleta do plugin (`#F7F7F7`, `#111111`, `#22c55e`, `#E0E0E0`).

---

## Desenvolvimento

```bash
# Dev (hot reload, aponta para API em localhost:3000)
cd atlas/dashboard && npm run dev   → http://localhost:5173

# Build para produção
npm run build                       → dashboard/dist/
# Acessar em http://localhost:3000/dashboard
```

`vite.config.js` configura proxy `/dashboard` → `localhost:3000` em dev.

---

## O que NÃO muda

- Plugin Chrome — nenhuma alteração
- CLAUDE.md — nenhuma alteração
- Endpoints existentes (`/analisar`, `/feedback`, `/refinar`) — nenhuma alteração
- `feedback/` — continua existindo e sendo salvo como hoje

---

## Ordem de implementação

1. **Servidor** — `salvarExecucao()` + endpoints `/dashboard/overview` e `/dashboard/execucoes`
2. **Vite scaffold** — criar `dashboard/` com React Router + layout Sidebar
3. **Página Overview** — KPI cards + 3 gráficos Recharts
4. **Página Execuções** — tabela filtrada com paginação
5. **Página Efetividade** — gráficos de resolução + funcionalidades + arquivos
6. **Integração final** — `express.static`, build, testar em `/dashboard`
