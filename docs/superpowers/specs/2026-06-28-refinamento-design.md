# Design: Refinamento de Análise ("Ainda não resolveu")

**Data:** 2026-06-28
**Status:** Aprovado para implementação

---

## Problema

Quando o dev aplica o diff sugerido e o bug persiste, ele precisa recomeçar do zero: preencher o formulário, reenviar o PDF, aguardar 300s de análise completa. Todo o contexto que o Claude tinha (arquivos lidos, raciocínio, diff gerado) é perdido.

## Solução

Adicionar um botão **"Ainda não resolveu"** na tela de resultado. O dev descreve o que ainda não funcionou num campo inline e reenvia. O servidor chama Claude com `--continue`, que retoma a conversa anterior — Claude já tem todos os arquivos em contexto e responde em ~30-60s sem releitura de código.

---

## Fluxo

```
Tela Resultado
  [Voltar para o início]   [Ainda não resolveu]

  → clica "Ainda não resolveu"
  → textarea aparece inline acima dos botões
  → digita "Apliquei o diff mas o campo ainda vem vazio porque..."
  → clica [Reenviar análise]
  → tela Loading (mesma de hoje)
  → tela Resultado com análise refinada
```

---

## Componentes

### 1. `plugin/popup.html`
- Renomear botão `btnNovaAnalise` de "Limpar" para "Voltar para o início"
- Adicionar no `resultado-actions`:
  - Botão `btnAindaNaoResolveu` — "Ainda não resolveu"
  - `div#refinamentoWrap` (oculto por padrão): textarea + botão "Reenviar análise"

### 2. `plugin/popup.css`
- Estilo para `#refinamentoWrap`: padding, borda sutil, transição de aparecimento
- Reutiliza `.s2-textarea` para o campo de texto

### 3. `plugin/popup.js`

**Botão "Ainda não resolveu":** mostra `#refinamentoWrap`

**Botão "Reenviar análise":**
- Lê texto da textarea
- POST `/refinar` com `{ refinamento: texto, projeto }`
- Transita para tela Loading
- Inicia polling igual ao fluxo atual

**Polling:** adicionar case `session_expired` → `mostrarErro('Sessão expirada. Faça uma nova análise completa.')` e botão Voltar para o início.

### 4. `server/index.js`

Novo endpoint `POST /refinar`:
```js
app.post('/refinar', (req, res) => {
  const { refinamento, projeto } = req.body;
  const requestId = crypto.randomUUID();
  analises[requestId] = { status: 'running', ... };
  res.json({ sucesso: true, requestId });
  executarRefinamento(requestId, refinamento, projeto, logFile);
});
```

`executarRefinamento()`: escreve o texto do usuário em `refinamento_temp.txt`, chama `run-claude.sh` com parâmetro extra `continue`. Ao terminar, deleta `refinamento_temp.txt` e detecta se output tem conteúdo:
- Com conteúdo → `status: 'done'`
- Vazio ou exit ≠ 0 → `status: 'session_expired'`

### 5. `scripts/run-claude.sh`

Novo parâmetro `$5` opcional (modo):
```bash
MODO="${5:-}"
if [ "$MODO" = "continue" ]; then
  RESULT=$(claude --dangerously-skip-permissions --print --continue < "$PROMPT_FILE")
else
  RESULT=$(claude --dangerously-skip-permissions --print < "$PROMPT_FILE")
fi
```

---

## O que o Claude recebe no refinamento

Apenas o texto digitado pelo usuário, sem formatação extra. Claude já tem em contexto:
- O ticket original
- Os arquivos lidos
- O diff que sugeriu

O texto puro é suficiente para continuar a conversa.

---

## Tratamento de erros

| Situação | Status retornado | O que o plugin mostra |
|---|---|---|
| Sessão expirada | `session_expired` | "Sessão expirada. Faça uma nova análise." |
| Output vazio | `session_expired` | Idem |
| Erro genérico | `error` | Mensagem de erro padrão (já existe) |

Sem fallback automático para análise completa — o usuário decide.

---

## Limitação conhecida: multi-usuário

`--continue` retoma a conversa mais recente globalmente. Com múltiplos usuários simultâneos, um refinamento pode pegar a conversa do usuário errado.

**Mitigação futura:** capturar o session ID do primeiro run e usar `--resume <id>` em vez de `--continue`. Mudança cirúrgica quando o sistema virar multi-usuário. Por ora (uso local, single-user), `--continue` é seguro.

---

## O que NÃO muda

- `CLAUDE.md` — sem alterações
- Prompt template — sem alterações
- Polling (`GET /analisar/status/:requestId`) — reutilizado sem mudanças
- Renderização do resultado — reutilizada sem mudanças
- `run-claude.ps1` (Windows) — sem alterações nesta versão
