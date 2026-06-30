// Servidor do Agente de Chamados — Atlas Code
//
// Arquitetura multi-projeto:
//   PROJETOS.md  — lista projetos: slug, nome, CLAUDE.md, Funcionalidades e status
//   Cada projeto tem seu próprio arquivo de Funcionalidades (ex: Funcionalidades-App-minha-prod.md)
//   POST /analisar recebe campo 'projeto' (slug) e:
//     (a) lê o CLAUDE.md correto via campo CLAUDE: do PROJETOS.md
//     (b) lê o arquivo de Funcionalidades correto via campo Funcionalidades: do PROJETOS.md
//   Adicionar novo projeto = novo bloco em PROJETOS.md + criar Funcionalidades-<projeto>.md
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { exec } = require('child_process');
const crypto = require('crypto');
let PDFParse; try { PDFParse = require('pdf-parse').PDFParse; } catch (e) { PDFParse = null; }

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Mapa em memória: requestId -> { status, analise, erro, inicio, ticketId, logPath }
const analises = {};

function lerTodasExecucoes() {
  const base = path.join(process.env.CONTEXT_PATH, 'execucoes');
  if (!fs.existsSync(base)) return [];
  const todos = [];
  for (const dir of fs.readdirSync(base)) {
    const dirPath = path.join(base, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    for (const arq of fs.readdirSync(dirPath)) {
      if (!arq.endsWith('.json')) continue;
      try { todos.push(JSON.parse(fs.readFileSync(path.join(dirPath, arq), 'utf8'))); } catch { /* ignora */ }
    }
  }
  return todos.sort((a, b) => b.timestamp - a.timestamp);
}

function lerTodosFeedbacks() {
  const base = path.join(process.env.CONTEXT_PATH, 'feedback');
  if (!fs.existsSync(base)) return [];
  const todos = [];
  for (const dir of fs.readdirSync(base)) {
    const dirPath = path.join(base, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    for (const arq of fs.readdirSync(dirPath)) {
      if (!arq.endsWith('.json')) continue;
      try { todos.push(JSON.parse(fs.readFileSync(path.join(dirPath, arq), 'utf8'))); } catch { /* ignora */ }
    }
  }
  return todos;
}

function salvarExecucao(dados) {
  try {
    const dir = path.join(process.env.CONTEXT_PATH, 'execucoes', dados.projeto || 'sem-projeto');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const nome = `${(dados.ticketId || 'sem-ticket').replace(/[^a-z0-9\-]/gi, '-')}-${dados.timestamp}.json`;
    fs.writeFileSync(path.join(dir, nome), JSON.stringify(dados, null, 2), 'utf8');
  } catch { /* silencioso */ }
}

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

function addLog(requestId, msg) {
  if (analises[requestId]) analises[requestId].logs.push(msg);
}

// Trunca texto mantendo o final (comentários/histórico recentes são mais relevantes)
function truncar(texto, max) {
  if (!texto || texto.length <= max) return texto || '';
  return '[...trecho anterior omitido...]\n' + texto.slice(texto.length - max);
}

// Extrai texto de um PDF — retorna null se falhar ou pdf-parse não estiver disponível
async function extrairTextoPDF(pdfPath) {
  if (!PDFParse || !pdfPath) return null;
  try {
    const url = 'file:///' + pdfPath.replace(/\\/g, '/');
    const parser = new PDFParse({ url });
    const data   = await parser.getText();
    const texto  = (data.text || '').trim().replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
    if (!texto) return null;
    const MAX = 8000;
    return texto.length > MAX
      ? texto.slice(0, MAX) + '\n[...PDF truncado — primeiros 8.000 chars extraídos]'
      : texto;
  } catch (e) {
    return null;
  }
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
      funcionalidades: meta.funcionalidades || 'Funcionalidades.md',
      repositorio: meta.repositorio || '',
      reposback:   meta.reposback  || '',
      azure: meta.azure || ''
    });
  }
  return projetos;
}

// -------------------------------------------------------
// Filtra funcionalidades relevantes para o chamado
// -------------------------------------------------------
function filtrarFuncionalidadesRelevantes(funcMd, ticket) {
  const STOP = new Set(['de','do','da','dos','das','o','a','os','as','um','uma',
    'em','no','na','nos','nas','por','para','com','que','se','ao','às','e','é',
    'ou','não','mas','foi','ser','ter','como','mais','já','quando','então','isso',
    'isso','pelo','pela','ele','ela','seu','sua','qual','este','esse','aqui']);

  // Texto de busca: ticket completo em minúsculas
  const textoTicket = [ticket.titulo, ticket.descricao, ticket.comentarios,
    ticket.historico, ticket.observacao].filter(Boolean).join(' ').toLowerCase();

  // Tokens relevantes do ticket (length > 3, sem stop words)
  const tokens = [...new Set(
    textoTicket.replace(/[^a-záàâãéêíóôõúç\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w))
  )];

  // Separa o arquivo em cabeçalho + seções
  const partes   = funcMd.split(/(?=\n## )/);
  const cabecalho = partes[0];
  const secoes    = partes.slice(1);

  if (secoes.length === 0) return funcMd;

  // Pontua cada seção pelo número de tokens do ticket que aparecem nela
  const pontuadas = secoes.map(secao => {
    const corpo = secao.toLowerCase();
    const score = tokens.reduce((acc, t) => acc + (corpo.includes(t) ? 1 : 0), 0);
    return { secao, score };
  });

  // Ordena por score, pega as 3 mais relevantes com score > 0
  const relevantes = pontuadas
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.secao);

  // Fallback: se nenhuma pontuou, devolve o arquivo completo
  if (relevantes.length === 0) return funcMd;

  return cabecalho + relevantes.join('');
}

// Detecta @caminho/arquivo.ext no texto e injeta conteúdo (máx 3 arquivos, 2000 chars cada)
function injetarArquivosReferenciados(texto, repoPath) {
  if (!texto || !repoPath) return '';
  const MAX_ARQUIVOS = 3;
  const MAX_CHARS    = 2000;
  const matches = [...texto.matchAll(/@([\w.\-/]+\.(?:ts|html|scss|p|js|css|json|kt|java|xml))/g)];
  if (!matches.length) return '';

  const vistos = new Set();
  const secoes = [];
  for (const m of matches) {
    const rel = m[1];
    if (rel.includes('..') || rel.startsWith('/')) continue;
    if (vistos.has(rel) || vistos.size >= MAX_ARQUIVOS) continue;
    vistos.add(rel);
    try {
      const conteudo = fs.readFileSync(path.join(repoPath, rel), 'utf8').slice(0, MAX_CHARS);
      secoes.push(`=== ARQUIVO REFERENCIADO: ${rel} ===\n${conteudo}\n${'='.repeat(42)}`);
    } catch { /* arquivo não existe — ignora */ }
  }
  return secoes.length ? '\n\n' + secoes.join('\n\n') : '';
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
DESCRICAO      : ${truncar(dados.descricao, 2000) || ''}
PRIORIDADE     : ${dados.prioridade || ''}
TIPO           : ${dados.tipo || ''}
RESPONSAVEL    : ${dados.responsavel || ''}
COMENTARIOS    : ${truncar(dados.comentarios, 3000) || ''}
HISTORICO      : ${truncar(dados.historico, 1500) || ''}
PROJETO        : ${dados.projeto || ''}
REPOS_BACK     : ${dados.reposBack || '(não configurado)'}
FUNCIONALIDADES:
OBSERVACAO     : ${truncar(dados.observacao, 1000) || 'Nenhuma observação adicional'}${injetarArquivosReferenciados(dados.observacao, dados.repoPath || '')}
ANEXO          : ${dados.pdfTexto
  ? '[CONTEÚDO EXTRAÍDO DO PDF]\n' + dados.pdfTexto
  : (dados.pdfPath || 'Nenhum PDF')}

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
// GET /arquivos?projeto=<slug> — lista arquivos do projeto para @menção
// -------------------------------------------------------
app.get('/arquivos', (req, res) => {
  const projetoSlug = req.query.projeto || '';
  let funcFile = 'Funcionalidades.md';

  if (projetoSlug) {
    try {
      const projetosMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'PROJETOS.md'), 'utf8');
      const proj = parseProjetos(projetosMd).find(p => p.slug === projetoSlug);
      if (proj && proj.funcionalidades) funcFile = proj.funcionalidades;
    } catch { /* usa default */ }
  }

  try {
    const funcMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, funcFile), 'utf8');
    const arquivos = [...new Set(
      [...funcMd.matchAll(/\b((?:src|back)\/[\w.\-/]+\.(?:ts|html|scss|p|js|css|json|kt|java|xml))\b/g)]
        .map(m => m[1])
    )].sort();
    res.json({ arquivos });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
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
// POST /feedback — salva resultado de uma análise
// -------------------------------------------------------
app.post('/feedback', (req, res) => {
  const { ticketId, titulo, projeto, status, tempoAnalise, analiseTexto, observacao } = req.body || {};

  const VALID_STATUS = ['resolved', 'unresolved', 'unresolved_refined'];
  if (!VALID_STATUS.includes(status)) {
    return res.status(400).json({ sucesso: false, erro: 'status inválido' });
  }

  // Extrai funcionalidades e arquivos analisados do texto da análise
  const extrairSecao = (texto, secao) => {
    const re = new RegExp(`-{2,}\\s*\\r?\\n\\s*${secao}\\s*\\r?\\n-{2,}\\r?\\n([\\s\\S]*?)(?=\\n-{10,}|\\n={8,}|$)`, 'i');
    const m = (texto || '').match(re);
    return m ? m[1].trim() : '';
  };

  const funcText = extrairSecao(analiseTexto, 'FUNCIONALIDADES IDENTIFICADAS');
  const arqText  = extrairSecao(analiseTexto, 'ARQUIVOS ANALISADOS');

  const funcionalidades    = funcText ? funcText.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').split(' —')[0].trim()) : [];
  const arquivosAnalisados = arqText  ? [...arqText.matchAll(/`([^`]+\.\w+)`/g)].map(m => m[1]) : [];

  const slugProjeto = (projeto || 'sem-projeto').replace(/[^a-z0-9\-]/gi, '-');
  const feedbackDir = path.join(process.env.CONTEXT_PATH, 'feedback', slugProjeto);
  if (!fs.existsSync(feedbackDir)) fs.mkdirSync(feedbackDir, { recursive: true });

  const timestamp = Date.now();
  const nomeArq   = `${(ticketId || 'sem-ticket').replace(/[^a-z0-9\-]/gi, '-')}-${timestamp}.json`;
  const dados = {
    ticketId:         ticketId         || '',
    titulo:           titulo           || '',
    projeto:          projeto          || '',
    funcionalidades,
    arquivosAnalisados,
    observacao:       (observacao || '').slice(0, 500),
    tempoAnalise:     Number(tempoAnalise) || 0,
    timestamp,
    status
  };

  try {
    fs.writeFileSync(path.join(feedbackDir, nomeArq), JSON.stringify(dados, null, 2), 'utf8');
    res.json({ sucesso: true });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// -------------------------------------------------------
// GET /feedback/stats — métricas agregadas
// -------------------------------------------------------
app.get('/feedback/stats', (req, res) => {
  const feedbackBase = path.join(process.env.CONTEXT_PATH, 'feedback');
  if (!fs.existsSync(feedbackBase)) {
    const agora = Date.now();
    const porSemana = Array.from({ length: 6 }, (_, i) => {
      const fim   = agora - i * 7 * 24 * 3600 * 1000;
      const label = new Date(fim).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      return { label, total: 0, resolvidos: 0 };
    }).reverse();
    return res.json({ total: 0, resolvidos: 0, naoResolvidos: 0, tempoMedio: 0, porSemana, execucoes: [] });
  }

  const todos = [];
  for (const dir of fs.readdirSync(feedbackBase)) {
    const dirPath = path.join(feedbackBase, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    for (const arq of fs.readdirSync(dirPath)) {
      if (!arq.endsWith('.json')) continue;
      try {
        todos.push(JSON.parse(fs.readFileSync(path.join(dirPath, arq), 'utf8')));
      } catch { /* ignora arquivo corrompido */ }
    }
  }

  todos.sort((a, b) => b.timestamp - a.timestamp);

  const total         = todos.length;
  const resolvidos    = todos.filter(t => t.status === 'resolved').length;
  const naoResolvidos = total - resolvidos;

  const comTempo = todos.filter(t => t.tempoAnalise > 0);
  const tempoMedio = comTempo.length > 0
    ? Math.round(comTempo.reduce((s, t) => s + t.tempoAnalise, 0) / comTempo.length)
    : 0;

  // Últimas 6 semanas
  const agora = Date.now();
  const porSemana = Array.from({ length: 6 }, (_, i) => {
    const ini   = agora - (i + 1) * 7 * 24 * 3600 * 1000;
    const fim   = agora - i * 7 * 24 * 3600 * 1000;
    const label = new Date(fim).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return {
      label,
      total:      todos.filter(t => t.timestamp >= ini && t.timestamp < fim).length,
      resolvidos: todos.filter(t => t.timestamp >= ini && t.timestamp < fim && t.status === 'resolved').length
    };
  }).reverse();

  res.json({ total, resolvidos, naoResolvidos, tempoMedio, porSemana, execucoes: todos.slice(0, 100) });
});

// -------------------------------------------------------
// GET /feedback/list — lista completa de execuções (paginado opcionalmente)
// -------------------------------------------------------
app.get('/feedback/list', (req, res) => {
  const feedbackBase = path.join(process.env.CONTEXT_PATH, 'feedback');
  if (!fs.existsSync(feedbackBase)) return res.json({ total: 0, page: 1, limit: 50, execucoes: [] });

  const todos = [];
  for (const dir of fs.readdirSync(feedbackBase)) {
    const dirPath = path.join(feedbackBase, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    for (const arq of fs.readdirSync(dirPath)) {
      if (!arq.endsWith('.json')) continue;
      try { todos.push(JSON.parse(fs.readFileSync(path.join(dirPath, arq), 'utf8'))); } catch { /* ignora */ }
    }
  }
  todos.sort((a, b) => b.timestamp - a.timestamp);
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const start = (page - 1) * limit;
  res.json({ total: todos.length, page, limit, execucoes: todos.slice(start, start + limit) });
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
// POST /refinar — refinamento usando --continue
// -------------------------------------------------------
app.post('/refinar', (req, res) => {
  const { refinamento, projeto, ticketId, titulo } = req.body;
  if (!refinamento || !refinamento.trim()) {
    return res.status(400).json({ sucesso: false, erro: 'Texto de refinamento obrigatório.' });
  }

  const requestId = crypto.randomUUID();
  const inicio = Date.now();

  const logsDir = path.join(process.env.CONTEXT_PATH, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, 'agent.log');

  analises[requestId] = { status: 'running', inicio, logPath: logFile, logs: [] };
  res.json({ sucesso: true, requestId });

  executarRefinamento(requestId, refinamento, projeto || '', ticketId || '', titulo || '', inicio, logFile);
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

  analises[requestId] = { status: 'running', inicio, ticketId, logPath: logFile, logs: [] };

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
    // Lê arquivos de contexto — resolve projeto e carrega arquivos corretos
    const projetoSlug = body.projeto || '';
    let claudeFile = 'CLAUDE.md';
    let funcFile   = 'Funcionalidades.md';

    if (projetoSlug) {
      try {
        const projetosMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'PROJETOS.md'), 'utf8');
        const proj = parseProjetos(projetosMd).find(p => p.slug === projetoSlug);
        if (proj) {
          claudeFile = proj.claude           || 'CLAUDE.md';
          funcFile   = proj.funcionalidades  || 'Funcionalidades.md';
          log.info(`Projeto: ${projetoSlug} → CLAUDE: ${claudeFile} | Funcionalidades: ${funcFile}`);
          addLog(requestId, `Projeto identificado: ${proj.nome}`);
        } else {
          log.warn(`Projeto '${projetoSlug}' não encontrado em PROJETOS.md — usando arquivos padrão`);
          addLog(requestId, 'Projeto não identificado — usando configuração padrão');
        }
      } catch (e) { log.warn(`Não leu PROJETOS.md: ${e.message}`); }
    }

    log.info(`Lendo ${claudeFile}...`);
    addLog(requestId, `Carregando instruções do agente (${claudeFile})...`);
    const claudeMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, claudeFile), 'utf8');
    log.info(`${claudeFile}: ${claudeMd.length} chars`);
    addLog(requestId, `Instruções carregadas — ${claudeMd.length.toLocaleString('pt-BR')} chars`);

    log.info(`Lendo ${funcFile}...`);
    addLog(requestId, `Carregando mapa de funcionalidades (${funcFile})...`);
    const funcionalidadesMdCompleto = fs.readFileSync(path.join(process.env.CONTEXT_PATH, funcFile), 'utf8');
    log.info(`${funcFile}: ${funcionalidadesMdCompleto.length} chars`);
    const nFuncTotal = (funcionalidadesMdCompleto.match(/^## /gm) || []).length;

    // Filtra apenas as funcionalidades relevantes para o chamado
    const funcionalidadesMd = filtrarFuncionalidadesRelevantes(funcionalidadesMdCompleto, body);
    const nFuncFiltrado = (funcionalidadesMd.match(/^## /gm) || []).length;

    if (nFuncFiltrado < nFuncTotal) {
      log.info(`Funcionalidades filtradas: ${nFuncFiltrado}/${nFuncTotal} selecionadas por relevância`);
      addLog(requestId, `${nFuncFiltrado} de ${nFuncTotal} funcionalidades selecionadas por relevância`);
    } else {
      log.info(`Funcionalidades: ${nFuncTotal} (sem filtro aplicado — baixa correspondência)`);
      addLog(requestId, `${nFuncTotal} funcionalidades carregadas (correspondência ampla)`);
    }

    // Extrai texto do PDF antes de montar o prompt
    const dados = { ...body, pdfPath };
    if (pdfPath) {
      addLog(requestId, 'Extraindo texto do PDF...');
      const pdfTexto = await extrairTextoPDF(pdfPath);
      if (pdfTexto) {
        dados.pdfTexto = pdfTexto;
        log.info(`PDF extraído: ${pdfTexto.length} chars`);
        addLog(requestId, `PDF extraído — ${pdfTexto.length.toLocaleString('pt-BR')} chars de texto`);
      } else {
        log.warn('Extração do PDF falhou — agente vai ler o arquivo diretamente');
        addLog(requestId, 'PDF disponível para leitura direta pelo agente');
      }
    }

    // Resolve repoPath (front) e reposBack (back Progress) antes de montar o prompt
    let repoPath  = process.env.REPO_PATH;
    let reposBack = '';
    if (projetoSlug) {
      try {
        const projetosMdTmp = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'PROJETOS.md'), 'utf8');
        const projTmp = parseProjetos(projetosMdTmp).find(p => p.slug === projetoSlug);
        if (projTmp && projTmp.repositorio) repoPath  = path.join(process.env.CONTEXT_PATH, projTmp.repositorio);
        if (projTmp && projTmp.reposback)   reposBack = path.join(process.env.CONTEXT_PATH, projTmp.reposback);
      } catch { /* usa default */ }
    }
    dados.repoPath  = repoPath;
    dados.reposBack = reposBack;

    // Monta prompt
    log.info('Montando prompt...');
    addLog(requestId, 'Montando contexto completo do chamado...');
    const prompt = montarPrompt(dados, claudeMd, funcionalidadesMd);
    log.info(`Prompt montado: ${prompt.length} chars`);
    addLog(requestId, `Contexto pronto — ${prompt.length.toLocaleString('pt-BR')} chars`);

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
    const isWin   = process.platform === 'win32';
    const ps1Path = path.join(process.env.CONTEXT_PATH, 'scripts', 'run-claude.ps1');
    const shPath  = path.join(process.env.CONTEXT_PATH, 'scripts', 'run-claude.sh');

    log.info(`Script path: ${isWin ? ps1Path : shPath}`);
    log.info(`Output path: ${outputPath}`);
    log.info(`Repo path: ${repoPath}`);
    log.info(`Log file: ${logFile}`);
    log.sep();
    log.info(`Iniciando ${isWin ? 'PowerShell' : 'Bash'}...`);

    const env = { ...process.env };

    const esc = (p) => `"${p}"`;
    const comando = isWin
      ? `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ${esc(ps1Path)} ${esc(promptPath)} ${esc(outputPath)} ${esc(repoPath)} ${esc(logFile)}`
      : `bash ${esc(shPath)} ${esc(promptPath)} ${esc(outputPath)} ${esc(repoPath)} ${esc(logFile)}`;

    log.debug(`Comando: ${comando}`);
    const execInicio = Date.now();

    addLog(requestId, '→ Agente Claude Code inicializado');

    // Mensagens de atividade enquanto o agente trabalha (a cada ~10s)
    const mensagensAtividade = [
      'Lendo o chamado e interpretando o PDF...',
      'Identificando funcionalidades relacionadas ao problema...',
      'Mapeando arquivos suspeitos no repositório...',
      'Navegando pelos arquivos do código-fonte...',
      'Analisando o template HTML...',
      'Inspecionando o componente TypeScript...',
      'Rastreando sub-componentes e dependências...',
      'Verificando o fluxo de dados entre camadas...',
      'Cruzando evidências com o comportamento relatado...',
      'Consultando backend Progress OpenEdge...',
      'Formulando diagnóstico...',
      'Redigindo correção e diff de código...',
    ];
    let msgIdx = 0;
    const actInterval = setInterval(() => {
      if (analises[requestId] && analises[requestId].status === 'running') {
        const msg = msgIdx < mensagensAtividade.length
          ? mensagensAtividade[msgIdx++]
          : `Processando... ${Math.floor((Date.now() - execInicio) / 1000)}s`;
        addLog(requestId, msg);
      }
    }, 10000);

    const childProcess = exec(comando, { timeout: 0, env }, (err, stdout, stderr) => {
      clearInterval(actInterval);
      const duracao = ((Date.now() - execInicio) / 1000).toFixed(1);
      log.sep();
      log.info(`PowerShell finalizado. Duração: ${duracao}s`);
      const promptTokens = Math.round(prompt.length / 4);
      addLog(requestId, `Análise concluída em ${duracao}s`);

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

      if (analise && analise.trim()) {
        const outputTokens = Math.round(analise.length / 4);
        const totalTokens  = promptTokens + outputTokens;
        log.info(`Tokens estimados — entrada: ~${promptTokens} | saída: ~${outputTokens} | total: ~${totalTokens}`);
        addLog(requestId, `Tokens estimados — entrada: ~${promptTokens.toLocaleString('pt-BR')} | saída: ~${outputTokens.toLocaleString('pt-BR')} | total: ~${totalTokens.toLocaleString('pt-BR')}`);
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

      // Remove qualquer texto que o agente escreva antes do separador do template
      const idxTemplate = analise.indexOf('========================================');
      if (idxTemplate > 0) analise = analise.slice(idxTemplate);

      const temTemplate      = analise.trim().startsWith('========');
      const temFuncionalidade = funcIds.trim().length > 0;
      const statusFinal      = (temTemplate && temFuncionalidade) ? 'done' : 'no_subject';

      if (statusFinal === 'no_subject') {
        log.warn('Nenhuma funcionalidade identificada — retornando no_subject');
      }

      analises[requestId] = { status: statusFinal, analise, inicio, logPath: logFile };

      // Salva registro da execução para o dashboard
      // Nota: funcIds e arquivos já foram extraídos nas linhas anteriores do mesmo callback
      const execTokensOut = Math.round(analise.length / 4);
      salvarExecucao({
        requestId,
        ticketId:          body.ticketId || '',
        titulo:            body.titulo || '',
        projeto:           projetoSlug || '',
        prioridade:        body.prioridade || '',
        tipo:              body.tipo || '',
        tempoAnalise:      Math.round((Date.now() - execInicio) / 1000),
        tokensEntrada:     promptTokens,
        tokensSaida:       execTokensOut,
        tokensTotal:       promptTokens + execTokensOut,
        funcionalidades:   funcIds
          ? funcIds.split('\n').filter(l => l.trim().startsWith('-'))
              .map(l => l.replace(/^[-\s]+/, '').split(' —')[0].trim()).filter(Boolean)
          : [],
        arquivosAnalisados: arquivos
          ? [...arquivos.matchAll(/\b((?:src|back)[\\/][\w.\-\\/]+\.\w+)/g)].map(m => m[1])
          : [],
        analisouBack:      /\w+\.(?:p|i\d*)\b/i.test(arquivos || ''),
        problemaNoBack:    /^DIFF_START arquivo:[^\n]+\.(?:p|i\d*)\b/im.test(analise || ''),
        responsavel:       body.responsavel || '',
        temPdf:            !!pdfPath,
        temObservacao:     !!(body.observacao && body.observacao.trim()),
        observacao:        (body.observacao || '').slice(0, 500),
        descricao:         (body.descricao || '').slice(0, 2000),
        comentarios:       (body.comentarios || '').slice(0, 1000),
        pdfTexto:          (dados.pdfTexto || '').slice(0, 8000),
        isRefinamento:     false,
        textoRefinamento:  null,
        analise:           analise.slice(0, 30000),
        statusFinal,
        timestamp:         Date.now()
      });

      log.sep();
      log.info(`=== ANÁLISE CONCLUÍDA — status: ${statusFinal} ===`);
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

// -------------------------------------------------------
// Refinamento em background (--continue)
// -------------------------------------------------------
async function executarRefinamento(requestId, refinamento, projetoSlug, ticketId, titulo, inicio, logFile) {
  const log = criarLogger(requestId, logFile);
  log.sep();
  log.info('=== REFINAMENTO INICIADO (--continue) ===');
  log.sep();
  log.info(`RequestId  : ${requestId}`);
  log.info(`Refinamento: ${refinamento.slice(0, 80)}${refinamento.length > 80 ? '...' : ''}`);
  log.sep();

  addLog(requestId, 'Preparando contexto de acompanhamento...');

  // Lê análise anterior para incluir como contexto no prompt
  let analiseAnterior = '';
  try {
    analiseAnterior = fs.readFileSync(process.env.OUTPUT_PATH, 'utf8');
    if (analiseAnterior.charCodeAt(0) === 0xFEFF) analiseAnterior = analiseAnterior.slice(1);
    analiseAnterior = analiseAnterior.trim();
  } catch (e) { /* sem contexto anterior */ }

  let repoPath = process.env.REPO_PATH;
  if (projetoSlug) {
    try {
      const projetosMd = fs.readFileSync(path.join(process.env.CONTEXT_PATH, 'PROJETOS.md'), 'utf8');
      const proj = parseProjetos(projetosMd).find(p => p.slug === projetoSlug);
      if (proj && proj.repositorio) repoPath = path.join(process.env.CONTEXT_PATH, proj.repositorio);
    } catch (e) { /* usa default */ }
  }

  const promptRefinamento = analiseAnterior
    ? `Você é o agente de chamados que acabou de gerar a análise abaixo.\nO desenvolvedor tem uma pergunta de acompanhamento sobre a mesma análise.\n\nRegras:\n- Use o contexto da análise anterior para responder diretamente\n- Só leia arquivos do repositório se for estritamente necessário para a nova pergunta\n- Se atualizar a análise, mantenha o mesmo formato de output com separadores ---\n- Se a resposta for simples, responda em texto livre objetivo\n\n=== ANÁLISE ANTERIOR ===\n${analiseAnterior}\n\n=== PERGUNTA DO DESENVOLVEDOR ===\n${refinamento}${injetarArquivosReferenciados(refinamento, repoPath)}`
    : refinamento + injetarArquivosReferenciados(refinamento, repoPath);

  const refinamentoPath = path.join(process.env.CONTEXT_PATH, 'refinamento_temp.txt');
  fs.writeFileSync(refinamentoPath, promptRefinamento, 'utf8');
  log.info(`Prompt de acompanhamento: ${promptRefinamento.length} chars`);

  const isWin  = process.platform === 'win32';
  const ps1Path = path.join(process.env.CONTEXT_PATH, 'scripts', 'run-claude.ps1');
  const shPath  = path.join(process.env.CONTEXT_PATH, 'scripts', 'run-claude.sh');
  const outputPath = process.env.OUTPUT_PATH;
  const esc = (p) => `"${p}"`;

  const comando = isWin
    ? `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ${esc(ps1Path)} ${esc(refinamentoPath)} ${esc(outputPath)} ${esc(repoPath)} ${esc(logFile)}`
    : `bash ${esc(shPath)} ${esc(refinamentoPath)} ${esc(outputPath)} ${esc(repoPath)} ${esc(logFile)}`;

  log.debug(`Comando: ${comando}`);
  addLog(requestId, 'Enviando contexto adicional ao agente...');

  const execInicio = Date.now();
  const msgs = ['Aguardando resposta refinada...', 'Processando contexto adicional...', 'Elaborando análise atualizada...'];
  let msgIdx = 0;
  const actInterval = setInterval(() => {
    if (analises[requestId] && analises[requestId].status === 'running' && msgIdx < msgs.length) {
      addLog(requestId, msgs[msgIdx++]);
    }
  }, 10000);

  const env = { ...process.env };
  exec(comando, { timeout: 0, env }, (err, stdout, stderr) => {
    clearInterval(actInterval);
    const duracao = ((Date.now() - execInicio) / 1000).toFixed(1);
    log.sep();
    log.info(`Refinamento finalizado. Duração: ${duracao}s`);
    addLog(requestId, `Refinamento concluído em ${duracao}s`);

    if (stderr && stderr.trim()) log.warn(`stderr: ${stderr.trim()}`);

    try { fs.unlinkSync(refinamentoPath); log.info('refinamento_temp.txt deletado'); } catch (e) { /* ignora */ }

    if (analises[requestId] && analises[requestId].status === 'cancelled') {
      log.info('Refinamento cancelado pelo usuário');
      return;
    }

    if (err && err.code !== 0) {
      log.error(`Erro no refinamento. code=${err.code} | msg=${err.message}`);
      analises[requestId] = { status: 'session_expired', inicio, logPath: logFile };
      return;
    }

    let analise = '';
    try {
      analise = fs.readFileSync(outputPath, 'utf8');
      if (analise.charCodeAt(0) === 0xFEFF) analise = analise.slice(1);
      log.info(`output.txt lido: ${analise.length} chars`);
    } catch (e) {
      log.error(`Erro ao ler output.txt: ${e.message}`);
    }

    if (!analise.trim()) {
      log.warn('Output vazio — sessão provavelmente expirada');
      analises[requestId] = { status: 'session_expired', inicio, logPath: logFile };
      return;
    }

    analises[requestId] = { status: 'done', analise, inicio, logPath: logFile };

    const refTokensIn  = Math.round(promptRefinamento.length / 4);
    const refTokensOut = Math.round(analise.length / 4);
    const extrairSecaoRefArr = (texto, secao) => {
      const re = new RegExp(`-{2,}\\s*\\r?\\n\\s*${secao}\\s*\\r?\\n-{2,}\\r?\\n([\\s\\S]*?)(?=\\n-{10,}|\\n={8,}|$)`, 'i');
      const m = texto.match(re);
      return m ? m[1].trim() : '';
    };
    const funcRaw = extrairSecaoRefArr(analise, 'FUNCIONALIDADES IDENTIFICADAS');
    const arqRaw  = extrairSecaoRefArr(analise, 'ARQUIVOS ANALISADOS');
    salvarExecucao({
      requestId,
      ticketId:          ticketId || '',
      titulo:            titulo || '',
      projeto:           projetoSlug || '',
      prioridade:        '',
      tipo:              '',
      tempoAnalise:      Math.round((Date.now() - execInicio) / 1000),
      tokensEntrada:     refTokensIn,
      tokensSaida:       refTokensOut,
      tokensTotal:       refTokensIn + refTokensOut,
      funcionalidades:   funcRaw
        ? funcRaw.split('\n').filter(l => l.trim().startsWith('-'))
            .map(l => l.replace(/^[-\s]+/, '').split(' —')[0].trim()).filter(Boolean)
        : [],
      arquivosAnalisados: arqRaw
        ? [...arqRaw.matchAll(/\b((?:src|back)[\\/][\w.\-\\/]+\.\w+)/g)].map(m => m[1])
        : [],
      analisouBack:      /\w+\.(?:p|i\d*)\b/i.test(arqRaw || ''),
      problemaNoBack:    /^DIFF_START arquivo:[^\n]+\.(?:p|i\d*)\b/im.test(analise || ''),
      temPdf:            false,
      temObservacao:     false,
      observacao:        '',
      isRefinamento:     true,
      textoRefinamento:  refinamento,
      statusFinal:       'done',
      timestamp:         Date.now()
    });

    log.info('=== REFINAMENTO CONCLUÍDO ===');
    log.sep();
  });
}

// -------------------------------------------------------
// Dashboard — endpoints de dados
// -------------------------------------------------------
app.get('/dashboard/overview', (req, res) => {
  const todos     = lerTodasExecucoes();
  const feedbacks = lerTodosFeedbacks();

  const total          = todos.length;
  const resolvidos     = feedbacks.filter(f => f.status === 'resolved').length;
  const totalFeedback  = feedbacks.length;
  const taxaResolucao  = totalFeedback > 0 ? Math.round((resolvidos / totalFeedback) * 1000) / 10 : 0;
  const comTempo       = todos.filter(e => e.tempoAnalise > 0);
  const tempoMedio     = comTempo.length > 0
    ? Math.round(comTempo.reduce((s, e) => s + e.tempoAnalise, 0) / comTempo.length)
    : 0;
  const tokensTotal = todos.reduce((s, e) => s + (e.tokensTotal || 0), 0);

  const agora = Date.now();
  const porDia = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(agora - (27 - i) * 24 * 3600 * 1000);
    d.setHours(0, 0, 0, 0);
    const ini = d.getTime();
    const fim = ini + 24 * 3600 * 1000;
    const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const execDia = todos.filter(e => e.timestamp >= ini && e.timestamp < fim).length;
    const fbDia   = feedbacks.filter(f => f.timestamp >= ini && f.timestamp < fim);
    return {
      data,
      total:      execDia > 0 ? execDia : fbDia.length,
      resolvidos: execDia > 0
        ? todos.filter(e => e.timestamp >= ini && e.timestamp < fim && e.statusFinal === 'done').length
        : fbDia.filter(f => f.status === 'resolved').length
    };
  });

  const statusCounts = {};
  todos.forEach(e => { statusCounts[e.statusFinal] = (statusCounts[e.statusFinal] || 0) + 1; });
  const porStatus = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  const projCounts = {};
  todos.forEach(e => { projCounts[e.projeto || 'sem-projeto'] = (projCounts[e.projeto || 'sem-projeto'] || 0) + 1; });
  const porProjeto = Object.entries(projCounts)
    .map(([projeto, total]) => ({ projeto, total }))
    .sort((a, b) => b.total - a.total);

  res.json({ kpis: { totalAnalises: total, taxaResolucao, tempoMedio, tokensTotal }, porDia, porStatus, porProjeto });
});

app.get('/dashboard/execucoes', (req, res) => {
  const { page = '1', limit = '50', projeto, status, busca, periodo } = req.query;
  const feedbacks = lerTodosFeedbacks();
  const fbMap = {};
  feedbacks.forEach(f => {
    const key = f.ticketId;
    if (!fbMap[key] || f.timestamp > fbMap[key].timestamp) fbMap[key] = f;
  });
  let todos = lerTodasExecucoes().map(e => ({
    ...e,
    feedbackStatus: fbMap[e.ticketId]?.status || null
  }));

  if (projeto) todos = todos.filter(e => e.projeto === projeto);
  if (status)  todos = todos.filter(e => e.statusFinal === status);
  if (busca) {
    const q = busca.toLowerCase();
    todos = todos.filter(e =>
      (e.ticketId || '').toLowerCase().includes(q) ||
      (e.titulo || '').toLowerCase().includes(q)
    );
  }
  if (periodo && periodo !== 'tudo') {
    if (periodo === 'hoje') {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      todos = todos.filter(e => e.timestamp >= hoje.getTime());
    } else {
      const dias  = periodo === '7d' ? 7 : 30;
      const limite = Date.now() - dias * 24 * 3600 * 1000;
      todos = todos.filter(e => e.timestamp >= limite);
    }
  }

  const total  = todos.length;
  const pg     = Math.max(1, parseInt(page));
  const lim    = Math.min(200, Math.max(1, parseInt(limit)));
  const inicio = (pg - 1) * lim;
  res.json({ total, page: pg, limit: lim, execucoes: todos.slice(inicio, inicio + lim) });
});

app.get('/dashboard/execucoes/:requestId', (req, res) => {
  const exec = lerTodasExecucoes().find(e => e.requestId === req.params.requestId);
  if (!exec) return res.status(404).json({ erro: 'Não encontrado' });
  res.json(exec);
});

app.get('/dashboard/efetividade', (req, res) => {
  const todos     = lerTodasExecucoes();
  const feedbacks = lerTodosFeedbacks();

  const agora = Date.now();
  const taxaPorSemana = Array.from({ length: 8 }, (_, i) => {
    const ini = agora - (8 - i) * 7 * 24 * 3600 * 1000;
    const fim = agora - (7 - i) * 7 * 24 * 3600 * 1000;
    const label = new Date(fim).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const execSem = todos.filter(e => e.timestamp >= ini && e.timestamp < fim).length;
    const fbSem   = feedbacks.filter(f => f.timestamp >= ini && f.timestamp < fim);
    return {
      semana:     label,
      total:      execSem > 0 ? execSem : fbSem.length,
      resolvidos: execSem > 0
        ? todos.filter(e => e.timestamp >= ini && e.timestamp < fim && e.statusFinal === 'done').length
        : fbSem.filter(f => f.status === 'resolved').length
    };
  });

  const comRefinamento  = todos.filter(e => e.isRefinamento).length;
  const semRefinamento  = todos.filter(e => !e.isRefinamento).length;

  const funcCounts = {};
  todos.forEach(e => (e.funcionalidades || []).forEach(f => { funcCounts[f] = (funcCounts[f] || 0) + 1; }));
  const topFuncionalidades = Object.entries(funcCounts)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total).slice(0, 10);

  const arqCounts = {};
  todos.forEach(e => (e.arquivosAnalisados || []).forEach(a => {
    const nome = a.split(/[\\/]/).pop();
    arqCounts[nome] = (arqCounts[nome] || 0) + 1;
  }));
  const topArquivos = Object.entries(arqCounts)
    .map(([arquivo, total]) => ({ arquivo, total }))
    .sort((a, b) => b.total - a.total).slice(0, 10);

  const refinamentos = todos
    .filter(e => e.isRefinamento && e.textoRefinamento)
    .slice(0, 20)
    .map(e => ({ ticketId: e.ticketId, titulo: e.titulo, textoRefinamento: e.textoRefinamento, statusFinal: e.statusFinal, timestamp: e.timestamp }));

  res.json({ taxaPorSemana, refinamentoStats: { comRefinamento, semRefinamento }, topFuncionalidades, topArquivos, refinamentos });
});

// Dashboard — serve build React
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard', 'dist')));
app.get('/dashboard', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'dist', 'index.html'))
);
app.get('/dashboard/*', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'dist', 'index.html'))
);

app.listen(PORT, () => {
  console.log(`[Servidor] Rodando em http://localhost:${PORT}`);
  console.log(`[Servidor] Logs em: ${path.join(process.env.CONTEXT_PATH || '.', 'logs')}`);
  console.log(`[Servidor] Log mais recente: http://localhost:${PORT}/log/latest`);
});
