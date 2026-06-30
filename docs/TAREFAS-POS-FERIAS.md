# Tarefas pós-férias — Atlas

> Criado em 30/06/2026. Retomar aqui ao voltar.

---

## Tarefa 1 — Revisar o back de "Criar ordem de produção"

**Por quê:** O mapeamento atual lista só até `cpapi301.p` e confia que o agente navega
pelos includes sozinho. Ainda não foi testado com um chamado real de criação de OP
para confirmar que o agente chega até a procedure certa sem pedir fontes ausentes.

**O que fazer:**

- [ ] 1. Pegar um chamado real de criação de OP (DMANUFATURA ou similar)
- [ ] 2. Rodar pelo plugin e observar no log se o agente abriu `cpapi301.p`
- [ ] 3. Verificar no output se ele navegou para o `.iN` correto ou parou com `ARQUIVO_AUSENTE`
- [ ] 4. Se parou: identificar qual `.iN` faltou e adicioná-lo ao script `copiar-fontes-criar-op.ps1`
- [ ] 5. Se navegou errado: corrigir o comentário-guia dentro de `cpapi301.p` (cabeçalho do arquivo)
       que mapeia procedure → include — o agente usa esse mapa para decidir qual `.iN` abrir
- [ ] 6. Validar que `analisouBack = true` e `problemaNoBack` bate com o que o agente reportou

**Arquivos relevantes:**
- `funcionalidades/Funcionalidades-App-minha-prod.md` → seção "Criar ordem de produção"
- `scripts/copiar-fontes-criar-op.ps1`
- `repos/EMS2/progress/src/cpp/cpapi301.p` (cabeçalho com mapa procedure→include)

---

## Tarefa 2 — Mapear "Apontamento de produção" com back detalhado

**Por quê:** A funcionalidade "Apontamento de ordem de produção" já tem os arquivos front
mapeados mas **não tem nenhum arquivo de back**. É a funcionalidade mais usada do app
e provavelmente a que vai gerar mais chamados.

**O que fazer:**

### 2a — Descobrir o endpoint do apontamento

- [ ] 1. Abrir um dos arquivos de serviço do front para achar a URL chamada no apontamento:
  ```
  repos/app-minha-producao/src/app/report-process/datasul/datasul-report-v2/datasul-report-v2.page.ts
  ```
  Procurar por `http.post`, `service.`, ou o nome do serviço injetado — vai ter a URL do endpoint.
- [ ] 2. Com a URL em mãos (ex: `/api/cpp/v1/productionMobile/apontamento`), identificar
  qual procedure da fachada `productionMobile.p` trata esse endpoint
  ```
  Grep "apontamento" em repos/EMS2/progress/src/cpp/api/v1/productionMobile.p
  ```

### 2b — Navegar o back da fachada até a lógica final

- [ ] 3. Abrir a fachada `cpp/api/v1/productionMobile.p` e localizar a procedure do endpoint
- [ ] 4. Ver se ela delega para `fchmanproductionmobile.p` (padrão das outras funcionalidades):
  ```
  Grep "RUN fch/fchman/fchmanproductionmobile" em productionMobile.p
  ```
- [ ] 5. Grep pela procedure `REST_POST_<nome>` em `fchmanproductionmobile.p` — anotar a linha
- [ ] 6. Dentro dessa procedure, verificar se há `RUN <outro-arquivo>.p PERSISTENT SET h-*`
  → se sim, Grep nesse arquivo pela procedure final — anotar a linha
- [ ] 7. Parar quando chegar na lógica real de negócio (inserção/validação do apontamento)

### 2c — Atualizar o MD e criar o script

- [ ] 8. Atualizar a seção "Apontamento de ordem de produção" em
  `funcionalidades/Funcionalidades-App-minha-prod.md` adicionando seção `Arquivos back:`
  com o caminho de cada arquivo + nome da procedure + número de linha + descrição
- [ ] 9. Criar `scripts/copiar-fontes-apontamento-producao.ps1` copiando todos os arquivos
  de back identificados de `C:\azure\EMS2\progress\src` → `C:\azure\atlas\repos\EMS2\progress\src`
- [ ] 10. Rodar o script e confirmar que todos os arquivos foram copiados:
  ```
  ! & "C:\azure\atlas\scripts\copiar-fontes-apontamento-producao.ps1"
  ```

**Referência — padrão de como ficou em outra funcionalidade:**
```markdown
Arquivos back:
- cpp\api\v1\productionMobile.p         — fachada REST; procedure `nomeProc` (linha N): mapeia payload → chama REST_POST_X IN h-api
- fch\fchman\fchmanproductionmobile.p   — 6000+ linhas; procedure `REST_POST_X` (linha N): lógica intermediária; use Grep
- fch\fchmip\fchmipservicerequest.p     — procedure `Y` (linha N): lógica de negócio final
```

---

## Tarefa 3 — Testar o fluxo ARQUIVO_AUSENTE na prática

**Por quê:** O fluxo foi implementado (agente sinaliza → servidor detecta → plugin abre
refinamento pré-preenchido) mas nunca foi testado de ponta a ponta com um chamado real.
Precisa confirmar que a UX funciona como esperado.

**Como simular:**

- [ ] 1. Escolher uma funcionalidade que tenha back mapeado (ex: "Solicitação de serviço")
- [ ] 2. **Remover temporariamente** um dos arquivos de back do repo local:
  ```powershell
  Rename-Item "C:\azure\atlas\repos\EMS2\progress\src\fch\fchmip\fchmipservicerequest.p" `
              "C:\azure\atlas\repos\EMS2\progress\src\fch\fchmip\fchmipservicerequest.p.bak"
  ```
- [ ] 3. Enviar um chamado real relacionado a solicitação de serviço pelo plugin
- [ ] 4. Verificar no log (`logs/agent.log`) se aparece:
  ```
  === ARQUIVOS AUSENTES DETECTADOS ===
    FALTOU: fch/fchmip/fchmipservicerequest.p
  ```
- [ ] 5. Verificar no plugin se a caixa de refinamento abriu automaticamente com o texto
  descrevendo o arquivo que faltou
- [ ] 6. Verificar no dashboard (execução da análise) se o bloco amarelo de aviso aparece
  com o caminho do arquivo ausente
- [ ] 7. Restaurar o arquivo:
  ```powershell
  Rename-Item "...\fchmipservicerequest.p.bak" "...\fchmipservicerequest.p"
  ```
- [ ] 8. Se algo não funcionou: verificar o regex no `server/index.js` que detecta `ARQUIVO_AUSENTE:`
  — garantir que o padrão bate com o que o Claude escreve no output

**O que esperar ao final do teste:**
- Status da execução no dashboard: `arquivo_ausente` (não `done`)
- Badge de feedback: "Sem resposta" (cinza) — nunca "Resolvido"
- Plugin: campo de refinamento aberto com texto pré-preenchido solicitando o arquivo
- Dashboard → drawer da execução: bloco amarelo listando o arquivo ausente
