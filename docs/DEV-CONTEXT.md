# DEV-CONTEXT.md — Atlas: Plugin de Chamados Minha Totvs Prod

> Leia este arquivo no início de qualquer sessão de desenvolvimento neste repositório.
> Ele contém o contexto completo do projeto, decisões técnicas e armadilhas conhecidas.

---

## O que é este projeto

Um sistema de análise automática de chamados Jira para o app **Minha Totvs Prod**.
O dev abre um ticket no Jira, clica no plugin, anexa o PDF do chamado,
e o sistema aciona o Claude Code para investigar o código e retornar onde está o bug.

**Quatro componentes:**
1. **Plugin Chrome** (`plugin/`) — interface do dev no Jira
2. **Servidor Node.js** (`server/`) — orquestra tudo, recebe o upload do PDF, chama o script
3. **Script de execução** (`scripts/`) — executa `claude --print` e grava o resultado
   - Windows: `run-claude.ps1`
   - Mac/Linux: `run-claude.sh`
4. **Dashboard de estatísticas** (`dashboard/`) — React app em `http://localhost:3000/dashboard`

**Arquivos de instrução e configuração (lidos pelo servidor a cada requisição):**
- `claude.md` — instruções do agente de análise (NÃO é para desenvolvimento do plugin)
- `PROJETOS.md` — lista de projetos ativos com seus arquivos de funcionalidades
- `Funcionalidades-<projeto>.md` — mapa de funcionalidades → arquivos suspeitos do projeto
- `Funcionalidades.md` — fallback genérico (usado se nenhum projeto for identificado)

---

## Estrutura de pastas

```
atlas/
├── server/
│   ├── index.js          ← servidor Express principal (~1250 linhas)
│   ├── .env              ← variáveis de ambiente (não comitar)
│   └── node_modules/
├── plugin/
│   ├── popup.html        ← UI da extensão
│   ├── popup.js          ← lógica do popup (~1150 linhas)
│   ├── popup.css         ← estilos (~720 linhas)
│   ├── content.js        ← extrai dados do Jira (roda na aba)
│   ├── manifest.json     ← manifesto da extensão (MV3)
│   └── vendor/
│       └── confetti.js   ← canvas-confetti 1.9.2 (bundled localmente)
├── dashboard/            ← React app da Mesa de Controle (Vite + Recharts)
│   ├── src/
│   │   ├── App.jsx       ← Router + layout com Sidebar
│   │   ├── api.js        ← fetchOverview / fetchExecucoes / fetchEfetividade
│   │   ├── index.css     ← CSS vars: --bg, --surface, --text, --border, --success
│   │   ├── components/   ← Sidebar, KPICard, StatusBadge
│   │   └── pages/        ← Overview, Execucoes, Efetividade
│   ├── dist/             ← build gerado (commitado — Express serve daqui)
│   ├── package.json
│   └── vite.config.js    ← base '/dashboard/', proxy → localhost:3000
├── scripts/
│   ├── run-claude.ps1    ← executa claude --print no Windows
│   └── run-claude.sh     ← executa claude --print no Mac/Linux (suporta modo --continue)
├── docs/
│   ├── DEV-CONTEXT.md    ← este arquivo
│   ├── COMO-ADICIONAR-PROJETO.md
│   ├── COMO-RODAR.md
│   └── superpowers/
│       ├── specs/
│       │   ├── 2026-06-29-ux-feedback-mentions-design.md
│       │   ├── 2026-06-28-refinamento-design.md
│       │   └── 2026-06-30-dashboard-design.md
│       └── plans/
│           ├── 2026-06-29-ux-feedback-mentions.md
│           └── 2026-06-30-dashboard.md
├── execucoes/            ← JSONs de execução salvos automaticamente (gitignored)
│   └── <projeto>/
│       └── <ticketId>-<timestamp>.json
├── feedback/             ← JSONs de feedback salvos pelo servidor (gitignored)
│   └── <projeto>/
│       └── <ticketId>-<timestamp>.json
├── repos/
│   └── app-minha-producao/  ← repositório do app clonado aqui (não comitar)
├── logs/
│   └── agent.log         ← log único, sobrescrito a cada execução
├── claude.md             ← instruções do AGENTE DE ANÁLISE (não alterar levianamente)
├── PROJETOS.md           ← projetos cadastrados no Atlas
├── Funcionalidades.md    ← mapa genérico (fallback)
├── Funcionalidades-App-minha-prod.md  ← mapa do projeto ativo
├── output.txt            ← resultado da última análise (gerado, gitignored)
├── debug.txt             ← parâmetros + prompt completo da última execução (gitignored)
└── temp/                 ← PDFs temporários (apagados após análise)
```

---

## Variáveis de ambiente — server/.env

**Windows:**
```
PORT=3000
CONTEXT_PATH=C:\azure\atlas
OUTPUT_PATH=C:\azure\atlas\output.txt
REPO_PATH=C:\azure\atlas\repos\app-minha-producao
TEMP_PATH=C:\azure\atlas\temp
```

**Mac** (substituir `brunoscholze` pelo resultado de `whoami`):
```
PORT=3000
CONTEXT_PATH=/Users/brunoscholze/Documents/GitHub/atlas
OUTPUT_PATH=/Users/brunoscholze/Documents/GitHub/atlas/output.txt
REPO_PATH=/Users/brunoscholze/Documents/GitHub/atlas/repos/app-minha-producao
TEMP_PATH=/Users/brunoscholze/Documents/GitHub/atlas/temp
```

> O `REPO_PATH` é usado como fallback. O caminho real do repositório vem do campo
> `Repositorio:` em `PROJETOS.md`, relativo ao `CONTEXT_PATH`.

---

## Como rodar o servidor

**Mac/Linux:**
```bash
# Matar processo anterior na porta 3000 (se houver)
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Subir o servidor
cd /Users/brunoscholze/Documents/GitHub/atlas/server
node index.js

# Verificar
curl http://localhost:3000/health   # deve retornar {"status":"ok"}
```

**Windows (PowerShell):**
```powershell
$procs = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -ne 0 }
foreach ($p in $procs) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }

Start-Process -FilePath "node" -ArgumentList "C:\azure\atlas\server\index.js" -WindowStyle Hidden

Start-Sleep -Seconds 2
Invoke-RestMethod "http://localhost:3000/health"
```

> **No dia a dia (Mac):** `cd .../atlas/server && node index.js` — deixe o terminal aberto.

---

## Fluxo completo de uma análise

1. Dev abre o Jira, clica no plugin → `content.js` extrai dados do ticket
2. Dev anexa o PDF do chamado (campo de observação é opcional, suporta `@caminho/arquivo.ts`)
3. Plugin envia `POST /analisar` (multipart com o PDF)
4. Servidor:
   - Salva PDF em `temp/`
   - Identifica o projeto via campo `projeto` e lê o `CLAUDE.md` + `Funcionalidades-*.md` corretos
   - Filtra as funcionalidades mais relevantes para o ticket (máx. 3 de N)
   - Extrai texto do PDF
   - Resolve `repoPath` do projeto (necessário para injeção de `@` menções)
   - Monta o prompt completo (injetando conteúdo de arquivos referenciados com `@`) e grava em `prompt_temp.txt`
   - Grava `debug.txt` com todos os parâmetros e o prompt
   - Detecta o SO e chama o script correto via `exec()`
5. Script de execução:
   - **Windows** (`run-claude.ps1`): força UTF-8, chama `cmd /c "claude --dangerously-skip-permissions --print < prompt_temp.txt"`, strip de BOM, grava `output.txt`
   - **Mac** (`run-claude.sh`): chama `claude --dangerously-skip-permissions --print < prompt_temp.txt`, grava `output.txt`
6. Servidor lê `output.txt`, remove BOM residual, atualiza `analises[requestId]` para `done`
7. Plugin faz polling `GET /analisar/status/:requestId` a cada 5s → exibe resultado

---

## Endpoints do servidor

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Status do servidor |
| GET | `/ping` | Alias de health |
| GET | `/projetos` | Lista projetos ativos (do PROJETOS.md) |
| GET | `/funcionalidades` | Lista funcionalidades do projeto |
| GET | `/arquivos?projeto=<slug>` | Lista arquivos do projeto para `@` menção |
| POST | `/analisar` | Inicia análise (multipart/form-data com pdf) |
| GET | `/analisar/status/:requestId` | Polling do status |
| POST | `/cancelar/:requestId` | Cancela análise em andamento |
| POST | `/refinar` | Refinamento (acompanhamento com contexto da análise anterior) |
| POST | `/limpar` | Esvazia output.txt |
| GET | `/log/:requestId` | Conteúdo do log da análise |
| GET | `/log/latest` | Atalho para agent.log |
| GET | `/download/output` | Download do output.txt |
| GET | `/download/log/latest` | Download do agent.log |
| **POST** | **`/feedback`** | **Salva feedback (resolved/unresolved/unresolved_refined)** |
| **GET** | **`/feedback/stats`** | **Agrega métricas de todos os feedbacks** |
| **GET** | **`/feedback/list`** | **Lista paginada de execuções com feedback** |
| **GET** | **`/dashboard/overview`** | **KPIs + gráficos para a página Overview** |
| **GET** | **`/dashboard/execucoes`** | **Lista paginada e filtrada de execuções** |
| **GET** | **`/dashboard/efetividade`** | **Métricas de resolução, refinamento, top funcionalidades/arquivos** |
| **GET** | **`/dashboard/*`** | **Serve o build React da Mesa de Controle** |

---

## Sistema de feedback

Quando o dev clica **✓ Resolvido!** ou responde ao modal de **← Início**, o plugin
envia `POST /feedback`. O servidor salva em `feedback/<projeto>/<ticketId>-<ts>.json`:

```json
{
  "ticketId": "ATLAS-123",
  "titulo": "Erro ao salvar OP",
  "projeto": "minha-totvs-prod",
  "funcionalidades": ["Criar OP", "Editar OP"],
  "arquivosAnalisados": ["src/app/...ts"],
  "observacao": "texto livre do dev",
  "tempoAnalise": 251,
  "timestamp": 1719600000,
  "status": "resolved"
}
```

**Status possíveis:** `resolved` | `unresolved` | `unresolved_refined`

**Endpoints para o dashboard:**
- `GET /feedback/stats` → `{ total, resolvidos, naoResolvidos, tempoMedio, porSemana[6], execucoes[100] }`
- `GET /feedback/list?page=1&limit=50` → `{ total, page, limit, execucoes[] }`

---

## Dashboard — Mesa de Controle (CONCLUÍDO)

Acessível em `http://localhost:3000/dashboard` — servido pelo Express via `express.static('dashboard/dist')`.

**3 páginas:**
- `/dashboard/overview` — KPI cards (total, taxa de resolução, tempo médio, tokens) + line chart 28 dias + donut de status + bar chart por projeto
- `/dashboard/execucoes` — tabela filtrada (busca, projeto, status, período) com paginação de 50/página
- `/dashboard/efetividade` — taxa de resolução por semana + donut de refinamento + top 10 funcionalidades/arquivos + tabela de refinamentos

**Como atualizar o build após mudanças:**
```bash
cd /Users/brunoscholze/Documents/GitHub/atlas/dashboard
npm run build
git add -f dist/
git commit -m "chore: rebuild dashboard"
```

**Como desenvolver com hot reload:**
```bash
cd dashboard && npm run dev   # → http://localhost:5173/dashboard (proxy para localhost:3000)
```

**Dados capturados por execução** (salvos em `execucoes/<projeto>/<ticketId>-<ts>.json`):
- requestId, ticketId, titulo, projeto, prioridade, tipo
- tempoAnalise (segundos), tokensEntrada, tokensSaida, tokensTotal (estimativa chars/4)
- funcionalidades[] (extraídas do output), arquivosAnalisados[]
- isRefinamento (bool), textoRefinamento (string|null)
- temPdf, temObservacao, observacao (primeiros 500 chars)
- statusFinal (done|no_subject|arquivo_ausente|error|cancelled), timestamp
- `analisouBack` (bool) — true se arquivosAnalisados contém algum `.p` ou `.iN`
- `problemaNoBack` (bool) — true se o DIFF_START do output aponta para arquivo `.p` ou `.iN`
- `arquivosAusentes` (string[]) — lista de caminhos marcados com `ARQUIVO_AUSENTE:` no output

**Regra de feedback na tabela de execuções:**
Feedback só é exibido se `feedback.timestamp > execucao.timestamp` — evita herdar feedback de sessões anteriores do mesmo ticket. Sem feedback = "Sem resposta" (cinza).

---

## Plugin Chrome — pontos importantes

- **Manifest V3** — usa `chrome.storage.local` para persistir `requestId` e `inicio`
  entre aberturas do popup (o popup fecha ao clicar fora)
- **content.js** roda na aba do Jira e extrai: ticketId, titulo, descricao, prioridade,
  tipo, responsavel, comentarios, historico
- **popup.js** tem quatro telas: `formulario`, `loading`, `resultado`, `erro`
- **Botões na tela resultado (3 botões):**
  - `← Início` — abre modal "Foi resolvido antes de sair?" → Sim/Não/Cancelar (salva feedback)
  - `Ainda não resolveu` — abre campo de refinamento
  - `✓ Resolvido!` — dispara confetti + salva feedback como `resolved` + reset após 2s
- **`@` menção de arquivo** — digitar `@` em qualquer textarea abre dropdown com arquivos do projeto;
  o servidor injeta o conteúdo do arquivo referenciado no prompt (máx 3 arquivos × 2000 chars)

---

## Renderização do resultado (popup.js)

**Modo estruturado** — quando o Claude segue o template com separadores `----------------------------------------`:
- `extrairSecao()` usa regex para capturar o conteúdo de cada seção
- Seções: LOCALIZAÇÃO DO PROBLEMA, CAUSA PROVÁVEL, COMO RESOLVER, ARQUIVOS ANALISADOS, OBSERVAÇÕES
- Cada seção é renderizada por `renderMarkdown()` (suporta bold, code, listas, diff)
- `renderSecao()` trata também blocos `DIFF_START/DIFF_END` (formato nativo do template do agente)

**Modo bruto** — fallback quando o Claude retorna markdown livre (sem separadores):
- Exibe o texto completo renderizado via `renderSecao()` (inclui suporte a `DIFF_START/DIFF_END`)
- Mostra aviso "O agente retornou a análise em formato livre"

**Blocos de código diff** têm botão `</>` para alternar entre modo claro e escuro.

---

## Decisões técnicas e por quê

### Por que dois scripts (PS1 e SH)?
`powershell` não existe no Mac. O `server/index.js` detecta o SO via `process.platform === 'win32'`
e chama o script correto.

### Por que pipe nativo no PS1 em vez de `cmd /c`? (Windows)
A cadeia `node → PowerShell → cmd.exe → claude.exe` (4 processos) era derrubada pelo Windows
com `STATUS_STACK_BUFFER_OVERRUN` (exit code `0xC0000409` / `-1073740791`). O Windows Defender
mata a cadeia quando o Job Object do node restringe criação de subprocessos aninhados.

Solução atual no `run-claude.ps1`:
```powershell
$promptContent = [System.IO.File]::ReadAllText($PromptFile, [System.Text.Encoding]::UTF8)
$result        = $promptContent | & claude --dangerously-skip-permissions --print
```
Pipe nativo do PowerShell — sem `cmd /c`, sem `chcp`, cadeia de 3 processos apenas.

### Por que `agent.log` único (sobrescrito) em vez de logs por execução?
Simplificação: um arquivo só para não acumular logs antigos.
Sobrescrito no início de cada análise via `fs.writeFileSync(logFile, '', 'utf8')`.

### Por que o Claude Code ignora o contexto git?
Claude Code injeta `git status` automaticamente ao rodar em um repositório git.
Não é possível suprimir isso via instruções. O prompt tem uma seção explícita
alertando o agente para ignorar completamente qualquer contexto git.

### Por que não pré-carregar os arquivos no prompt para ser mais rápido?
Testado e revertido. Ao incluir todos os arquivos das funcionalidades diretamente
no prompt (15 arquivos, ~118K chars), o tempo subiu de 323s para 449s.
O custo de processar um contexto de entrada muito grande supera o ganho
de eliminar as tool calls de leitura. O comportamento atual (323s, ~19K chars) é o ideal.

### Por que `repoPath` é resolvido antes de `montarPrompt()`?
A função `injetarArquivosReferenciados` precisa de `repoPath` para ler arquivos mencionados
com `@`. Por isso o IIFE de resolução de `repoPath` foi movido para antes de `montarPrompt()`,
e `dados.repoPath` é populado antes da chamada. O mesmo vale em `executarRefinamento`.

### Por que `canvas-confetti` é bundled localmente?
Chrome MV3 proíbe carregar scripts de CDNs externas em runtime.
O arquivo `plugin/vendor/confetti.js` é a build UMD do `canvas-confetti@1.9.2`.

---

## Problemas conhecidos e soluções

| Problema | Causa | Solução |
|----------|-------|---------|
| `powershell: command not found` no Mac | Mac não tem PowerShell nativo | `server/index.js` detecta SO e usa `run-claude.sh` |
| Texto garbled (`├í`) no output (Windows) | console em CP1252 | `chcp 65001` + `[Console]::OutputEncoding = UTF8` |
| BOM no início do output (Windows) | cmd + chcp 65001 injeta BOM | Strip de BOM em PS1 e no server |
| Claude aponta bugs baseado em git diff | Git status injetado automaticamente | Aviso explícito no prompt para ignorar contexto git |
| output.txt retorna resultado antigo | Script falhava silenciosamente | Botão "Limpar" chama `POST /limpar`; `/cancelar` mata processo |
| `DIFF_START/DIFF_END` aparecia como texto solto no refinamento | modo bruto usava `renderMarkdown` em vez de `renderSecao` | Corrigido em popup.js linha 628 |

---

## Tempo esperado de execução

**~323 segundos é normal.** O Claude precisa:
1. Ler o ticket completo (título, descrição, comentários, PDF)
2. Identificar as funcionalidades relevantes
3. Navegar e ler os arquivos do repositório via tool calls (~6 leituras × ~30s cada)
4. Analisar o fluxo html → ts → .p
5. Escrever a análise completa com diff

Análises simples: ~150-200s. Análises complexas: 5-6 minutos.

---

## Fontes de back-end Progress — como copiar e mapear

### Origem dos fontes

| Caminho | Status |
|---|---|
| `C:\azure\EMS2\progress\src` | ✅ Fonte limpa — usar sempre |
| `C:\fndlm` | ❌ Alterado localmente — não usar |

Os fontes copiados ficam em `C:\azure\atlas\repos\EMS2\progress\src` para o agente ler.

### Um script de cópia por funcionalidade

Cada funcionalidade tem seu próprio script em `scripts/`. Assim é possível atualizar os fontes de uma funcionalidade sem afetar as demais.

| Funcionalidade | Script |
|---|---|
| Criar OP | `scripts/copiar-fontes-criar-op.ps1` |
| Ver anexos | `scripts/copiar-fontes-ver-anexos.ps1` |
| Criar solicitação de serviço | `scripts/copiar-fontes-criar-solicitacao-servico.ps1` |

Para rodar: `! & "C:\azure\atlas\scripts\copiar-fontes-<nome>.ps1"`

### Como mapear uma nova funcionalidade de back

1. Descobrir o endpoint → identifica o arquivo de fachada REST (ex: `cpp\api\v1\productionMobile.p`)
2. Grep na fachada pela procedure que trata o endpoint
3. Ver se ela delega via `RUN <arquivo>.p PERSISTENT SET h-handle` → identificar o próximo arquivo
4. Grep nesse arquivo pela procedure intermediária
5. Ver se chama um terceiro arquivo → repetir até chegar na lógica de negócio
6. Anotar número de linha de cada procedure (o agente usa Grep + offset, economiza tokens)
7. Criar script de cópia com todos os arquivos identificados
8. Adicionar a funcionalidade no MD (`funcionalidades/Funcionalidades-App-minha-prod.md`) com caminhos e linhas

### Estrutura típica de chamada no EMS2

```
cpp\api\v1\productionMobile.p              ← fachada REST (roteia endpoint)
  └─ fch\fchman\fchmanproductionmobile.p   ← lógica intermediária (6000+ linhas)
       └─ fch\fchmip\fchmipservicerequest.p ← lógica de negócio final
```

**Arquivos grandes:** `fchmanproductionmobile.p` tem 6000+ linhas — sempre Grep primeiro para achar a linha da procedure, depois Read com offset. Anotar a linha no MD.

### Fluxo ARQUIVO_AUSENTE

Se o agente não encontra um fonte de back, escreve no output:
```
ARQUIVO_AUSENTE: caminho/relativo.p — procedure esperada e por que é necessária
```
O servidor detecta, muda status para `arquivo_ausente`, loga `FALTOU: <arquivo>`, e o plugin abre automaticamente a caixa de refinamento pedindo o arquivo ao usuário.

---

## Como atualizar a lista de funcionalidades

Edite `funcionalidades/Funcionalidades-App-minha-prod.md`. O servidor lê o arquivo a cada requisição — não precisa reiniciar.

Formato de cada entrada:
```markdown
## Nome da Funcionalidade
Descrição: o que essa funcionalidade faz

Arquivos front:
- src\caminho\do\arquivo.html
- src\caminho\do\arquivo.ts

Arquivos back:
- cpp\api\v1\fachada.p  — procedure `nomeProcedure` (linha N): o que faz → delega para X
- fch\fchman\arquivo-grande.p  — 6000+ linhas; procedure `REST_POST_X` (linha N): use Grep
- fch\modulo\arquivo-final.p  — procedure `Y` (linha N): lógica de negócio
```

Para adicionar um novo projeto, veja `docs/COMO-ADICIONAR-PROJETO.md`.

---

## Como recarregar o plugin Chrome após mudanças

1. Abrir `chrome://extensions`
2. Localizar o plugin do Atlas
3. Clicar no ícone de reload ou desativar e reativar
4. Fechar e reabrir o popup do plugin

---

## Onde ver os logs

```
logs/agent.log   ← log da última execução
debug.txt        ← todos os parâmetros + prompt completo
output.txt       ← resultado retornado pelo Claude
feedback/        ← JSONs de feedback por projeto/ticket
```

Ou via servidor:
- `http://localhost:3000/log/latest` — log em texto
- `http://localhost:3000/download/output` — download do output
- `http://localhost:3000/feedback/stats` — métricas agregadas
- `http://localhost:3000/feedback/list` — lista de execuções paginada
- `http://localhost:3000/dashboard` — Mesa de Controle (React app)
