# DEV-CONTEXT.md — App-Bot: Plugin de Chamados Minha Totvs Prod

> Leia este arquivo no início de qualquer sessão de desenvolvimento neste repositório.
> Ele contém o contexto completo do projeto, decisões técnicas e armadilhas conhecidas.

---

## O que é este projeto

Um sistema de análise automática de chamados Jira para o app **Minha Totvs Prod**.
O dev seleciona no plugin quais funcionalidades apresentam problema, anexa o PDF do Jira
e o sistema aciona o Claude Code para investigar o código e retornar onde está o bug.

**Três componentes:**
1. **Plugin Chrome** (`plugin/`) — interface do dev no Jira
2. **Servidor Node.js** (`server/`) — orquestra tudo, recebe o upload do PDF, chama o PS1
3. **Script PowerShell** (`scripts/run-claude.ps1`) — executa `claude --print` e grava o resultado

**Um arquivo de instruções para o Claude (o agente de análise):**
- `CLAUDE.md` — instruções do agente de análise de chamados (NÃO é para desenvolvimento do plugin)
- `Funcionalidades.md` — mapa de funcionalidades → arquivos suspeitos do app

---

## Estrutura de pastas

```
C:\azure\app-bot\
├── server\
│   ├── index.js          ← servidor Express principal
│   ├── .env              ← variáveis de ambiente (não comitar)
│   └── node_modules\
├── plugin\
│   ├── popup.html        ← UI da extensão
│   ├── popup.js          ← lógica do popup
│   ├── popup.css         ← estilos
│   ├── content.js        ← extrai dados do Jira (roda na aba)
│   └── manifest.json     ← manifesto da extensão (MV3)
├── scripts\
│   └── run-claude.ps1    ← chama claude --print, grava output.txt
├── logs\
│   └── agent.log         ← log único, sobrescrito a cada execução
├── CLAUDE.md             ← instruções do AGENTE DE ANÁLISE (não alterar levianamente)
├── Funcionalidades.md    ← mapa funcionalidade → arquivos do app
├── DEV-CONTEXT.md        ← este arquivo
├── output.txt            ← resultado da última análise (gerado pelo PS1)
├── debug.txt             ← parâmetros + prompt completo da última execução
└── prompt_temp.txt       ← prompt temporário (apagado após execução)
```

**Repositório do app analisado:** `C:\azure\app-bot\app-minha-producao\`
(anteriormente chamado `app-minha-producao`, renomeado para ficar dentro de app-bot)

---

## Variáveis de ambiente — server\.env

```
PORT=3000
CONTEXT_PATH=C:\azure\app-bot
OUTPUT_PATH=C:\azure\app-bot\output.txt
REPO_PATH=C:\azure\app-bot\app-minha-producao
TEMP_PATH=C:\azure\app-bot\temp
```

---

## Como rodar o servidor

```powershell
# Matar processo anterior na porta 3000 (se houver)
$procs = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -ne 0 }
foreach ($p in $procs) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }

# Subir o servidor em background sem janela
Start-Process -FilePath "node" -ArgumentList "index.js" `
  -WorkingDirectory "C:\azure\app-bot\server" -WindowStyle Hidden

# Verificar se subiu
Start-Sleep -Seconds 2
curl.exe -s http://localhost:3000/health   # deve retornar {"status":"ok"}
```

---

## Fluxo completo de uma análise

1. Dev abre o Jira, clica no plugin → `content.js` extrai dados do ticket
2. Dev seleciona funcionalidades afetadas e anexa o PDF do chamado
3. Plugin envia `POST /analisar` (multipart com o PDF)
4. Servidor:
   - Salva PDF em `temp/`
   - Lê `CLAUDE.md` + `Funcionalidades.md`
   - Monta o prompt completo e grava em `prompt_temp.txt`
   - Grava `debug.txt` com todos os parâmetros e o prompt
   - Chama o PS1 via `exec()` e guarda o `childProcess` (para permitir cancelamento)
5. `run-claude.ps1`:
   - Força UTF-8 (`chcp 65001`, `[Console]::OutputEncoding = UTF8`)
   - Executa: `cmd /c "chcp 65001 > nul 2>&1 & claude --dangerously-skip-permissions --print < prompt_temp.txt"`
   - Strip de BOM no resultado (U+FEFF = char 65279)
   - Grava em `output.txt` com UTF-8 sem BOM
6. Servidor lê `output.txt`, remove BOM residual, atualiza `analises[requestId]` para `done`
7. Plugin faz polling `GET /analisar/status/:requestId` a cada 5s → exibe resultado

---

## Endpoints do servidor

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Status do servidor |
| GET | `/funcionalidades` | Lista de funcionalidades (do Funcionalidades.md) |
| POST | `/analisar` | Inicia análise (multipart/form-data com pdf) |
| GET | `/analisar/status/:requestId` | Polling do status |
| POST | `/cancelar/:requestId` | Cancela análise em andamento (taskkill /T /F) |
| POST | `/limpar` | Esvazia output.txt (chamado ao resetar o formulário) |
| GET | `/log/:requestId` | Conteúdo do log da análise |
| GET | `/log/latest` | Atalho para agent.log |
| GET | `/download/output` | Download do output.txt como arquivo |
| GET | `/download/log/latest` | Download do agent.log como arquivo |

---

## Plugin Chrome — pontos importantes

- **Manifest V3** — usa `chrome.storage.local` para persistir `requestId` e `inicio`
  entre aberturas do popup (o popup fecha ao clicar fora)
- **content.js** roda na aba do Jira e extrai: ticketId, titulo, descricao, prioridade,
  tipo, responsavel, comentarios, historico
- **popup.js** tem três telas: `formulario`, `loading`, `resultado`, `erro`
- Ao clicar "Limpar" (`btnNovaAnalise`), chama `POST /limpar` para zerar output.txt
  (evita retornar resultado antigo se o Claude falhar silenciosamente)
- Botão **Cancelar** na tela de loading: chama `POST /cancelar/:requestId` e volta ao formulário
- `currentRequestId` é variável global em popup.js para permitir o cancelamento

---

## Renderização do resultado (popup.js)

O resultado é exibido de duas formas:

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

### Por que `cmd /c "claude ... < arquivo"` em vez de pipe PowerShell?
PowerShell 5.1 não redireciona stdin para executáveis nativos de forma confiável.
`$prompt | & claude` gerava: `Error: Input must be provided either through stdin...`.
A solução foi usar cmd.exe que tem redirecionamento de stdin nativo.

### Por que `chcp 65001` antes de chamar o Claude?
O console Windows usa CP1252 por padrão. Sem `chcp 65001`, caracteres UTF-8 do Claude
(como `á`, `ç`, `ã`) chegam corrompidos no PowerShell (`├í`, `├º├úo`).

### Por que strip de BOM em dois lugares (PS1 e server)?
O `chcp 65001` no cmd às vezes injeta um BOM (U+FEFF = `﻿`) no início do stdout.
O PS1 faz o strip antes de gravar, o servidor faz o strip ao ler — defesa dupla.

### Por que `taskkill /PID $pid /T /F` no cancelamento?
O processo pai do Node é o PowerShell. O PowerShell chama `cmd.exe` que chama `claude`.
Matar só o processo pai deixa o Claude rodando em background.
`/T` mata a árvore inteira; `/F` força o encerramento.

### Por que `-WindowStyle Hidden` no PowerShell?
Sem isso, uma janela CMD piscava durante cada análise. `-WindowStyle Hidden` executa
o PowerShell em background sem nenhuma janela visível.

### Por que `agent.log` único (sobrescrito) em vez de logs por execução?
Simplificação pedida pelo dev — um arquivo só para não acumular logs antigos.
Sobrescrito no início de cada análise via `fs.writeFileSync(logFile, '', 'utf8')`.

### Por que o CLAUDE.md do app-minha-producao foi criado?
Claude Code, ao rodar no diretório `app-minha-producao`, injeta o CLAUDE.md automaticamente
como contexto. Isso garante que o agente receba as instruções mesmo sem estar no prompt.
**Nota:** o Claude Code também injeta `git status` automaticamente como contexto de sistema —
não é possível suprimir isso via instruções. O prompt tem uma seção alertando o agente
para ignorar o contexto git.

---

## Problemas conhecidos e soluções

| Problema | Causa | Solução |
|----------|-------|---------|
| Texto garbled (`├í`) no output | console em CP1252 | `chcp 65001` + `[Console]::OutputEncoding = UTF8` |
| BOM (`﻿`) no início do output | cmd + chcp 65001 injeta BOM | Strip de BOM em PS1 e no server |
| Claude aponta bugs baseado em git diff | Git status é injetado automaticamente pelo harness do Claude Code | Aviso explícito no prompt para ignorar contexto git |
| "sem" interpretado como comando PS | Parênteses em string de log | Removidos os parênteses das strings de log no PS1 |
| `.Trim()` em null | `Where-Object` retorna null quando não encontra linha | Guard `if ($var) { $var.Trim() } else { '' }` |
| output.txt retorna resultado antigo | PS1 falhava silenciosamente, output antigo era lido | Botão "Limpar" chama `POST /limpar`; `/cancelar` mata processo |
| PS1 path errado (`C:\azure\scripts\`) | `path.resolve(CONTEXT_PATH, '..', 'scripts')` | Corrigido para `path.join(CONTEXT_PATH, 'scripts')` |

---

## Tempo esperado de execução

**142 segundos é normal.** O Claude precisa:
1. Parsear o PDF do chamado
2. Ler o CLAUDE.md + Funcionalidades.md
3. Navegar pelos arquivos do repositório do app
4. Analisar o fluxo html → ts → .p
5. Escrever a análise completa

Análises simples: ~60-90s. Análises complexas: 2-3 minutos.

---

## Como atualizar a lista de funcionalidades

Edite `Funcionalidades.md`. O servidor lê o arquivo a cada requisição — não precisa reiniciar.
O plugin carrega a lista via `GET /funcionalidades` ao abrir o popup.

Formato de cada entrada:
```markdown
## Nome da Funcionalidade
Descrição: o que essa funcionalidade faz
Arquivos suspeitos:
- src\caminho\do\arquivo.html
- src\caminho\do\arquivo.ts
- src\caminho\do\arquivo.scss
```

---

## Como recarregar o plugin Chrome após mudanças

1. Abrir `chrome://extensions`
2. Localizar "Agente de Chamados"
3. Clicar no ícone de reload (🔄) ou desativar e reativar
4. Fechar e reabrir o popup do plugin

---

## Onde ver os logs em tempo real

```
C:\azure\app-bot\logs\agent.log   ← log da última execução
C:\azure\app-bot\debug.txt        ← todos os parâmetros + prompt completo
C:\azure\app-bot\output.txt       ← resultado retornado pelo Claude
```

Ou via servidor:
- `http://localhost:3000/log/latest` — log em texto
- `http://localhost:3000/download/output` — download do output
