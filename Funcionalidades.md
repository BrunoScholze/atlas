# Funcionalidades.md

> Mapa de funcionalidades e seus arquivos suspeitos.
> O dev seleciona no plugin quais funcionalidades apresentam defeito.
> O agente consulta este arquivo para montar a lista de arquivos a analisar.
> Durante a análise, o agente pode identificar e adicionar funcionalidades não selecionadas.
>
> Repositório base: C:\azure\app-bot
> Repositório original do app: C:\azure\app-minha-producao

---

## Login
Descrição: Tela de autenticação do app.
Arquivos suspeitos:
- src\app\shared\pages\login\login.page.html
- src\app\shared\pages\login\login.page.ts
- src\app\shared\pages\login\login.page.scss
- src\app\shared\pages\login\login.module.ts
- src\app\shared\pages\login\login-routing.module.ts

---

## Apontamento de ordem de produção por cronômetro
Descrição: Apontamento onde o usuário inicia o cronômetro e o tempo é registrado automaticamente.
O usuário pode tentar alterar hora início/fim manualmente após o cronômetro rodar.
Arquivos suspeitos:
- src\app\report-process\datasul\datasul-report-timer\datasul-report-timer.page.html
- src\app\report-process\datasul\datasul-report-timer\datasul-report-timer.page.ts
- src\app\report-process\datasul\datasul-report-timer\datasul-report-timer.page.scss
- src\app\report-process\datasul\datasul-report-timer\datasul-report-timer.page.spec.ts

---

## Apontamento de ordem de produção por formulário (sem cronômetro)
Descrição: Apontamento manual onde o usuário preenche os campos do formulário diretamente.
Atenção: os campos do formulário são carregados dinamicamente via componente field-component.
São DOIS componentes responsáveis por essa funcionalidade — analise ambos.
Arquivos suspeitos:
- src\app\report-process\datasul\datasul-report-v2\datasul-report-v2.page.html
- src\app\report-process\datasul\datasul-report-v2\datasul-report-v2.page.ts
- src\app\report-process\datasul\datasul-report-v2\datasul-report-v2.page.scss
- src\app\report-process\datasul\datasul-report-v2\component\field-component\field-component.component.html
- src\app\report-process\datasul\datasul-report-v2\component\field-component\field-component.component.ts
- src\app\report-process\datasul\datasul-report-v2\component\field-component\field-component.component.scss

---

> [EXPANSÍVEL] — Adicione novas funcionalidades aqui conforme o app crescer.
> Formato:
>
> ## Nome da funcionalidade
> Descrição: o que essa funcionalidade faz (contexto pra o agente entender antes de abrir o código)
> Arquivos suspeitos:
> - caminho\completo\do\arquivo.ts
> - caminho\completo\do\arquivo.html
> - caminho\completo\do\arquivo.scss
