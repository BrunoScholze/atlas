// Lógica do popup do Agente de Chamados
// URL do servidor local — alterar para URL da VM quando migrar
const SERVER_URL = 'http://localhost:3000';

const ETAPAS = [
  { ate: 20,  texto: 'Lendo o PDF e entendendo o chamado...' },
  { ate: 50,  texto: 'Mapeando arquivos suspeitos...' },
  { ate: 90,  texto: 'Analisando o código...' },
  { ate: 140, texto: 'Rastreando o fluxo de ponta a ponta...' },
  { ate: 999, texto: 'Elaborando a solução...' }
];

const state = {
  funcionalidadesSelecionadas: [],
  pdfFile: null,
  dadosTicket: {}
};

let pollingInterval = null;
let timerInterval = null;
let currentRequestId = null;

// --- Inicialização ---

document.addEventListener('DOMContentLoaded', async () => {
  await verificarServidor();
  await carregarFuncionalidades();
  await carregarDadosTicket();
  configurarEventos();

  const emAndamento = await verificarAnaliseEmAndamento();
  if (!emAndamento) {
    await verificarResultadoSalvo();
  }
});

// --- Verificação do servidor ---

async function verificarServidor() {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.classList.add('online');
      text.textContent = 'Servidor online';
    } else throw new Error();
  } catch (e) {
    dot.classList.add('offline');
    text.textContent = 'Servidor offline';
  }
}

// --- Funcionalidades ---

async function carregarFuncionalidades() {
  const select = document.getElementById('funcionalidadesSelect');
  try {
    const res = await fetch(`${SERVER_URL}/funcionalidades`);
    const { funcionalidades } = await res.json();
    funcionalidades.forEach(nome => {
      const opt = document.createElement('option');
      opt.value = nome;
      opt.textContent = nome;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('[popup] Erro ao carregar funcionalidades:', e.message);
  }
}

function adicionarTag(nome) {
  if (state.funcionalidadesSelecionadas.includes(nome)) return;
  state.funcionalidadesSelecionadas.push(nome);

  const container = document.getElementById('tagsContainer');
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.dataset.valor = nome;
  tag.innerHTML = `${nome} <button class="tag-remove" title="Remover">×</button>`;
  tag.querySelector('.tag-remove').addEventListener('click', () => removerTag(nome));
  container.appendChild(tag);
  verificarBotao();
}

function removerTag(nome) {
  state.funcionalidadesSelecionadas = state.funcionalidadesSelecionadas.filter(f => f !== nome);
  const tag = document.querySelector(`[data-valor="${nome}"]`);
  if (tag) tag.remove();
  verificarBotao();
}

// --- Dados do Jira ---

async function carregarDadosTicket() {
  const statusEl = document.getElementById('jiraStatus');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('/browse/')) {
      statusEl.textContent = 'Abra um ticket do Jira para carregar os dados automaticamente.';
      return;
    }
    const dados = await chrome.tabs.sendMessage(tab.id, { action: 'getDadosTicket' });
    if (dados && dados.ticketId) {
      state.dadosTicket = dados;
      document.getElementById('ticketId').textContent = dados.ticketId;
      document.getElementById('ticketTitulo').textContent = dados.titulo || '(sem título)';
      statusEl.textContent = '✓ Dados carregados do Jira';
      statusEl.className = 'jira-status ok';
    } else {
      statusEl.textContent = 'Não foi possível carregar os dados do ticket.';
      statusEl.className = 'jira-status erro';
    }
  } catch (e) {
    statusEl.textContent = 'Não foi possível carregar os dados do ticket.';
    statusEl.className = 'jira-status erro';
  }
}

// --- Eventos ---

function configurarEventos() {
  const select = document.getElementById('funcionalidadesSelect');
  select.addEventListener('change', () => {
    if (select.value) { adicionarTag(select.value); select.value = ''; }
  });

  const pdfInput = document.getElementById('pdfInput');
  pdfInput.addEventListener('change', () => {
    if (pdfInput.files[0]) definirPdf(pdfInput.files[0]);
  });

  const dropzone = document.getElementById('dropzone');
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') definirPdf(file);
  });

  const checkObs = document.getElementById('checkObservacao');
  checkObs.addEventListener('change', () => {
    document.getElementById('observacaoTextarea').style.display = checkObs.checked ? 'block' : 'none';
  });

  document.getElementById('btnIniciar').addEventListener('click', analisar);
  document.getElementById('btnCancelar').addEventListener('click', cancelarAnalise);
  document.getElementById('btnCopiar').addEventListener('click', copiarResultado);
  document.getElementById('btnNovaAnalise').addEventListener('click', resetarFormulario);
  document.getElementById('btnTentarNovamente').addEventListener('click', resetarFormulario);
  document.getElementById('btnDownloadAnalise').addEventListener('click', () => downloadArquivo(`${SERVER_URL}/download/output`, 'analise.txt'));
  document.getElementById('btnDownloadLog').addEventListener('click', () => downloadArquivo(`${SERVER_URL}/download/log/latest`, 'log.log'));

  // Delegação de clique para o botão </> de cada bloco de código
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-toggle-view');
    if (btn) {
      const block = btn.closest('.diff-block, .code-block');
      if (block) block.classList.toggle('view-dark');
    }
  });
}

function definirPdf(file) {
  state.pdfFile = file;
  const dropzone = document.getElementById('dropzone');
  dropzone.classList.add('com-arquivo');
  document.getElementById('dropzoneContent').style.display = 'none';
  document.getElementById('dropzoneFilename').style.display = 'block';
  document.getElementById('dropzoneFilename').textContent = `✓ ${file.name}`;
  verificarBotao();
}

function verificarBotao() {
  document.getElementById('btnIniciar').disabled =
    !(state.funcionalidadesSelecionadas.length > 0 && state.pdfFile !== null);
}

// --- Análise ---

async function analisar() {
  mostrarTela('loading');

  const formData = new FormData();
  formData.append('ticketId', state.dadosTicket.ticketId || '');
  formData.append('titulo', state.dadosTicket.titulo || '');
  formData.append('descricao', state.dadosTicket.descricao || '');
  formData.append('prioridade', state.dadosTicket.prioridade || '');
  formData.append('tipo', state.dadosTicket.tipo || '');
  formData.append('responsavel', state.dadosTicket.responsavel || '');
  formData.append('comentarios', state.dadosTicket.comentarios || '');
  formData.append('historico', state.dadosTicket.historico || '');
  formData.append('funcionalidades', state.funcionalidadesSelecionadas.join(', '));
  formData.append('pdf', state.pdfFile);

  const checkObs = document.getElementById('checkObservacao');
  if (checkObs.checked) {
    const obs = document.getElementById('observacaoTextarea').value.trim();
    if (obs) formData.append('observacao', obs);
  }

  try {
    const res = await fetch(`${SERVER_URL}/analisar`, { method: 'POST', body: formData });
    const json = await res.json();

    if (!json.sucesso) {
      mostrarErro(json.erro || 'Erro ao iniciar análise.');
      return;
    }

    // Salva o requestId e o início no storage para recuperar se popup fechar
    const inicio = Date.now();
    await chrome.storage.local.set({ requestId: json.requestId, inicio });

    iniciarPolling(json.requestId, inicio);

  } catch (e) {
    mostrarErro('Não foi possível conectar ao servidor. Verifique se está rodando em localhost:3000.');
  }
}

// --- Polling + Timer ---

function iniciarPolling(requestId, inicio) {
  currentRequestId = requestId;
  pararPolling();
  mostrarTela('loading');
  atualizarTimer(inicio);

  timerInterval = setInterval(() => atualizarTimer(inicio), 1000);
  pollingInterval = setInterval(() => consultarStatus(requestId, inicio), 5000);

  // Consulta imediata após 5s
  setTimeout(() => consultarStatus(requestId, inicio), 5000);
}

function atualizarTimer(inicio) {
  const segundos = Math.floor((Date.now() - inicio) / 1000);
  document.getElementById('loadingTimer').textContent = segundos + 's';

  const etapa = ETAPAS.find(e => segundos <= e.ate) || ETAPAS[ETAPAS.length - 1];
  document.getElementById('loadingEtapa').textContent = etapa.texto;
}

async function consultarStatus(requestId, inicio) {
  try {
    const res = await fetch(`${SERVER_URL}/analisar/status/${requestId}`);
    const json = await res.json();

    if (json.status === 'done') {
      pararPolling();
      await chrome.storage.local.remove(['requestId', 'inicio']);
      await chrome.storage.local.set({ resultado: json.analise });
      renderizarResultado(json.analise);
      mostrarTela('resultado');
    } else if (json.status === 'error') {
      pararPolling();
      await chrome.storage.local.remove(['requestId', 'inicio']);
      mostrarErro(json.erro || 'Erro na análise.');
    } else if (json.status === 'cancelled') {
      pararPolling();
      await chrome.storage.local.remove(['requestId', 'inicio']);
      mostrarTela('formulario');
    }
    // status === 'running': continua o polling
  } catch (e) {
    console.warn('[popup] Erro ao consultar status:', e.message);
  }
}

function pararPolling() {
  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

async function cancelarAnalise() {
  if (!currentRequestId) return;
  const btn = document.getElementById('btnCancelar');
  btn.disabled = true;
  btn.textContent = 'Cancelando...';
  try {
    await fetch(`${SERVER_URL}/cancelar/${currentRequestId}`, { method: 'POST' });
  } catch (e) { /* servidor pode ter reiniciado */ }
  pararPolling();
  await chrome.storage.local.remove(['requestId', 'inicio']);
  currentRequestId = null;
  mostrarTela('formulario');
}

// Ao abrir o popup, verifica se há resultado salvo de análise anterior
async function verificarResultadoSalvo() {
  const { resultado } = await chrome.storage.local.get(['resultado']);
  if (!resultado) return false;
  renderizarResultado(resultado);
  mostrarTela('resultado');
  return true;
}

// Ao abrir o popup, verifica se havia análise em andamento
async function verificarAnaliseEmAndamento() {
  const { requestId, inicio } = await chrome.storage.local.get(['requestId', 'inicio']);
  if (!requestId) return;

  // Se passou mais de 30 min, considera expirado
  if (Date.now() - inicio > 30 * 60 * 1000) {
    await chrome.storage.local.remove(['requestId', 'inicio']);
    return;
  }

  console.log('[popup] Retomando análise em andamento:', requestId);
  iniciarPolling(requestId, inicio);
}

// --- Renderização do resultado ---

function renderizarResultado(texto) {
  const localizacao = extrairSecao(texto, 'LOCALIZAÇÃO DO PROBLEMA');
  const causa       = extrairSecao(texto, 'CAUSA PROVÁVEL');
  const resolver    = extrairSecao(texto, 'COMO RESOLVER');
  const arquivos    = extrairSecao(texto, 'ARQUIVOS ANALISADOS');
  const obs         = extrairSecao(texto, 'OBSERVAÇÕES');

  const temEstrutura = !!(localizacao || causa || resolver);

  if (temEstrutura) {
    document.getElementById('secaoEstruturada').style.display = 'block';
    document.getElementById('secaoBruta').style.display = 'none';
    document.getElementById('conteudoLocalizacao').innerHTML = renderMarkdown(localizacao);
    document.getElementById('conteudoCausa').innerHTML      = renderMarkdown(causa);
    document.getElementById('conteudoResolver').innerHTML   = renderMarkdown(resolver);
    document.getElementById('conteudoArquivos').innerHTML   = renderMarkdown(arquivos);
    document.getElementById('conteudoObservacoes').innerHTML = renderMarkdown(obs);
  } else {
    document.getElementById('secaoEstruturada').style.display = 'none';
    document.getElementById('secaoBruta').style.display = 'block';
    document.getElementById('conteudoBruto').innerHTML = renderMarkdown(texto);
  }
}

// -------------------------------------------------------
// Markdown renderer com suporte a diff estilo GitHub
// -------------------------------------------------------

function renderMarkdown(texto) {
  if (!texto) return '';
  const partes = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let ultimoTexto = '';
  let match;

  while ((match = codeBlockRegex.exec(texto)) !== null) {
    const textoAntes = texto.slice(lastIndex, match.index);
    if (textoAntes) {
      partes.push({ tipo: 'texto', conteudo: textoAntes });
      ultimoTexto = textoAntes;
    }
    partes.push({ tipo: 'codigo', lang: match[1] || '', conteudo: match[2], contexto: ultimoTexto });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < texto.length) {
    partes.push({ tipo: 'texto', conteudo: texto.slice(lastIndex) });
  }

  return partes.map(p =>
    p.tipo === 'codigo' ? renderCodeBlock(p.lang, p.conteudo, p.contexto) : renderTexto(p.conteudo)
  ).join('');
}

function extrairNomeArquivo(codigo, contexto) {
  // 1. Dentro do diff: --- a/arquivo.ts  ou  +++ b/arquivo.ts
  const mDiff = codigo.match(/^(?:---|\+\+\+)\s+[ab]?\/?(.+\.\w+)/m);
  if (mDiff) return mDiff[1].trim();

  // 2. No texto antes do bloco: `arquivo.ext` com extensão conhecida
  if (contexto) {
    const mCtx = contexto.match(/`([^`\s]+\.(?:ts|html|scss|p|js|css|json|kt|java|xml))`/);
    if (mCtx) return mCtx[1];
    const mSimples = contexto.match(/\b([\w.\-/]+\.(?:ts|html|scss|p|js|css))\b/);
    if (mSimples) return mSimples[1];
  }
  return null;
}

function renderCodeBlock(lang, codigo, contexto) {
  const isDiff = lang === 'diff' || (lang !== 'text' && detectaDiff(codigo));
  const nomeArquivo = extrairNomeArquivo(codigo, contexto || '');

  if (isDiff) {
    const todasLinhas = codigo.split('\n');
    const linhasHtml = todasLinhas.map((linha, idx) => {
      if (!linha && idx === todasLinhas.length - 1) return '';

      if (linha.startsWith('+++') || linha.startsWith('---')) {
        return `<div class="diff-meta"><span class="diff-linenum"></span><span class="diff-sign"> </span><span class="diff-content">${escaparHtml(linha)}</span></div>`;
      }
      if (linha.startsWith('+')) {
        return `<div class="diff-add"><span class="diff-linenum"></span><span class="diff-sign">+</span><span class="diff-content">${escaparHtml(linha.slice(1))}</span></div>`;
      }
      if (linha.startsWith('-')) {
        return `<div class="diff-rem"><span class="diff-linenum"></span><span class="diff-sign">−</span><span class="diff-content">${escaparHtml(linha.slice(1))}</span></div>`;
      }
      if (linha.startsWith('@@')) {
        return `<div class="diff-hunk"><span class="diff-linenum"></span><span class="diff-sign"> </span><span class="diff-content">${escaparHtml(linha)}</span></div>`;
      }
      const conteudo = linha.startsWith(' ') ? linha.slice(1) : linha;
      return `<div class="diff-ctx"><span class="diff-linenum"></span><span class="diff-sign"> </span><span class="diff-content">${escaparHtml(conteudo)}</span></div>`;
    }).join('');

    const fileHtml = nomeArquivo
      ? `<span class="diff-filename">📄 ${escaparHtml(nomeArquivo)}</span>`
      : `<span class="diff-lang-badge">${escaparHtml(lang || 'diff')}</span>`;

    const toggleBtn = `<button class="btn-toggle-view" title="Alternar modo escuro">&#60;/&#62;</button>`;

    return `<div class="diff-block"><div class="diff-header">${fileHtml}<span class="diff-header-right"><span class="diff-legend"><span class="leg-rem">− removido</span><span class="leg-add">+ adicionado</span></span>${toggleBtn}</span></div><div class="diff-lines">${linhasHtml}</div></div>`;
  }

  const esc = escaparHtml(codigo.replace(/\n$/, ''));
  const label = nomeArquivo ? `📄 ${escaparHtml(nomeArquivo)}` : escaparHtml(lang || 'código');
  const toggleBtn = `<button class="btn-toggle-view" title="Alternar modo escuro">&#60;/&#62;</button>`;
  return `<pre class="code-block"><div class="code-header"><span>${label}</span>${toggleBtn}</div><code>${esc}</code></pre>`;
}

function detectaDiff(codigo) {
  const linhas = codigo.split('\n').filter(l => l.trim());
  return linhas.some(l => l.startsWith('+')) || linhas.some(l => l.startsWith('-'));
}

function escaparHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTexto(texto) {
  let h = escaparHtml(texto);

  // Headers
  h = h.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // Bold + italic
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Inline code
  h = h.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

  // HR
  h = h.replace(/^---$/gm, '<hr class="md-hr">');

  // Ordered list items
  h = h.replace(/^(\d+)\. (.+)$/gm, '<li class="md-li"><span class="li-num">$1.</span>$2</li>');
  // Unordered list items
  h = h.replace(/^[-*] (.+)$/gm, '<li class="md-li"><span class="li-bullet">•</span>$1</li>');

  // Wrap consecutive li into lists
  h = h.replace(/(<li[\s\S]*?<\/li>\n?)+/g, m => `<ul class="md-list">${m}</ul>`);

  // Paragraphs
  const blocos = h.split(/\n\n+/);
  h = blocos.map(bloco => {
    bloco = bloco.trim();
    if (!bloco) return '';
    if (/^<(h[123]|ul|ol|hr|div|pre)/.test(bloco)) return bloco;
    return `<p class="md-p">${bloco.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return h;
}

// --- Download de arquivos ---

async function downloadArquivo(url, nomeArquivo) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Arquivo não disponível no servidor.');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch (e) {
    alert('Erro ao baixar: ' + e.message);
  }
}

function extrairSecao(texto, nomeSecao) {
  // Separadores do template têm 40 traços sozinhos na linha.
  // Diffs têm "--- a/arquivo.ts" com apenas 3 traços + texto.
  // O lookahead {10,}\s*[\r\n] para apenas em linhas só-de-traços, nunca em diff.
  const regex = new RegExp(
    `-{2,}[\\r\\n]+\\s*${nomeSecao}\\s*[\\r\\n]+-{2,}[\\r\\n]+([\\s\\S]*?)(?=[\\r\\n]+-{10,}\\s*[\\r\\n]|$)`,
    'i'
  );
  const match = texto.match(regex);
  return match ? match[1].trim() : '';
}

function copiarResultado() {
  const btn = document.getElementById('btnCopiar');
  let texto = '';

  if (document.getElementById('secaoBruta').style.display !== 'none') {
    texto = document.getElementById('conteudoBruto').textContent;
  } else {
    const ids = ['conteudoLocalizacao', 'conteudoCausa', 'conteudoResolver', 'conteudoArquivos', 'conteudoObservacoes'];
    texto = ids.map(id => document.getElementById(id).textContent).filter(Boolean).join('\n\n');
  }

  navigator.clipboard.writeText(texto).then(() => {
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = 'Copiar resultado'; }, 2000);
  });
}

// --- Controle de telas ---

function mostrarTela(tela) {
  document.getElementById('telaFormulario').style.display  = tela === 'formulario' ? 'block' : 'none';
  document.getElementById('telaLoading').style.display     = tela === 'loading'    ? 'flex'  : 'none';
  document.getElementById('telaResultado').style.display   = tela === 'resultado'  ? 'block' : 'none';
  document.getElementById('telaErro').style.display        = tela === 'erro'       ? 'flex'  : 'none';
  document.body.style.minHeight = tela === 'resultado' ? '660px' : '';
}

function mostrarErro(mensagem) {
  document.getElementById('erroMensagem').textContent = mensagem;
  mostrarTela('erro');
}

async function resetarFormulario() {
  pararPolling();
  chrome.storage.local.remove(['requestId', 'inicio', 'resultado']);
  try { await fetch(`${SERVER_URL}/limpar`, { method: 'POST' }); } catch (e) {}

  state.funcionalidadesSelecionadas = [];
  state.pdfFile = null;

  document.getElementById('tagsContainer').innerHTML = '';

  const dropzone = document.getElementById('dropzone');
  dropzone.classList.remove('com-arquivo');
  document.getElementById('dropzoneContent').style.display = 'flex';
  document.getElementById('dropzoneFilename').style.display = 'none';
  document.getElementById('pdfInput').value = '';

  document.getElementById('checkObservacao').checked = false;
  document.getElementById('observacaoTextarea').style.display = 'none';
  document.getElementById('observacaoTextarea').value = '';
  document.getElementById('btnIniciar').disabled = true;

  mostrarTela('formulario');
}
