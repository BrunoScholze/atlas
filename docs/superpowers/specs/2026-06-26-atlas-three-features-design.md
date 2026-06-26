# Design — Atlas Code: Três features (2026-06-26)

## Escopo

Três melhorias independentes no Atlas Code:
1. Repositório local por projeto em PROJETOS.md
2. ARQUIVOS ANALISADOS em formato de árvore/escadinha
3. Botão copiar nome do arquivo no header do diff

---

## Feature 1 — Repositório por projeto

### Problema
O servidor usa `REPO_PATH` fixo no `.env`, o que impede suporte a múltiplos projetos com repositórios em locais diferentes.

### Solução
- Criar pasta `C:\azure\atlas\repos\` e mover `app-minha-producao` para dentro.
- Adicionar campo `Repositorio: repos/app-minha-producao` ao bloco do projeto em `PROJETOS.md`.
- `parseProjetos()` em `server/index.js` extrai o campo `repositorio`.
- Em `executarAnalise()`, resolve o caminho: `path.join(CONTEXT_PATH, proj.repositorio)`.
- Fallback para `process.env.REPO_PATH` se o campo não existir no projeto.
- Atualizar `REPO_PATH` no `.env` para apontar para o novo local (`C:\azure\atlas\repos\app-minha-producao`).

### Arquivos alterados
- `PROJETOS.md` — adiciona campo `Repositorio:`
- `server/index.js` — `parseProjetos()` + `executarAnalise()`
- `server/.env` — atualiza `REPO_PATH`
- Mover pasta no filesystem

---

## Feature 2 — ARQUIVOS ANALISADOS em escadinha

### Problema
O agente lista arquivos em duas subseções ("Prioritários" / "Contexto"), omite arquivos intermediários e não mostra a cadeia de chamadas. O dev não consegue entender o fluxo de investigação.

### Solução

**CLAUDE.md** — substituir instrução atual da seção ARQUIVOS ANALISADOS por:

```
Lista TODOS os arquivos abertos, em formato de árvore mostrando qual chamou qual:
- arquivo-raiz.html
  └─ arquivo-componente.ts (componente)
     └─ servico.service.ts (serviço injetado)
        └─ backend.p (backend chamado)
```

Sem subseções. Uma única árvore por cadeia de investigação. Incluir todos os arquivos lidos, mesmo os que não continham o bug.

**popup.js** — `renderSecao()` já processa linha por linha. Adicionar detecção de linhas com `└─` (ou `  └─` com recuo): envolver em `<pre class="tree-block">` para preservar alinhamento mono.

Alternativa mais simples: dentro de `renderTexto()`, detectar bloco de linhas contíguas com `└─` e envolvê-las em `<pre class="tree-block">`.

**popup.css** — adicionar `.tree-block` com `font-family: monospace`, `font-size: 12px`, `background: var(--surface)`, `border-left: 2px solid var(--border2)`, `padding: 8px 12px`, `border-radius: 6px`.

### Arquivos alterados
- `CLAUDE.md` — instrução da seção ARQUIVOS ANALISADOS (Regra 9 e template do Passo 4)
- `plugin/popup.js` — `renderTexto()` ou `renderSecao()`
- `plugin/popup.css` — `.tree-block`

---

## Feature 3 — Botão copiar nome do arquivo no diff

### Problema
O dev precisa do nome do arquivo para buscar no repositório ou colar num comentário. Hoje só consegue selecionar o texto manualmente.

### Solução

**popup.js** — em `construirDiffBlock()`, adicionar botão `<button class="btn-copiar-arquivo">` imediatamente após o `<span class="diff-filename">`:

```html
<span class="diff-filename">▣ arquivo.ts</span>
<button class="btn-copiar-arquivo" data-filename="arquivo.ts" title="Copiar nome do arquivo">⎘</button>
```

O handler vai via event delegation no `document.addEventListener('click')` já existente em `configurarEventos()`:
```js
const btnCopy = e.target.closest('.btn-copiar-arquivo');
if (btnCopy) {
  navigator.clipboard.writeText(btnCopy.dataset.filepath);
  // feedback visual: troca ícone por ✓ por 1.5s
}
```

Copia o caminho completo (`data-filepath`) — mais útil para buscar no repositório ou compartilhar com colegas. `construirDiffBlock()` recebe um parâmetro extra `caminhoArquivo` (string, default = nomeArquivo se não fornecido).

**popup.css** — `.btn-copiar-arquivo`: botão discreto, mesmo estilo visual do `.btn-toggle-view`, `opacity: 0.5` → `1` no hover.

### Arquivos alterados
- `plugin/popup.js` — `construirDiffBlock()` + handler em `configurarEventos()`
- `plugin/popup.css` — `.btn-copiar-arquivo`

---

## Ordem de implementação

1. Feature 1 (servidor + PROJETOS.md) — independente
2. Feature 2 (CLAUDE.md + popup) — independente
3. Feature 3 (popup) — independente

Todas podem ser implementadas em paralelo; nenhuma depende das outras.
