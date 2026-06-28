# DEV-CONTEXT.md — Atlas: Plugin de Chamados Minha Totvs Prod

> Leia este arquivo no início de qualquer sessão de desenvolvimento neste repositório.
> Ele contém o contexto completo do projeto, decisões técnicas e armadilhas conhecidas.

---

## O que é este projeto

Um sistema de análise automática de chamados Jira para o app **Minha Totvs Prod**.
O dev abre um ticket no Jira, clica no plugin, anexa o PDF do chamado,
e o sistema aciona o Claude Code para investigar o código e retornar onde está o bug.

**Três componentes:**
1. **Plugin Chrome** (`plugin/`) — interface do dev no Jira
2. **Servidor Node.js** (`server/`) — orquestra tudo, recebe o upload do PDF, chama o script
3. **Script de execução** (`scripts/`) — executa `claude --print` e grava o resultado
   - Windows: `run-claude.ps1`
   - Mac/Linux: `run-claude.sh`

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
│   ├── index.js          ← servidor Express principal
│   ├── .env              ← variáveis de ambiente (não comitar)
│   └── node_modules/
├── plugin/
│   ├── popup.html        ← UI da extensão
│   ├── popup.js          ← lógica do popup
│   ├── popup.css         ← estilos
│   ├── content.js        ← extrai dados do Jira (roda na aba)
│   └── manifest.json     ← manifesto da extensão (MV3)
├── scripts/
│   ├── run-claude.ps1    ← executa claude --print no Windows
│   └── run-claude.sh     ← executa claude --print no Mac/Linux
├── docs/
│   ├── DEV-CONTEXT.md    ← este arquivo
│   ├── COMO-ADICIONAR-PROJETO.md
│   └── COMO-RODAR.md
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

Start-Process -FilePath "node" -ArgumentList "index.js" `
  -WorkingDirectory "C:\azure\atlas\server" -WindowStyle Hidden

Start-Sleep -Seconds 2
curl.exe -s http://localhost:3000/health
```

> **No dia a dia (Mac):** `cd .../atlas/server && node index.js` — deixe o terminal aberto.

---

## Fluxo completo de uma análise

1. Dev abre o Jira, clica no plugin → `content.js` extrai dados do ticket
2. Dev anexa o PDF do chamado (campo de observação é opcional)
3. Plugin envia `POST /analisar` (multipart com o PDF)
4. Servidor:
   - Salva PDF em `temp/`
   - Identifica o projeto via campo `projeto` e lê o `CLAUDE.md` + `Funcionalidades-*.md` corretos
   - Filtra as funcionalidades mais relevantes para o ticket (máx. 3 de N)
   - Extrai texto do PDF
   - Monta o prompt completo e grava em `prompt_temp.txt`
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
| GET | `/projetos` | Lista projetos ativos (do PROJETOS.md) |
| GET | `/funcionalidades` | Lista funcionalidades (do Funcionalidades.md genérico) |
| POST | `/analisar` | Inicia análise (multipart/form-data com pdf) |
| GET | `/analisar/status/:requestId` | Polling do status |
| POST | `/cancelar/:requestId` | Cancela análise em andamento |
| POST | `/limpar` | Esvazia output.txt |
| GET | `/log/:requestId` | Conteúdo do log da análise |
| GET | `/log/latest` | Atalho para agent.log |
| GET | `/download/output` | Download do output.txt |
| GET | `/download/log/latest` | Download do agent.log |

---

## Plugin Chrome — pontos importantes

- **Manifest V3** — usa `chrome.storage.local` para persistir `requestId` e `inicio`
  entre aberturas do popup (o popup fecha ao clicar fora)
- **content.js** roda na aba do Jira e extrai: ticketId, titulo, descricao, prioridade,
  tipo, responsavel, comentarios, historico
- **popup.js** tem quatro telas: `formulario`, `loading`, `resultado`, `erro`
- Ao clicar "Limpar" (`btnNovaAnalise`), chama `POST /limpar` para zerar output.txt
  (evita retornar resultado antigo se o Claude falhar silenciosamente)
- Botão **Cancelar** na tela de loading: chama `POST /cancelar/:requestId` e volta ao formulário
- `currentRequestId` é variável global em popup.js para permitir o cancelamento

---

## Renderização do resultado (popup.js)

**Modo estruturado** — quando o Claude segue o template com separadores `----------------------------------------`:
- `extrairSecao()` usa regex para capturar o conteúdo de cada seção
- Seções: LOCALIZAÇÃO DO PROBLEMA, CAUSA PROVÁVEL, COMO RESOLVER, ARQUIVOS ANALISADOS, OBSERVAÇÕES
- Cada seção é renderizada por `renderMarkdown()` (suporta bold, code, listas, diff)

**Modo bruto** — fallback quando o Claude retorna markdown livre (sem separadores):
- Exibe o texto completo renderizado como markdown
- Mostra aviso "O agente retornou a análise em formato livre"

**Blocos de código diff** têm botão `</>` para alternar entre modo claro e escuro.

---

## Decisões técnicas e por quê

### Por que dois scripts (PS1 e SH)?
`powershell` não existe no Mac. O `server/index.js` detecta o SO via `process.platform === 'win32'`
e chama o script correto. No Windows, o PS1 usa `cmd /c` para redirecionamento confiável de stdin.
No Mac, o bash faz `claude --print < arquivo` diretamente.

### Por que `cmd /c "claude ... < arquivo"` em vez de pipe PowerShell? (Windows)
PowerShell 5.1 não redireciona stdin para executáveis nativos de forma confiável.
`$prompt | & claude` gerava: `Error: Input must be provided either through stdin...`.
A solução foi usar cmd.exe que tem redirecionamento de stdin nativo.

### Por que `chcp 65001` antes de chamar o Claude? (Windows)
O console Windows usa CP1252 por padrão. Sem `chcp 65001`, caracteres UTF-8 do Claude
(como `á`, `ç`, `ã`) chegam corrompidos no PowerShell.

### Por que strip de BOM em dois lugares (PS1 e server)? (Windows)
O `chcp 65001` no cmd às vezes injeta um BOM (U+FEFF) no início do stdout.
O PS1 faz o strip antes de gravar, o servidor faz o strip ao ler — defesa dupla.

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

---

## Problemas conhecidos e soluções

| Problema | Causa | Solução |
|----------|-------|---------|
| `powershell: command not found` no Mac | Mac não tem PowerShell nativo | `server/index.js` detecta SO e usa `run-claude.sh` |
| Texto garbled (`├í`) no output (Windows) | console em CP1252 | `chcp 65001` + `[Console]::OutputEncoding = UTF8` |
| BOM no início do output (Windows) | cmd + chcp 65001 injeta BOM | Strip de BOM em PS1 e no server |
| Claude aponta bugs baseado em git diff | Git status injetado automaticamente | Aviso explícito no prompt para ignorar contexto git |
| output.txt retorna resultado antigo | Script falhava silenciosamente | Botão "Limpar" chama `POST /limpar`; `/cancelar` mata processo |
| PS1 path errado | `path.resolve(CONTEXT_PATH, '..', 'scripts')` | Corrigido para `path.join(CONTEXT_PATH, 'scripts')` |

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

## Como atualizar a lista de funcionalidades

Edite `Funcionalidades-App-minha-prod.md`. O servidor lê o arquivo a cada requisição — não precisa reiniciar.

Formato de cada entrada:
```markdown
## Nome da Funcionalidade
Descrição: o que essa funcionalidade faz
Arquivos suspeitos:
- src\caminho\do\arquivo.html
- src\caminho\do\arquivo.ts
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
```

Ou via servidor:
- `http://localhost:3000/log/latest` — log em texto
- `http://localhost:3000/download/output` — download do output
