# UX — Feedback, Botões e @Menção de Arquivos

## Visão geral

Três grupos de melhorias independentes para o plugin Atlas Code (Chrome Extension):

1. **`@` menção de arquivo** nos campos de texto
2. **Redesign dos botões** na tela de resultado
3. **Feedback + tela de estatísticas**

---

## Feature 1 — `@` Menção de arquivo

### Onde aparece
- Textarea de detalhes opcionais (tela 2, `#descricaoTextarea`)
- Textarea de refinamento (`#refinamentoTexto`)

### Comportamento
- Ao digitar `@`, abre dropdown sobre o campo com os arquivos do projeto atual
- A lista vem dos arquivos listados nas funcionalidades (`/funcionalidades/:slug`), já carregadas
- Seleção insere o caminho completo no texto: `@src/app/componente/componente.ts`
- Placeholders novos:
  - Detalhes: "Detalhe o mais profundo possível. Pode citar arquivos com @caminho/do/arquivo.ts"
  - Refinamento: "Descreva o que ainda não funcionou. Pode citar arquivos com @caminho/do/arquivo.ts"

### No servidor (`index.js`)
- Ao receber o campo `observacao` (ou `refinamento`), detectar padrão `@src/...`
- Ler o arquivo no repositório e injetar no prompt:
  ```
  === ARQUIVO REFERENCIADO ===
  Caminho: src/app/...
  <conteúdo do arquivo>
  ===========================
  ```
- Limite: máximo 3 arquivos referenciados por análise (evitar prompt gigante)
- Se arquivo não existir: ignorar silenciosamente (não quebrar a análise)

---

## Feature 2 — Redesign dos botões na tela resultado

### Layout novo (área `.resultado-actions`)
```
[← Início]          [Ainda não resolveu]          [✓ Resolvido! 🎉]
(esquerda)               (centro)                   (direita extrema)
```

### Botão "← Início"
- Substitui atual "Voltar para o início"
- Abre modal de confirmação inline: "O chamado foi resolvido antes de sair?"
  - [Sim] → salva feedback como `resolved` + reset
  - [Não] → salva feedback como `unresolved` + reset
  - [Cancelar] → fecha modal, permanece na tela resultado

### Botão "Ainda não resolveu"
- Comportamento atual mantido (abre campo refinamento)
- Posição: centro

### Botão "✓ Resolvido! 🎉"
- Posição: extrema direita, destaque visual (cor verde/success)
- Ao clicar: dispara confetti (`canvas-confetti`, bundled ~7KB) + salva feedback como `resolved` + reset após 2s

### Confetti
- Usar `canvas-confetti` NPM package, copiado para `plugin/vendor/confetti.js`
- Configuração: 3 rajadas, cores do tema atual (light/dark)

---

## Feature 3 — Feedback + tela de estatísticas

### Estrutura de dados salva
Arquivo: `feedback/<slug>/<TICKET-ID>-<timestamp-unix>.json`

```json
{
  "ticketId": "ATLAS-123",
  "titulo": "Erro ao salvar ordem de produção",
  "projeto": "minha-totvs-prod",
  "funcionalidades": ["Criar OP", "Editar OP"],
  "arquivosAnalisados": ["src/app/...ts", "src/back/...p"],
  "pdfTexto": "<primeiros 2000 chars do PDF extraído>",
  "observacao": "campo observacao do usuário",
  "tempoAnalise": 251,
  "timestamp": 1719600000,
  "status": "resolved"
}
```

Status possíveis: `resolved`, `unresolved`, `unresolved_refined`

### Endpoints novos no servidor
- `POST /feedback` — salva o JSON acima
- `GET /feedback/stats` — retorna agregações: total, por status, por projeto, por semana

### Tela de stats no plugin
- Acessível pelo ícone 📊 no header (todas as telas, exceto loading)
- Tela separada (`#telaStats`) seguindo o padrão visual do plugin (tema, tipografia)

Componentes visuais:
- 3 cards de métricas: Total de análises / % Resolvidos / Tempo médio
- Gráfico de barras SVG nativo (sem dependência) — análises por semana (últimas 6 semanas)
- Tabela de execuções: ticketId, título, projeto, data, status (badge colorido), tempo

---

## Ordem de implementação

1. Feature 2 (botões) — impacto visual imediato, não tem dependências
2. Feature 3 (feedback) — depende dos botões para disparar salvamento
3. Feature 1 (`@` menção) — independente, pode ser por último

---

## Global constraints

- Sem frameworks externos novos além de `canvas-confetti`
- Gráficos em SVG puro (sem Chart.js, sem D3)
- Tema claro/escuro aplicado à nova tela de stats da mesma forma que nas outras telas
- Plugin Chrome MV3: sem `eval`, sem `innerHTML` com strings não-escapadas
- Dados de feedback salvos no servidor local (não em `chrome.storage`)
- Máximo 3 arquivos por `@` menção; limite 2000 chars por arquivo referenciado
