========================================
COMO SUBIR O SERVIDOR NODE (API LOCAL)
========================================

1. Abrir terminal na pasta:
   cd C:\azure\atlas\server

2. Subir o servidor:
   node index.js

3. Confirmar que aparece no terminal:
   [Servidor] Rodando em http://localhost:3000

4. Testar se está ok (outro terminal ou navegador):
   http://localhost:3000/health
   → retorna: {"status":"ok"}

PARAR: Ctrl+C no terminal

----------------------------------------
ENDPOINTS DISPONÍVEIS
----------------------------------------

GET  /health                    → verifica se o servidor está no ar
GET  /funcionalidades           → lista as funcionalidades do Funcionalidades.md
POST /analisar                  → recebe dados do plugin e executa a análise
GET  /analisar/status/:id       → polling do status da análise
POST /cancelar/:id              → cancela análise em andamento
POST /limpar                    → esvazia output.txt
GET  /log/latest                → conteúdo do log atual
GET  /download/output           → download do output.txt
GET  /download/log/latest       → download do log

----------------------------------------
SE PRECISAR REINSTALAR AS DEPENDÊNCIAS
----------------------------------------

cd C:\azure\atlas\server
npm install

----------------------------------------
ARQUIVOS DO SERVIDOR
----------------------------------------

server\index.js   → código principal (endpoints)
server\.env       → caminhos configurados (não alterar sem necessidade)
server\package.json

----------------------------------------
VARIÁVEIS DO .env
----------------------------------------

PORT=3000
CONTEXT_PATH=C:\azure\atlas
OUTPUT_PATH=C:\azure\atlas\output.txt
REPO_PATH=C:\azure\atlas\app-minha-producao
TEMP_PATH=C:\azure\atlas\temp

========================================
