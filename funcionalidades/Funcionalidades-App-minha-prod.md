# Funcionalidades — APP Minha Prod

> Mapa de funcionalidades e arquivos suspeitos do projeto APP Minha Prod.
> O agente consulta este arquivo para montar a lista de fontes a analisar.
> Durante a análise, o agente pode identificar e adicionar funcionalidades não selecionadas.
>
> Repositório base: C:\azure\atlas
> Repositório do app: C:\azure\atlas\app-minha-producao
>
> IMPORTANTE: Quando um arquivo suspeito contém sub-componentes (tags como <app-xyz>),
> o agente DEVE navegar e ler esses componentes também para entender o fluxo completo.

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

## Apontamento de ordem de produção (fluxo completo)
Descrição: Funcionalidade mais utilizada do app. O fluxo começa na seleção do formulário e
termina no envio do apontamento ao backend. Existem duas variantes: por cronômetro e por
formulário manual. Dependendo da configuração do formulário, paradas de produção também
podem ser registradas nesse fluxo.

### Fluxo completo:
1. Usuário abre a lista de formulários disponíveis e seleciona um (form-list)
2. É levado para a tela de seleção de OP, onde:
   - Informa (ou lê via QR Code) a Ordem de Produção
   - Se o formulário exige máquina: seleciona a máquina
   - Se o formulário permite paradas (canReportStop=true): botão "Parada" aparece no rodapé
   - Se o formulário bloqueia apontamento manual (blockManualAppointment=true): botão "Avançar" é ocultado
   - Se for SFC e tiver cronômetro habilitado: botão de timer aparece no centro da tela
3a. Clicou no timer → vai para datasul-report-timer (apontamento por cronômetro)
3b. Clicou em Avançar → vai para datasul-report-v2 (apontamento por formulário manual)
3c. Clicou em Parada → registra uma parada de produção

### Arquivos suspeitos — Seleção de formulário:
- src\app\form-list\form-list.page.html
- src\app\form-list\form-list.page.scss
- src\app\form-list\form-list.module.ts
- src\app\form-list\form-list-routing.module.ts

### Arquivos suspeitos — Seleção de OP e decisão de fluxo:
- src\app\report-process\datasul\datasul-select-po\datasul-select-po.page.html
- src\app\report-process\datasul\datasul-select-po\datasul-select-po.page.ts
- src\app\report-process\datasul\datasul-select-po\datasul-select-po.page.scss

### Arquivos suspeitos — Apontamento por cronômetro:
- src\app\report-process\datasul\datasul-report-timer\datasul-report-timer.page.html
- src\app\report-process\datasul\datasul-report-timer\datasul-report-timer.page.ts
- src\app\report-process\datasul\datasul-report-timer\datasul-report-timer.page.scss
- src\app\report-process\datasul\datasul-report-timer\datasul-report-timer.page.spec.ts

### Arquivos suspeitos — Apontamento por formulário (sem cronômetro):
Atenção: os campos do formulário são carregados dinamicamente via field-component. Analise ambos.
- src\app\report-process\datasul\datasul-report-v2\datasul-report-v2.page.html
- src\app\report-process\datasul\datasul-report-v2\datasul-report-v2.page.ts
- src\app\report-process\datasul\datasul-report-v2\datasul-report-v2.page.scss
- src\app\report-process\datasul\datasul-report-v2\component\field-component\field-component.component.html
- src\app\report-process\datasul\datasul-report-v2\component\field-component\field-component.component.ts
- src\app\report-process\datasul\datasul-report-v2\component\field-component\field-component.component.scss

---

## Configurações
Descrição: Tela de configurações gerais do app (parâmetros de conexão, preferências do usuário, etc.).
Arquivos suspeitos:
- src\app\shared\pages\config\config.page.html
- src\app\shared\pages\config\config.page.ts
- src\app\shared\pages\config\config.page.scss
- src\app\shared\pages\config\config.module.ts
- src\app\shared\pages\config\config-routing.module.ts

---

## Reporte de GGF/MOB (Overhead Labor Report)
Descrição: Permite reportar horas de mão de obra indireta (GGF/MOB). O fluxo é:
1. Usuário seleciona a ordem na tela de seleção
2. É levado para a lista de reportes da ordem
3. Pode adicionar um novo reporte clicando no botão de criação
Arquivos suspeitos:
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-order-select\datasul-overhead-labor-order-select.component.html
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-order-select\datasul-overhead-labor-order-select.component.ts
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-order-select\datasul-overhead-labor-order-select.component.scss
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-order-select\datasul-overhead-labor-order-select.module.ts
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-order-select\datasul-overhead-labor-order-select-routing.module.ts
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\datasul-overhead-labor-list.component.html
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\datasul-overhead-labor-list.component.ts
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\datasul-overhead-labor-list.component.scss
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\datasul-overhead-labor-list.module.ts
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\datasul-overhead-labor-list-routing.module.ts
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\components\overhead-labor-create\overhead-labor-create.component.html
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\components\overhead-labor-create\overhead-labor-create.component.ts
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\components\overhead-labor-create\overhead-labor-create.component.scss
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\components\overhead-labor-create\overhead-labor-create.module.ts
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\components\overhead-labor-create\overhead-labor-create-routing.module.ts

---

## Saldos do item
Descrição: Consulta os saldos de estoque de um item. O usuário pode pesquisar pelo código do
item (ou via QR Code) e navegar entre diferentes visões de estoque: por site, por depósito e
detalhado. Também permite visualizar alocações de ordens de produção. A tela usa sub-componentes
distintos para cada visão (ngFor renderizando cards dinamicamente conforme o viewMode ativo).

Sub-componentes renderizados dinamicamente:
- app-site-stock-view: exibe saldos por site (viewMode=1)
- app-warehouse-stock-view: exibe saldos por depósito (viewMode=2)
- app-item-detailed-stock-view: exibe saldo detalhado com lotes/localizações (viewMode=3)
- app-item-allocation-view: exibe alocações de ordens de produção (dentro de modal e em viewMode=3 quando isSingleRequisition)

Arquivos suspeitos:
- src\app\item-stock\datasul\item-stock-datasul.component.html
- src\app\item-stock\datasul\item-stock-datasul.component.ts
- src\app\item-stock\datasul\item-stock-datasul.component.scss
- src\app\item-stock\datasul\item-stock-datasul.module.ts
- src\app\item-stock\datasul\item-stock-datasul-routing.module.ts
- src\app\item-stock\datasul\allocation-view\item-allocation-view.component.html
- src\app\item-stock\datasul\allocation-view\item-allocation-view.component.ts
- src\app\item-stock\datasul\allocation-view\item-allocation-view.component.scss
- src\app\item-stock\datasul\stock-views\site-stock-view\site-stock-view.component.html
- src\app\item-stock\datasul\stock-views\site-stock-view\site-stock-view.component.ts
- src\app\item-stock\datasul\stock-views\site-stock-view\site-stock-view.component.scss
- src\app\item-stock\datasul\stock-views\warehouse-stock-view\warehouse-stock-view.component.html
- src\app\item-stock\datasul\stock-views\warehouse-stock-view\warehouse-stock-view.component.ts
- src\app\item-stock\datasul\stock-views\warehouse-stock-view\warehouse-stock-view.component.scss
- src\app\item-stock\datasul\stock-views\item-detailed-stock-view\item-detailed-stock-view.component.html
- src\app\item-stock\datasul\stock-views\item-detailed-stock-view\item-detailed-stock-view.component.ts
- src\app\item-stock\datasul\stock-views\item-detailed-stock-view\item-detailed-stock-view.component.scss

---

## Solicitação de serviço
Descrição: Tela para criar ou visualizar solicitações de serviço.
Arquivos suspeitos:
- src\app\service-request\datasul\datasul-service-request\service-request.page.html
- src\app\service-request\datasul\datasul-service-request\service-request.page.ts
- src\app\service-request\datasul\datasul-service-request\service-request.page.scss

---

## Consultar OP
Descrição: Tela de consulta de ordens de produção. Permite pesquisar e visualizar detalhes de uma OP.
Arquivos suspeitos:
- src\app\production-query\datasul\production-query-datasul.page.html
- src\app\production-query\datasul\production-query-datasul.page.ts
- src\app\production-query\datasul\production-query-datasul.page.scss
- src\app\production-query\datasul\production-query-datasul.module.ts
- src\app\production-query\datasul\production-query-datasul-routing.module.ts

---

## Requisição da OP
Descrição: Tela para visualizar e gerenciar as requisições de material de uma ordem de produção.
Arquivos suspeitos:
- src\app\single-requisition\datasul\datasul-single-requisition.component.html
- src\app\single-requisition\datasul\datasul-single-requisition.component.ts
- src\app\single-requisition\datasul\datasul-single-requisition.component.scss
- src\app\single-requisition\datasul\datasul-single-requisition.module.ts
- src\app\single-requisition\datasul\datasul-single-requisition.routing.module.ts

---

## Criar ordem de produção
Descrição: Fluxo para criação de uma nova ordem de produção. Composto por uma tela de seleção
de formulário e uma tela de preenchimento dos dados da ordem. O back-end recebe os dados via
API REST (Progress OpenEdge) e persiste na tabela ord-prod.

Arquivos front:
- src\app\production-order\datasul\form-list-create-production-order\form-list-create-production-order.page.html
- src\app\production-order\datasul\form-list-create-production-order\form-list-create-production-order.page.ts
- src\app\production-order\datasul\form-list-create-production-order\form-list-create-production-order.page.scss
- src\app\production-order\datasul\form-list-create-production-order\form-list-create-production-order.module.ts
- src\app\production-order\datasul\create-production-order\create-production-order.component.html
- src\app\production-order\datasul\create-production-order\create-production-order.component.ts
- src\app\production-order\datasul\create-production-order\create-production-order.component.scss
- src\app\production-order\datasul\create-production-order\create-production-order-datasul.module.ts
- src\app\production-order\datasul\create-production-order-by-form\create-production-order-by-form.page.html
- src\app\production-order\datasul\create-production-order-by-form\create-production-order-by-form.page.ts
- src\app\production-order\datasul\create-production-order-by-form\create-production-order-by-form.page.scss
- src\app\production-order\datasul\create-production-order-by-form\create-production-order-by-form.module.ts

Arquivos back:
- cpp\api\v1\productionOrder.p  — fachada REST: roteia GET→apiProductionOrder.p, POST/PUT→apiProductionOrderV2.p
- cpp\apiProductionOrder.p      — pi-get-v1 (busca OP por ID), pi-query-v1 (listagem)
- cpp\apiProductionOrderV2.p    — pi-create-v1→pi-store-v1 (criação/edição + mapeamento payload→tt-ord-prod), pi-query-v2 (listagem com campos extras), pi-get-order-default-data-v1 (defaults ao selecionar item), pi-get-order-data-by-site-v1 (defaults ao informar site/quantidade), pi-calculate-end-date (cálculo da data de término)
- cpp\cpapi301.p                — entrada da API de persistência; contém no cabeçalho um mapa comentado de todas as includes .iN e as procedures que cada uma contém — leia este arquivo primeiro e navegue para o include específico da procedure suspeita

---

## Motivo de refugo (ligado ao Apontamento)
Descrição: Tela acionada dentro do fluxo de apontamento (datasul-report-v2) para registrar o
motivo das quantidades refugadas. É uma sub-tela do reporte de produção.
Arquivos suspeitos:
- src\app\report-process\datasul\datasul-report-v2\datasul-report-reason\datasul-report-reason.html
- src\app\report-process\datasul\datasul-report-v2\datasul-report-reason\datasul-report-reason.ts
- src\app\report-process\datasul\datasul-report-v2\datasul-report-reason\datasul-report-reason.scss

Contexto: analisar em conjunto com datasul-report-v2 (ver "Apontamento de ordem de produção").

---

## Editar MOB/GGF (ligado ao Apontamento)
Descrição: Botão presente na tela de reporte de produção (datasul-report-v2) que leva o usuário
para a tela de listagem/edição de horas de mão de obra indireta (MOB/GGF) da ordem em questão.
Arquivos suspeitos:
- src\app\report-process\datasul\datasul-report-v2\datasul-report-v2.page.html
- src\app\report-process\datasul\datasul-report-v2\datasul-report-v2.page.ts
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\datasul-overhead-labor-list.component.html
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\datasul-overhead-labor-list.component.ts
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\datasul-overhead-labor-list.component.scss
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\components\overhead-labor-create\overhead-labor-create.component.html
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\components\overhead-labor-create\overhead-labor-create.component.ts
- src\app\overhead-labor-report\datasul\datasul-overhead-labor-list\components\overhead-labor-create\overhead-labor-create.component.scss

Contexto: analisar em conjunto com datasul-report-v2 e Reporte de GGF/MOB.

---

> [EXPANSÍVEL] — Adicione novas funcionalidades aqui conforme o app crescer.
> Formato:
>
> ## Nome da funcionalidade
> Descrição: o que essa funcionalidade faz
> Arquivos suspeitos:
> - src\caminho\do\arquivo.ts
> - src\caminho\do\arquivo.html
