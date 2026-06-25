// Servidor do Agente de Chamados — Atlas Code
//
// Arquitetura multi-projeto:
//   PROJETOS.md  — lista projetos: slug, nome, CLAUDE.md e status
//   Funcionalidades.md — cada ## heading tem tag [slug] indicando o projeto
//   POST /analisar recebe campo 'projeto' (slug) e:
//     (a) lê o CLAUDE.md correto via campo CLAUDE: do PROJETOS.md
//     (b) filtra Funcionalidades.md pelas entradas tagadas com [slug]
//   Adicionar novo projeto = novo bloco em PROJETOS.md + entradas tagadas em Funcionalidades.md
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
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
// Helpers de projeto
// -------------------------------------------------------
function parseProjetos(conteudo) {
  const projetos = [];
  const blocos = conteudo.split(/\n## /);
  for (const bloco of blocos.slice(1)) {
    const linhas = bloco.split('\n');
    const slug = linhas[0].trim();
    const meta = {};
    for (const linha of linhas.slice(1)) {
      const m = linha.match(/^(\w+):\s*(.+)$/);
      if (m) meta[m[1].toLowerCase()] = m[2].trim();
    }
    projetos.push({
      slug,
      nome: meta.nome || slug,
      descricao: meta['descrição'] || meta.descricao || '',
      status: meta.status || 'ativo',
      claude: meta.claude || 'CLAUDE.md',
      azure: meta.azure || ''
    });
  }
  return projetos;
}

function filtrarFuncionalidades(conteudo, projetoSlug) {
  if (!projetoSlug) return conteudo;
  const tag = `[${projetoSlug}]`;
  const partes = conteudo.split(/(?=\n## )/);
  const preambulo = partes[0];
  const secoes = partes.slice(1).filter(s => {
    const primeiraLinha = s.split('\n').find(l => l.startsWith('## ')) || '';
    return primeiraLinha.includes(tag);
  });
  return preambulo + secoes.join('');
}

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
PROJETO        : ${dados.projeto || ''}
FUNCIONALIDADES:
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
Você está rodando em modo --print automatizado. Seu stdout INTEIRO é capturado e
exibido no plugin. Qualquer texto fora do template quebra a renderização.

REGRAS ABSOLUTAS:
1. PRIMEIRA LINHA da resposta: ========================================
   Não escreva NADA antes disso. Nenhuma introdução. Nenhum comentário.
2. Siga o template do Passo 4 do CLAUDE.MD exatamente, incluindo os separadores ----
3. NÃO escreva "Análise concluída", "output.txt salvo" ou qualquer texto fora do template
4. LOCALIZAÇÃO DO PROBLEMA: máximo 3 linhas
   - Linha 1: Arquivo: \`nome.html\`, linha X
   - Linha 2: Uma frase descrevendo o sintoma (o que está errado, não por quê)
   - NADA MAIS. Sem parágrafos. Sem explicações de atributos. Sem histórico.
5. COMO RESOLVER: UMA frase de ação + bloco diff IMEDIATAMENTE abaixo
   - A frase descreve O QUE fazer (ex: "Adicionar p-kind na linha 93:")
   - O diff vem logo depois, sem nenhum texto entre a frase e o bloco
   - NUNCA escreva a mudança em texto corrido sem o diff
   - NUNCA use \`\`\`ts, \`\`\`html ou inline code para mostrar mudança de código
   - SEMPRE \`\`\`diff com - (vermelho, remove) e + (verde, adiciona):
   \`\`\`diff
   --- a/src/caminho/do/arquivo.html
   +++ b/src/caminho/do/arquivo.html
   @@ -91,7 +91,7 @@
    linha de contexto
   - linha REMOVIDA
   + linha ADICIONADA
    linha de contexto
   \`\`\`
   - Se houver múltiplos arquivos: um bloco diff separado por arquivo, em sequência
   - Se a correção for de uma linha: diff de uma linha — sem inventar contexto falso
  `.trim();
}

// -------------------------------------------------------
// GET /health
// -------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// -------------------------------------------------------
// GET /projetos — lista projetos ativos do PROJETOS.md
// -------------------------------------------------------
app.get('/projetos', (req, res) => {
  try {
    const conteudo = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'PROJETOS.md'), 'utf8');
    const todos = parseProjetos(conteudo);
    const ativos = todos
      .filter(p => p.status === 'ativo')
      .map(p => ({ slug: p.slug, nome: p.nome, descricao: p.descricao, azure: p.azure }));
    res.json({ projetos: ativos });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao ler PROJETOS.md: ' + err.message });
  }
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

  const observacao = req.body.observacao || '';
  if (!pdfPath && !observacao.trim()) {
    return res.status(400).json({ sucesso: false, erro: 'Anexe um PDF ou descreva o problema no campo de texto.' });
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
  log.info(`Projeto        : ${body.projeto || '(não informado)'}`);
  log.info(`Observacao   : ${body.observacao || '(não informada)'}`);
  log.info(`PDF          : ${pdfPath}`);
  log.sep();

  try {
    // Lê arquivos de contexto — resolve projeto e filtra funcionalidades
    const projetoSlug = body.projeto || '';
    let claudeFile = 'CLAUDE.md';

    if (projetoSlug) {
      try {
        const projetosMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'PROJETOS.md'), 'utf8');
        const proj = parseProjetos(projetosMd).find(p => p.slug === projetoSlug);
        if (proj) { claudeFile = proj.claude || 'CLAUDE.md'; log.info(`Projeto: ${projetoSlug} → ${claudeFile}`); }
        else log.warn(`Projeto '${projetoSlug}' não encontrado em PROJETOS.md — usando CLAUDE.md padrão`);
      } catch (e) { log.warn(`Não leu PROJETOS.md: ${e.message}`); }
    }

    log.info(`Lendo ${claudeFile}...`);
    const claudeMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, claudeFile), 'utf8');
    log.info(`${claudeFile}: ${claudeMd.length} chars`);

    log.info('Lendo Funcionalidades.md...');
    let funcionalidadesMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'Funcionalidades.md'), 'utf8');
    if (projetoSlug) {
      funcionalidadesMd = filtrarFuncionalidades(funcionalidadesMd, projetoSlug);
      log.info(`Funcionalidades.md filtrado para [${projetoSlug}]: ${funcionalidadesMd.length} chars`);
    } else {
      log.info(`Funcionalidades.md: ${funcionalidadesMd.length} chars (sem filtro)`);
    }

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

      if (pdfPath) { try { fs.unlinkSync(pdfPath); log.info('PDF temp deletado'); } catch (e) { log.warn(`Não deletou PDF: ${e.message}`); } }
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

      // Extrai e loga funcionalidades identificadas e arquivos suspeitos
      const extrairSecaoLog = (texto, secao) => {
        const re = new RegExp(`-{2,}\\s*\\r?\\n\\s*${secao}\\s*\\r?\\n-{2,}\\r?\\n([\\s\\S]*?)(?=\\n-{10,}|\\n={8,}|$)`, 'i');
        const m = texto.match(re);
        return m ? m[1].trim() : '';
      };

      const funcIds = extrairSecaoLog(analise, 'FUNCIONALIDADES IDENTIFICADAS');
      const arquivos = extrairSecaoLog(analise, 'ARQUIVOS ANALISADOS');

      log.sep();
      log.info('=== FUNCIONALIDADES IDENTIFICADAS ===');
      if (funcIds) {
        funcIds.split('\n').filter(l => l.trim()).forEach(l => log.info(`  ${l}`));
      } else {
        log.info('  (não extraído)');
      }
      log.sep();
      log.info('=== ARQUIVOS ANALISADOS ===');
      if (arquivos) {
        arquivos.split('\n').filter(l => l.trim()).forEach(l => log.info(`  ${l}`));
      } else {
        log.info('  (não extraído)');
      }
      log.sep();

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
