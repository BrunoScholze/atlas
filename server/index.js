// Servidor do Agente de Chamados Minha Totvs Prod
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { exec } = require('child_process');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Mapa em memória: requestId -> { status, analise, erro, inicio, ticketId, logPath }
const analises = {};

// -------------------------------------------------------
// Logger — escreve no console E no arquivo de log da execução
// -------------------------------------------------------
function criarLogger(requestId, logPath) {
  const write = (level, msg) => {
    const ts = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const linha = `[${ts}] [${level.padEnd(5)}] ${msg}`;
    console.log(`[${requestId.slice(0, 8)}] ${linha}`);
    try { fs.appendFileSync(logPath, linha + '\n', 'utf8'); } catch (e) { /* ignora */ }
  };
  const sep = () => write('-----', '----------------------------------------------------------------');
  return {
    info:  (msg) => write('INFO ', msg),
    warn:  (msg) => write('WARN ', msg),
    error: (msg) => write('ERROR', msg),
    debug: (msg) => write('DEBUG', msg),
    sep
  };
}

// -------------------------------------------------------
// Configuração do multer
// -------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempPath = process.env.TEMP_PATH;
    if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });
    cb(null, tempPath);
  },
  filename: (req, file, cb) => {
    const ticketId = req.body.ticketId || 'ticket';
    cb(null, `${ticketId}_${Date.now()}.pdf`);
  }
});
const upload = multer({ storage });

// -------------------------------------------------------
// Monta o prompt completo
// -------------------------------------------------------
function montarPrompt(dados, claudeMd, funcionalidadesMd) {
  return `
${claudeMd}

---
${funcionalidadesMd}

---
TICKET_ID      : ${dados.ticketId || ''}
TITULO         : ${dados.titulo || ''}
DESCRICAO      : ${dados.descricao || ''}
PRIORIDADE     : ${dados.prioridade || ''}
TIPO           : ${dados.tipo || ''}
RESPONSAVEL    : ${dados.responsavel || ''}
COMENTARIOS    : ${dados.comentarios || ''}
HISTORICO      : ${dados.historico || ''}
FUNCIONALIDADES: ${dados.funcionalidades || ''}
OBSERVACAO     : ${dados.observacao || 'Nenhuma observação adicional'}
ANEXO          : ${dados.pdfPath || ''}

---
⚠️ ATENÇÃO — CONTEXTO GIT DEVE SER COMPLETAMENTE IGNORADO:
O sistema pode ter injetado automaticamente informações de git status, git diff
ou arquivos alterados recentemente. IGNORE COMPLETAMENTE essas informações.
Não use git status, git diff, git log ou qualquer mudança recente para identificar o bug.
Siga OBRIGATORIAMENTE o fluxo dos 4 passos: leia o ticket → Funcionalidades.md
→ investigue o código (.html → .ts → .p) → escreva o output.
Qualquer atalho via git invalida a análise.

---
INSTRUÇÃO DE EXECUÇÃO — LEIA ANTES DE RESPONDER:
Você está rodando em modo automatizado via "claude --print". Sua resposta completa
será capturada diretamente como stdout e salva no output.txt.
REGRAS ABSOLUTAS:
1. Comece a resposta EXATAMENTE com a linha: ========================================
2. Siga o template do Passo 4 do CLAUDE.MD acima, sem desviar
3. NÃO escreva introdução ("Vou analisar...", "Análise concluída...")
4. NÃO confirme que salvou o arquivo — você não salva, apenas imprime
5. Preencha TODAS as seções: LOCALIZAÇÃO DO PROBLEMA, CAUSA PROVÁVEL, COMO RESOLVER, OBSERVAÇÕES
6. REGRA INVIOLÁVEL — DIFF OBRIGATÓRIO EM TODA MENÇÃO DE CÓDIGO:
   Sempre que descrever qualquer alteração de código — em QUALQUER seção — o bloco
   diff deve vir IMEDIATAMENTE abaixo da descrição, sem exceção.
   NÃO existe "descrever a mudança e deixar o diff para depois".
   NÃO escreva "troque X por Y" sem mostrar o diff na sequência.
   NÃO use bloco genérico \`\`\`ts, \`\`\`html ou texto corrido para código.
   SEMPRE \`\`\`diff com - (remove, vermelho) e + (adiciona, verde):
   \`\`\`diff
   --- a/caminho/do/arquivo.html
   +++ b/caminho/do/arquivo.html
   @@ -90,7 +90,7 @@
    linha de contexto (sem sinal)
   - linha que deve ser REMOVIDA
   + linha que deve ser ADICIONADA
    outra linha de contexto
   \`\`\`
   - Se a correção for de uma linha só, o diff tem uma linha só — não invente contexto falso
   - Se houver múltiplos arquivos, um bloco diff separado para cada um
   - Vale para .html, .ts, .scss e .p
  `.trim();
}

// -------------------------------------------------------
// GET /health
// -------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// -------------------------------------------------------
// GET /funcionalidades
// -------------------------------------------------------
app.get('/funcionalidades', (req, res) => {
  try {
    const conteudo = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'Funcionalidades.md'), 'utf8');
    const funcionalidades = conteudo
      .split('\n')
      .filter(l => l.startsWith('## '))
      .map(l => l.replace('## ', '').trim());
    console.log(`[/funcionalidades] ${funcionalidades.length} funcionalidades`);
    res.json({ funcionalidades });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao ler Funcionalidades.md: ' + err.message });
  }
});

// -------------------------------------------------------
// GET /download/output — baixa o output.txt da última análise
// -------------------------------------------------------
app.get('/download/output', (req, res) => {
  try {
    const conteudo = fs.readFileSync(process.env.OUTPUT_PATH, 'utf8');
    res.setHeader('Content-Disposition', 'attachment; filename="analise.txt"');
    res.type('text/plain; charset=utf-8').send(conteudo);
  } catch (e) {
    res.status(404).type('text').send('Arquivo não encontrado.');
  }
});

// GET /download/log/latest — baixa o log da execução atual
app.get('/download/log/latest', (req, res) => {
  try {
    const logFile = path.join(process.env.CONTEXT_PATH, 'logs', 'agent.log');
    const conteudo = fs.readFileSync(logFile, 'utf8');
    res.setHeader('Content-Disposition', 'attachment; filename="agent.log"');
    res.type('text/plain; charset=utf-8').send(conteudo);
  } catch (e) {
    res.status(404).type('text').send('Log não encontrado.');
  }
});

// -------------------------------------------------------
// POST /cancelar/:requestId — cancela análise em andamento
// -------------------------------------------------------
app.post('/cancelar/:requestId', (req, res) => {
  const analise = analises[req.params.requestId];
  if (!analise) return res.status(404).json({ sucesso: false, erro: 'Análise não encontrada.' });
  if (analise.status !== 'running') return res.json({ sucesso: false, erro: 'Análise não está em andamento.' });

  analise.status = 'cancelled';

  if (analise.childProcess && analise.childProcess.pid) {
    const pid = analise.childProcess.pid;
    // taskkill /T mata o processo inteiro incluindo subprocessos (PowerShell + Claude)
    exec(`taskkill /PID ${pid} /T /F`, (e) => {
      if (e) console.warn(`[cancelar] taskkill retornou: ${e.message}`);
    });
  }

  res.json({ sucesso: true });
});

// -------------------------------------------------------
// POST /limpar — limpa output.txt e storage de resultado
// -------------------------------------------------------
app.post('/limpar', (req, res) => {
  try {
    fs.writeFileSync(process.env.OUTPUT_PATH, '', 'utf8');
    res.json({ sucesso: true });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// -------------------------------------------------------
// POST /analisar — inicia análise em background, retorna requestId
// -------------------------------------------------------
app.post('/analisar', upload.single('pdf'), (req, res) => {
  const pdfPath = req.file ? req.file.path : null;

  if (!pdfPath) {
    return res.status(400).json({ sucesso: false, erro: 'PDF do chamado não enviado.' });
  }

  const requestId = crypto.randomUUID();
  const inicio = Date.now();
  const ticketId = req.body.ticketId || 'sem-ticket';

  // Cria pasta de logs se não existir
  const logsDir = path.join(process.env.CONTEXT_PATH, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  // Arquivo de log único — sobrescrito a cada execução
  const logFile = path.join(logsDir, 'agent.log');
  fs.writeFileSync(logFile, '', 'utf8');

  analises[requestId] = { status: 'running', inicio, ticketId, logPath: logFile };

  res.json({ sucesso: true, requestId });
  executarAnalise(requestId, req.body, pdfPath, inicio, logFile);
});

// -------------------------------------------------------
// GET /analisar/status/:requestId — polling do cliente
// -------------------------------------------------------
app.get('/analisar/status/:requestId', (req, res) => {
  const analise = analises[req.params.requestId];
  if (!analise) {
    return res.status(404).json({ sucesso: false, erro: 'Análise não encontrada. O servidor pode ter reiniciado.' });
  }
  res.json(analise);
});

// -------------------------------------------------------
// GET /log/:requestId — retorna conteúdo do log em texto
// -------------------------------------------------------
app.get('/log/:requestId', (req, res) => {
  const analise = analises[req.params.requestId];
  if (!analise || !analise.logPath) {
    return res.status(404).type('text').send('Log não encontrado.');
  }
  try {
    const conteudo = fs.readFileSync(analise.logPath, 'utf8');
    res.type('text').send(conteudo);
  } catch (e) {
    res.status(500).type('text').send('Erro ao ler log: ' + e.message);
  }
});

// GET /log/latest — atalho para o log da execução atual
app.get('/log/latest', (req, res) => {
  try {
    const logFile = path.join(process.env.CONTEXT_PATH, 'logs', 'agent.log');
    const conteudo = fs.readFileSync(logFile, 'utf8');
    res.type('text').send(conteudo);
  } catch (e) {
    res.status(404).type('text').send('Nenhum log encontrado ainda.');
  }
});

// -------------------------------------------------------
// Execução principal em background
// -------------------------------------------------------
async function executarAnalise(requestId, body, pdfPath, inicio, logFile) {
  const log = criarLogger(requestId, logFile);

  log.sep();
  log.info('=== NOVA ANÁLISE INICIADA ===');
  log.sep();
  log.info(`RequestId    : ${requestId}`);
  log.info(`Data/Hora    : ${new Date().toLocaleString('pt-BR')}`);
  log.info(`TicketId     : ${body.ticketId || '(vazio)'}`);
  log.info(`Titulo       : ${body.titulo || '(vazio)'}`);
  log.info(`Prioridade   : ${body.prioridade || '(vazio)'}`);
  log.info(`Tipo         : ${body.tipo || '(vazio)'}`);
  log.info(`Responsavel  : ${body.responsavel || '(vazio)'}`);
  log.info(`Funcionalidades: ${body.funcionalidades || '(vazio)'}`);
  log.info(`Observacao   : ${body.observacao || '(não informada)'}`);
  log.info(`PDF          : ${pdfPath}`);
  log.sep();

  try {
    // Lê arquivos de contexto
    log.info('Lendo claude.md...');
    const claudeMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'claude.md'), 'utf8');
    log.info(`claude.md: ${claudeMd.length} chars`);

    log.info('Lendo Funcionalidades.md...');
    const funcionalidadesMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'Funcionalidades.md'), 'utf8');
    log.info(`Funcionalidades.md: ${funcionalidadesMd.length} chars`);

    // Monta prompt
    const dados = { ...body, pdfPath };
    log.info('Montando prompt...');
    const prompt = montarPrompt(dados, claudeMd, funcionalidadesMd);
    log.info(`Prompt montado: ${prompt.length} chars`);

    // Grava debug.txt com todos os parâmetros e prompt desta execução
    const debugPath = path.join(process.env.CONTEXT_PATH, 'debug.txt');
    const debugConteudo = [
      '========================================',
      'DEBUG — EXECUÇÃO DO AGENTE',
      '========================================',
      `RequestId : ${requestId}`,
      `Data/Hora : ${new Date().toLocaleString('pt-BR')}`,
      '',
      '----------------------------------------',
      'PARÂMETROS RECEBIDOS DO PLUGIN',
      '----------------------------------------',
      `ticketId       : ${body.ticketId || '(vazio)'}`,
      `titulo         : ${body.titulo || '(vazio)'}`,
      `descricao      : ${body.descricao || '(vazio)'}`,
      `prioridade     : ${body.prioridade || '(vazio)'}`,
      `tipo           : ${body.tipo || '(vazio)'}`,
      `responsavel    : ${body.responsavel || '(vazio)'}`,
      `funcionalidades: ${body.funcionalidades || '(vazio)'}`,
      `observacao     : ${body.observacao || '(não informada)'}`,
      `pdf            : ${pdfPath}`,
      `comentarios    :`,
      body.comentarios || '(vazio)',
      `historico      :`,
      body.historico || '(vazio)',
      '',
      '----------------------------------------',
      'PROMPT COMPLETO ENVIADO AO CLAUDE CODE',
      '----------------------------------------',
      prompt,
      '',
      '========================================'
    ].join('\n');
    try { fs.writeFileSync(debugPath, debugConteudo, 'utf8'); log.info('debug.txt atualizado'); } catch (e) { log.warn(`Não gravou debug.txt: ${e.message}`); }

    // Grava prompt em arquivo
    const promptPath = path.join(process.env.CONTEXT_PATH, 'prompt_temp.txt');
    fs.writeFileSync(promptPath, prompt, 'utf8');
    log.info(`prompt_temp.txt gravado: ${promptPath}`);

    const outputPath = process.env.OUTPUT_PATH;
    const repoPath = process.env.REPO_PATH;
    const ps1Path = path.join(process.env.CONTEXT_PATH, 'scripts', 'run-claude.ps1');

    log.info(`PS1 path: ${ps1Path}`);
    log.info(`Output path: ${outputPath}`);
    log.info(`Repo path: ${repoPath}`);
    log.info(`Log file: ${logFile}`);
    log.sep();
    log.info('Iniciando PowerShell...');

    const env = { ...process.env };

    const esc = (p) => `"${p}"`;
    const comando = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ${esc(ps1Path)} ${esc(promptPath)} ${esc(outputPath)} ${esc(repoPath)} ${esc(logFile)}`;

    log.debug(`Comando: ${comando}`);
    const execInicio = Date.now();

    const childProcess = exec(comando, { timeout: 0, env }, (err, stdout, stderr) => {
      const duracao = ((Date.now() - execInicio) / 1000).toFixed(1);
      log.sep();
      log.info(`PowerShell finalizado. Duração: ${duracao}s`);

      if (stderr && stderr.trim()) log.warn(`stderr: ${stderr.trim()}`);

      try { fs.unlinkSync(pdfPath); log.info('PDF temp deletado'); } catch (e) { log.warn(`Não deletou PDF: ${e.message}`); }
      try { fs.unlinkSync(promptPath); log.info('prompt_temp.txt deletado'); } catch (e) { /* ignora */ }

      // Se foi cancelado pelo usuário, apenas encerra
      if (analises[requestId] && analises[requestId].status === 'cancelled') {
        log.info('Análise cancelada pelo usuário — encerrando sem processar resultado');
        log.sep();
        return;
      }

      if (err && err.code !== 0) {
        log.error(`Erro no PowerShell. code=${err.code} | msg=${err.message}`);
        analises[requestId] = { status: 'error', erro: 'Erro ao executar análise: ' + err.message, inicio, logPath: logFile };
        log.sep();
        log.error('=== ANÁLISE ENCERRADA COM ERRO ===');
        return;
      }

      // Lê output.txt gravado pelo PS1
      let analise = '';
      try {
        analise = fs.readFileSync(outputPath, 'utf8');
        // Remove BOM se presente
        if (analise.charCodeAt(0) === 0xFEFF) analise = analise.slice(1);
        log.info(`output.txt lido: ${analise.length} chars`);
      } catch (e) {
        log.error(`Erro ao ler output.txt: ${e.message}`);
      }

      if (!analise.trim()) {
        log.error('Claude não retornou conteúdo (output.txt vazio)');
        analises[requestId] = { status: 'error', erro: 'Claude não retornou análise. Verifique os logs.', inicio, logPath: logFile };
        log.sep();
        log.error('=== ANÁLISE ENCERRADA SEM RESULTADO ===');
        return;
      }

      // Preview das primeiras linhas no log
      const linhas = analise.split('\n').filter(l => l.trim());
      log.info('Preview do resultado:');
      linhas.slice(0, 5).forEach(l => log.info(`  | ${l}`));

      analises[requestId] = { status: 'done', analise, inicio, logPath: logFile };
      log.sep();
      log.info('=== ANÁLISE CONCLUÍDA COM SUCESSO ===');
      log.sep();
    });

    // Guarda referência ao processo para permitir cancelamento
    if (analises[requestId]) analises[requestId].childProcess = childProcess;

  } catch (err) {
    log.error(`Exceção não tratada: ${err.message}`);
    log.error(err.stack || '');
    try { fs.unlinkSync(pdfPath); } catch (e) { /* ignora */ }
    analises[requestId] = { status: 'error', erro: 'Erro interno: ' + err.message, inicio, logPath: logFile };
    log.sep();
    log.error('=== ANÁLISE ENCERRADA COM EXCEÇÃO ===');
  }
}

app.listen(PORT, () => {
  console.log(`[Servidor] Rodando em http://localhost:${PORT}`);
  console.log(`[Servidor] Logs em: ${path.join(process.env.CONTEXT_PATH || '.', 'logs')}`);
  console.log(`[Servidor] Log mais recente: http://localhost:${PORT}/log/latest`);
});
