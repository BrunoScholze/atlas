# DEV-CONTENT.MD — Contexto completo do projeto Atlas Code

Leia este arquivo no início de cada conversa para entender o estado atual do projeto.

---

## O que é o Atlas Code

Extensão Chrome (Manifest V3) que analisa chamados do Jira e localiza bugs no código do app **Minha Totvs Prod**. O usuário abre um ticket no Jira, clica no ícone da extensão, seleciona o projeto, descreve o problema (ou anexa o PDF exportado do Jira), e o agente Claude Code analisa o código e retorna onde está o bug e como corrigir.

---

## Estrutura de pastas

```
C:\azure\atlas\
├── plugin\                    ← Extensão Chrome (carregar aqui no chrome://extensions)
│   ├── manifest.json          ← MV3, nome "Atlas Code", ícone icon.png
│   ├── popup.html             ← Duas telas + loading + resultado + erro
│   ├── popup.css              ← Dual-theme (dark/light), diff sempre branco
│   ├── popup.js               ← Toda a lógica da extensão
│   ├── content.js             ← Injeta no Jira para capturar dados do ticket
│   ├── icon.png               ← Ícone da extensão (toolbar do Chrome)
│   ├── logobranco.png         ← Logo para tema dark (copiado de /icon/)
│   ├── logoPreto.png          ← Logo para tema light (copiado de /icon/)
│   └── logoextensao.png       ← Logo alternativo (não usado como ícone principal)
│
├── server\
│   ├── index.js               ← Servidor Express/Node (porta 3000)
│   └── .env                   ← Variáveis de ambiente (CONTEXT_PATH, OUTPUT_PATH, etc.)
│
├── icon\
│   ├── icon.png               ← Ícone original
│   ├── logobranco.png         ← Logo branco (dark mode)
│   └── logoPreto.png          ← Logo preto (light mode)
│
├── scripts\
│   └── run-claude.ps1         ← Script PowerShell que executa claude --print
│
├── logs\
│   └── agent.log              ← Log da execução mais recente (sobrescrito a cada análise)
│
├── CLAUDE.md                        ← Instruções do agente (quem é, template de output, regras)
├── PROJETOS.md                      ← Lista de projetos ativos com slug, nome, CLAUDE.md, Funcionalidades e status
├── Funcionalidades-App-minha-prod.md ← Mapa de funcionalidades do APP Minha Prod
├── output.txt                       ← Saída mais recente do Claude (lida pelo plugin via polling)
├── debug.txt                  ← Debug da última execução (prompt completo + parâmetros)
└── DEV-CONTENT.md             ← Este arquivo
```

---

## Repositório do app analisado

```
C:\azure\atlas\app-minha-producao\   ← Repositório Angular/Ionic do app Minha Totvs Prod
```

O agente Claude Code lê os arquivos deste repositório durante a análise.

---

## Servidor Node

**Arquivo:** `server/index.js`  
**Porta:** 3000  
**Iniciar:** `node C:\azure\atlas\server\index.js`  
**Parar:** matar o processo node (Get-Process node | Stop-Process)

### Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Status do servidor (`{"status":"ok"}`) |
| GET | `/projetos` | Lista projetos ativos do PROJETOS.md |
| GET | `/funcionalidades` | Lista funcionalidades do Funcionalidades.md |
| POST | `/analisar` | Inicia análise (recebe multipart: ticketId, titulo, descricao, prioridade, tipo, responsavel, comentarios, historico, observacao, projeto, pdf) |
| GET | `/analisar/status/:requestId` | Polling — retorna `{status, analise?, erro?}` |
| POST | `/cancelar/:requestId` | Cancela análise em andamento |
| POST | `/limpar` | Limpa output.txt |
| GET | `/download/output` | Download do output.txt como .txt |
| GET | `/download/log/latest` | Download do agent.log |

### Variáveis de ambiente (.env)

```env
PORT=3000
CONTEXT_PATH=C:\azure\atlas
OUTPUT_PATH=C:\azure\atlas\output.txt
REPO_PATH=C:\azure\atlas\app-minha-producao
TEMP_PATH=C:\azure\atlas\temp
```

**IMPORTANTE:** O dotenv usa `path.join(__dirname, '.env')` — o .env deve estar em `server/.env`.

### Fluxo de análise (server/index.js)

1. POST `/analisar` recebe os dados e o PDF (opcional)
2. Lê `PROJETOS.md` → encontra o `CLAUDE.md` e o arquivo `Funcionalidades` corretos para o slug
3. Lê o arquivo de funcionalidades do projeto (ex: `Funcionalidades-App-minha-prod.md`) direto, sem filtro
4. Monta o prompt em `montarPrompt()` e salva em `prompt_temp.txt`
5. Executa `run-claude.ps1` via PowerShell com os argumentos de caminho
6. Polling aguarda o PS1 terminar; lê `output.txt`
7. Após leitura, **extrai e loga** as seções FUNCIONALIDADES IDENTIFICADAS e ARQUIVOS ANALISADOS do output
8. Salva resultado em memória (`analises[requestId]`)
9. Cliente faz polling em `/analisar/status/:requestId` a cada 5 segundos

---

## Extensão Chrome

### Fluxo de telas

```
Tela 1 (telaSelecao)
  → usuário seleciona projeto → clica Iniciar
Tela 2 (telaFormulario)
  → campo ticket (preenchido automaticamente pelo content.js)
  → dropzone PDF (opcional)
  → textarea descrição (sempre visível, obrigatória se sem PDF)
  → botão "Iniciar análise" → POST /analisar → Tela Loading
Tela Loading
  → polling a cada 5s em /analisar/status/:requestId
  → timer crescente + etapas de progresso
Tela Resultado
  → seções estruturadas: Funcionalidades, Localização, Causa, Como Resolver, Arquivos, Observações
  → diff renderizado com cores GitHub light (fixas, não mudam com o tema)
  → toggle </> para alternar para modo escuro no bloco de código
Tela Erro
  → mensagem + botão "Tentar novamente"
```

### Tema dark/light

- Controlado por `data-theme="dark|light"` no `<html>`
- CSS custom properties em `:root` (dark) e `[data-theme="light"]`
- Toggle no canto superior direito (position: fixed, z-index: 9999)
- Logo troca: dark → `logobranco.png`, light → `logoPreto.png`
- **Diff blocks sempre usam cores GitHub light** (hardcoded, não afetados pelo tema)

### Cores dark theme

```
--bg:        #444444
--surface:   #3A3A3A
--border:    #555555
--border2:   #636363
--text:      #F0F0F0
--muted:     #555555
--muted2:    #888888
--accent:    #FFFFFF
```

### Cores light theme

```
--bg:        #F7F7F7
--surface:   #FFFFFF
--border:    #E0E0E0
--border2:   #CCCCCC
--text:      #111111
--muted:     #AAAAAA
--muted2:    #666666
--accent:    #111111
```

### CSP (Content Security Policy — MV3)

Nenhum `onclick`, `ondragover` ou outro handler inline no HTML. **Todos os eventos** são registrados em `configurarEventos()` via `addEventListener`. Qualquer handler inline quebra o MV3.

---

## Multi-projeto

### PROJETOS.md

```markdown
# PROJETOS

## app-minha-prod
Nome: APP Minha Prod
Descrição: Aplicativo mobile Ionic/Angular — Minha Totvs Prod
CLAUDE: CLAUDE.md
Funcionalidades: Funcionalidades-App-minha-prod.md
Azure: https://dev.azure.com/totvstfs/Linha-Datasul-Mobile/_git/app-minha-producao
Status: ativo
```

- Cada `## slug` é um projeto
- `CLAUDE:` aponta para o arquivo de instruções do agente para esse projeto
- `Funcionalidades:` aponta para o arquivo de funcionalidades exclusivo do projeto
- `Azure:` base URL do repositório no Azure DevOps (usada para gerar links de arquivos)
- `Status: ativo` — só projetos ativos aparecem no dropdown

### Arquivo de funcionalidades por projeto

Cada projeto tem seu próprio arquivo (ex: `Funcionalidades-App-minha-prod.md`).
Não há mais tags `[slug]` nas seções — o arquivo já é exclusivo do projeto.

```markdown
## Login
Descrição: Tela de autenticação do app.
Arquivos suspeitos:
- src\app\shared\pages\login\login.page.html
- src\app\shared\pages\login\login.page.ts
```

O servidor lê o arquivo direto, sem filtro. O agente recebe apenas as funcionalidades do projeto selecionado.

### Adicionar novo projeto

1. Adicionar bloco em `PROJETOS.md` com `CLAUDE:`, `Funcionalidades:`, `Azure:` e `Status: ativo`
2. Criar `CLAUDE-novo-projeto.md` (ou apontar para o mesmo CLAUDE.md)
3. Criar `Funcionalidades-Novo-Projeto.md` com as seções do projeto
4. Reiniciar o servidor

---

## Renderização de resultado (popup.js)

O output do Claude é parseado em `renderizarResultado()`:

1. `normalizarOutput()` — remove BOM e cabeçalhos `====`
2. `extrairSecao()` — extrai cada seção pelo separador `---`
3. `renderSecao()` — detecta blocos `DIFF_START / DIFF_END` e renderiza visualmente
4. `renderMarkdown()` — converte markdown básico (headers, listas, bold, inline code, code blocks)

### Formato DIFF_START/DIFF_END (gerado pelo Claude)

```
DIFF_START arquivo: src/app/componente/arquivo.html
- linha que deve ser REMOVIDA
+ linha que deve ser ADICIONADA
DIFF_END
```

O plugin converte isso num container visual com header (nome do arquivo), linhas verdes/vermelhas e botão `</>` para alternar tema escuro.

---

## Checklist para iniciar uma conversa sobre este projeto

- [ ] Ler este arquivo completo
- [ ] Verificar se o servidor está rodando: `curl http://localhost:3000/health`
- [ ] Verificar se a extensão está carregada em `chrome://extensions`
- [ ] Lembrar: **nunca editar CLAUDE.md sem intenção** — é o prompt do agente
- [ ] Lembrar: **nunca usar onclick inline no HTML** (CSP do MV3 bloqueia)
- [ ] Para adicionar funcionalidade ao plugin: editar popup.html + popup.css + popup.js em conjunto
- [ ] Para mudar comportamento da análise: editar server/index.js e/ou CLAUDE.md

---

## Histórico de features implementadas

| Feature | Onde |
|---------|------|
| Dual-theme dark/light com toggle | popup.css + popup.js `toggleTheme()` |
| Duas telas (seleção + formulário) | popup.html + popup.js `mostrarTela()` |
| Multi-projeto via PROJETOS.md | server/index.js `parseProjetos()` + `/projetos` endpoint |
| Arquivo de funcionalidades por projeto | PROJETOS.md campo `Funcionalidades:` + arquivo dedicado por projeto |
| Diff sempre branco (GitHub light) | popup.css seção DIFF (cores hardcoded) |
| Log de funcionalidades e arquivos | server/index.js após leitura do output.txt |
| CSP-safe (sem inline handlers) | popup.html + popup.js `configurarEventos()` |
| Logo troca com tema | popup.js `toggleTheme()` → troca img.src |
| Border radius na janela | popup.css `html, body { border-radius: 12px }` |
| Ícone toolbar: icon.png | manifest.json `"default_icon": { "16": "icon.png" ... }` |
| Download análise + log | popup.js + endpoints `/download/output` e `/download/log/latest` |
| Polling com timer e etapas | popup.js `iniciarPolling()` + `ETAPAS[]` |
| Cancelar análise | popup.js `cancelarAnalise()` + POST `/cancelar/:requestId` |
| Persistência entre fechamentos | `chrome.storage.local` → `requestId`, `inicio`, `resultado` |
