// Atlas Code — popup controller
const SERVER_URL = 'http://localhost:3000';

const ETAPAS = [
  { ate: 20,  texto: 'Lendo o PDF e entendendo o chamado...' },
  { ate: 50,  texto: 'Mapeando arquivos suspeitos...' },
  { ate: 90,  texto: 'Analisando o código...' },
  { ate: 140, texto: 'Rastreando o fluxo de ponta a ponta...' },
  { ate: 999, texto: 'Elaborando a solução...' }
];

const state = {
  pdfFile: null,
  dadosTicket: {},
  projetoSelecionado: null,
  projetoNome: null,
  projetoAzure: null
};

let pollingInterval = null;
let timerInterval   = null;
let currentRequestId = null;
let isDark = true;

// ============================================================ INIT

document.addEventListener('DOMContentLoaded', async () => {
  mostrarTela('selecao');
  await verificarServidor();
  await carregarProjetos();
  await carregarDadosTicket();
  configurarEventos();

  const emAndamento = await verificarAnaliseEmAndamento();
  if (!emAndamento) await verificarResultadoSalvo();
});

// ============================================================ TEMA

function toggleTheme() {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.getElementById('themeLabel').textContent = isDark ? 'Modo claro' : 'Modo escuro';
  const src = isDark ? 'logobranco.png' : 'logoPreto.png';
  const logoMain = document.getElementById('logoMain');
  const logoSm   = document.getElementById('logoSm');
  if (logoMain) logoMain.src = src;
  if (logoSm)   logoSm.src   = src;
}

// ============================================================ NAVEGAÇÃO

function irParaFormulario() {
  if (!state.projetoSelecionado) return;
  document.getElementById('s2ProjectName').textContent = state.projetoNome || state.projetoSelecionado;
  mostrarTela('formulario');
}

function voltarParaSelecao() {
  mostrarTela('selecao');
}

// ============================================================ SERVIDOR

async function verificarServidor() {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.classList.add('online');
      text.textContent = 'Servidor online';
    } else throw new Error();
  } catch {
    dot.classList.add('offline');
    text.textContent = 'Servidor offline';
  }
}

// ============================================================ JIRA

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
      document.getElementById('ticketId').textContent    = dados.ticketId;
      document.getElementById('ticketTitulo').textContent = dados.titulo || '(sem título)';
      statusEl.textContent  = '✓ Dados carregados do Jira';
      statusEl.className    = 'jira-status ok';
    } else {
      statusEl.textContent = 'Não foi possível carregar os dados do ticket.';
      statusEl.className   = 'jira-status erro';
    }
  } catch {
    statusEl.textContent = 'Não foi possível carregar os dados do ticket.';
    statusEl.className   = 'jira-status erro';
  }
}

// ============================================================ PROJETOS

async function carregarProjetos() {
  const nomeEl    = document.getElementById('projNome');
  const btnIniciar = document.getElementById('btnIniciar');
  try {
    const res  = await fetch(`${SERVER_URL}/projetos`, { signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    if (json.projetos && json.projetos.length > 0) {
      popularDropdownProjetos(json.projetos);
    } else {
      nomeEl.textContent  = 'Nenhum projeto disponível';
      btnIniciar.disabled = true;
    }
  } catch {
    nomeEl.textContent  = 'Nenhum projeto disponível';
    btnIniciar.disabled = true;
  }
}

function popularDropdownProjetos(projetos) {
  const menu = document.getElementById('projMenu');
  menu.innerHTML = '';
  projetos.forEach((proj, idx) => {
    const opt = document.createElement('div');
    opt.className   = 'proj-option' + (idx === 0 ? ' selected' : '');
    opt.textContent = proj.nome;
    opt.dataset.slug  = proj.slug;
    opt.dataset.azure = proj.azure || '';
    opt.addEventListener('click', () => selecionarProjeto(proj.slug, proj.nome, proj.azure || '', opt));
    menu.appendChild(opt);
  });
  const p = projetos[0];
  selecionarProjeto(p.slug, p.nome, p.azure || '', menu.firstChild);
}

function abrirMenuProjeto() {
  document.getElementById('projMenu').style.display = 'block';
  document.getElementById('projPill').setAttribute('aria-expanded', 'true');
}

function fecharMenuProjeto() {
  document.getElementById('projMenu').style.display = 'none';
  document.getElementById('projPill').setAttribute('aria-expanded', 'false');
}

function selecionarProjeto(slug, nome, azure, optEl) {
  state.projetoSelecionado = slug;
  state.projetoNome        = nome;
  state.projetoAzure       = azure;
  document.getElementById('projNome').textContent = nome;
  document.querySelectorAll('.proj-option').forEach(o => o.classList.remove('selected'));
  if (optEl) optEl.classList.add('selected');
  fecharMenuProjeto();
}

// ============================================================ PDF

function definirPdf(file) {
  state.pdfFile = file;
  const dropzone = document.getElementById('dropzone');
  dropzone.classList.add('attached');
  document.getElementById('dropzoneContent').style.display  = 'none';
  document.getElementById('dropzoneFilename').style.display = 'flex';
  document.getElementById('dropzoneFilenameText').textContent = file.name;
  esconderErroDescricao();
}

function removerPdf(e) {
  if (e) e.stopPropagation();
  state.pdfFile = null;
  const dropzone = document.getElementById('dropzone');
  dropzone.classList.remove('attached');
  document.getElementById('dropzoneContent').style.display  = 'flex';
  document.getElementById('dropzoneFilename').style.display = 'none';
  document.getElementById('dropzoneFilenameText').textContent = '';
  document.getElementById('pdfInput').value = '';
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('dropzone').classList.remove('dragover');
  const file = event.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') definirPdf(file);
}

// ============================================================ VALIDAÇÃO

function mostrarErroDescricao() {
  document.getElementById('descricaoTextarea').classList.add('atencao');
  document.getElementById('descricaoErro').style.display = 'block';
}

function esconderErroDescricao() {
  document.getElementById('descricaoTextarea').classList.remove('atencao');
  document.getElementById('descricaoErro').style.display = 'none';
}

// ============================================================ EVENTOS

function configurarEventos() {
  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Tela 1 — botão Iniciar
  document.getElementById('btnIniciar').addEventListener('click', irParaFormulario);

  // Dropdown de projeto
  document.getElementById('projPill').addEventListener('click', () => {
    const menu = document.getElementById('projMenu');
    if (menu.style.display === 'none') abrirMenuProjeto();
    else fecharMenuProjeto();
  });

  // Tela 2 — dropzone
  const dropzone = document.getElementById('dropzone');
  dropzone.addEventListener('click', () => document.getElementById('pdfInput').click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') definirPdf(file);
  });

  // PDF input — stopPropagation para não disparar click do dropzone
  document.getElementById('pdfInput').addEventListener('click', e => e.stopPropagation());
  document.getElementById('pdfInput').addEventListener('change', e => {
    if (e.target.files[0]) definirPdf(e.target.files[0]);
  });

  // Remover PDF
  document.getElementById('btnRemoverPdf').addEventListener('click', removerPdf);

  // Voltar para tela 1
  document.getElementById('btnVoltar').addEventListener('click', voltarParaSelecao);

  // Checkbox detalhes — mostra/esconde textarea
  document.getElementById('checkDetalhes').addEventListener('change', function () {
    const wrap = document.getElementById('fieldWrapDetalhes');
    wrap.style.display = this.checked ? 'block' : 'none';
    if (!this.checked) {
      document.getElementById('descricaoTextarea').value = '';
      esconderErroDescricao();
    } else {
      document.getElementById('descricaoTextarea').focus();
    }
  });

  // Limpa erro quando digita
  document.getElementById('descricaoTextarea').addEventListener('input', esconderErroDescricao);

  // Botão da tela 2 — disparar análise
  document.getElementById('btnIniciarAnalise').addEventListener('click', analisar);

  // Botões de resultado / erro / loading
  document.getElementById('btnCancelar').addEventListener('click', cancelarAnalise);
  document.getElementById('btnNovaAnalise').addEventListener('click', resetarFormulario);
  document.getElementById('btnTentarNovamente').addEventListener('click', resetarFormulario);
  document.getElementById('btnDownloadAnalise').addEventListener('click',
    () => downloadArquivo(`${SERVER_URL}/download/output`, 'analise.txt'));
  document.getElementById('btnDownloadLog').addEventListener('click',
    () => downloadArquivo(`${SERVER_URL}/download/log/latest`, 'log.log'));

  // Fecha dropdown ao clicar fora + toggle diff view + links Azure
  document.addEventListener('click', e => {
    if (!document.getElementById('projDropdown').contains(e.target)) fecharMenuProjeto();

    const btn = e.target.closest('.btn-toggle-view');
    if (btn) {
      const block = btn.closest('.diff-block, .code-block');
      if (block) block.classList.toggle('view-dark');
    }

    const link = e.target.closest('.arquivo-link');
    if (link && link.dataset.url) {
      e.preventDefault();
      chrome.tabs.create({ url: link.dataset.url });
    }
  });
}

// ============================================================ ANÁLISE

async function analisar() {
  const temPdf    = state.pdfFile !== null;
  const descricao = document.getElementById('descricaoTextarea').value.trim();

  if (!temPdf && !descricao) {
    // Abre o checkbox e revela o campo de texto com aviso
    const check = document.getElementById('checkDetalhes');
    const wrap  = document.getElementById('fieldWrapDetalhes');
    check.checked      = true;
    wrap.style.display = 'block';
    mostrarErroDescricao();
    document.getElementById('descricaoTextarea').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('descricaoTextarea').focus();
    return;
  }

  mostrarTela('loading');

  const formData = new FormData();
  formData.append('ticketId',    state.dadosTicket.ticketId    || '');
  formData.append('titulo',      state.dadosTicket.titulo      || '');
  formData.append('descricao',   state.dadosTicket.descricao   || '');
  formData.append('prioridade',  state.dadosTicket.prioridade  || '');
  formData.append('tipo',        state.dadosTicket.tipo        || '');
  formData.append('responsavel', state.dadosTicket.responsavel || '');
  formData.append('comentarios', state.dadosTicket.comentarios || '');
  formData.append('historico',   state.dadosTicket.historico   || '');
  if (state.pdfFile)           formData.append('pdf',       state.pdfFile);
  if (descricao)               formData.append('observacao', descricao);
  if (state.projetoSelecionado) formData.append('projeto',   state.projetoSelecionado);

  try {
    const res  = await fetch(`${SERVER_URL}/analisar`, { method: 'POST', body: formData });
    const json = await res.json();
    if (!json.sucesso) { mostrarErro(json.erro || 'Erro ao iniciar análise.'); return; }

    const inicio = Date.now();
    await chrome.storage.local.set({ requestId: json.requestId, inicio });
    iniciarPolling(json.requestId, inicio);
  } catch {
    mostrarErro('Não foi possível conectar ao servidor. Verifique se está rodando em localhost:3000.');
  }
}

// ============================================================ POLLING

function iniciarPolling(requestId, inicio) {
  currentRequestId = requestId;
  pararPolling();
  mostrarTela('loading');
  atualizarTimer(inicio);

  timerInterval    = setInterval(() => atualizarTimer(inicio), 1000);
  pollingInterval  = setInterval(() => consultarStatus(requestId, inicio), 5000);
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
    const res  = await fetch(`${SERVER_URL}/analisar/status/${requestId}`);
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
  } catch (e) {
    console.warn('[popup] Erro ao consultar status:', e.message);
  }
}

function pararPolling() {
  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
  if (timerInterval)   { clearInterval(timerInterval);   timerInterval   = null; }
}

async function cancelarAnalise() {
  if (!currentRequestId) return;
  const btn = document.getElementById('btnCancelar');
  btn.disabled    = true;
  btn.textContent = 'Cancelando...';
  try { await fetch(`${SERVER_URL}/cancelar/${currentRequestId}`, { method: 'POST' }); } catch {}
  pararPolling();
  await chrome.storage.local.remove(['requestId', 'inicio']);
  currentRequestId = null;
  mostrarTela('formulario');
}

async function verificarResultadoSalvo() {
  const { resultado } = await chrome.storage.local.get(['resultado']);
  if (!resultado) return false;
  renderizarResultado(resultado);
  mostrarTela('resultado');
  return true;
}

async function verificarAnaliseEmAndamento() {
  const { requestId, inicio } = await chrome.storage.local.get(['requestId', 'inicio']);
  if (!requestId) return false;
  if (Date.now() - inicio > 30 * 60 * 1000) {
    await chrome.storage.local.remove(['requestId', 'inicio']);
    return false;
  }
  iniciarPolling(requestId, inicio);
  return true;
}

// ============================================================ RENDERIZAÇÃO

function normalizarOutput(texto) {
  if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);
  const primeiroSep = texto.indexOf('\n----------------------------------------');
  if (primeiroSep !== -1) texto = texto.slice(primeiroSep + 1);
  texto = texto.replace(/\n={8,}\s*$/, '');
  return texto.trim();
}

function renderizarResultado(texto) {
  texto = normalizarOutput(texto);
  const funcionalidades = extrairSecao(texto, 'FUNCIONALIDADES IDENTIFICADAS');
  const localizacao     = extrairSecao(texto, 'LOCALIZAÇÃO DO PROBLEMA');
  const causa           = extrairSecao(texto, 'CAUSA PROVÁVEL');
  const resolver        = extrairSecao(texto, 'COMO RESOLVER');
  const arquivos        = extrairSecao(texto, 'ARQUIVOS ANALISADOS');
  const obs             = extrairSecao(texto, 'OBSERVAÇÕES');
  const temEstrutura    = !!(localizacao || causa || resolver);

  if (temEstrutura) {
    document.getElementById('secaoEstruturada').style.display = 'block';
    document.getElementById('secaoBruta').style.display       = 'none';
    const elFunc = document.getElementById('secaoFuncionalidades');
    if (funcionalidades) {
      elFunc.style.display = '';
      document.getElementById('conteudoFuncionalidades').innerHTML = renderSecao(funcionalidades);
    } else {
      elFunc.style.display = 'none';
    }
    document.getElementById('conteudoLocalizacao').innerHTML  = renderSecao(localizacao);
    document.getElementById('conteudoCausa').innerHTML        = renderSecao(causa);
    document.getElementById('conteudoResolver').innerHTML     = renderSecao(resolver);
    document.getElementById('conteudoArquivos').innerHTML     = renderSecao(arquivos);
    document.getElementById('conteudoObservacoes').innerHTML  = renderSecao(obs);

    // Arquivos alterados — extraídos dos blocos DIFF_START do texto completo
    const alterados = extrairArquivosAlterados(texto);
    const secaoAlt  = document.getElementById('secaoAlterados');
    if (alterados.length) {
      document.getElementById('conteudoAlterados').innerHTML = renderArquivosAlterados(alterados, state.projetoAzure);
      secaoAlt.style.display = '';
    } else {
      secaoAlt.style.display = 'none';
    }
  } else {
    document.getElementById('secaoEstruturada').style.display = 'none';
    document.getElementById('secaoBruta').style.display       = 'block';
    document.getElementById('conteudoBruto').innerHTML        = renderMarkdown(texto);
  }
}

// ============================================================ MARKDOWN

function renderMarkdown(texto) {
  if (!texto) return '';
  const partes = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)(?:```|$)/g;
  let lastIndex = 0;
  let ultimoTexto = '';
  let match;

  while ((match = codeBlockRegex.exec(texto)) !== null) {
    if (!match[1] && !match[2].trim()) { lastIndex = match.index + match[0].length; break; }
    const textoAntes = texto.slice(lastIndex, match.index);
    if (textoAntes) { partes.push({ tipo: 'texto', conteudo: textoAntes }); ultimoTexto = textoAntes; }
    partes.push({ tipo: 'codigo', lang: match[1] || '', conteudo: match[2], contexto: ultimoTexto });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < texto.length) partes.push({ tipo: 'texto', conteudo: texto.slice(lastIndex) });

  return partes.map(p =>
    p.tipo === 'codigo' ? renderCodeBlock(p.lang, p.conteudo, p.contexto) : renderTexto(p.conteudo)
  ).join('');
}

function extrairNomeArquivo(codigo, contexto) {
  const mDiff = codigo.match(/^(?:---|\+\+\+)\s+[ab]?\/?(.+\.\w+)/m);
  if (mDiff) return mDiff[1].trim();
  if (contexto) {
    const mCtx = contexto.match(/`([^`\s]+\.(?:ts|html|scss|p|js|css|json|kt|java|xml))`/);
    if (mCtx) return mCtx[1];
    const mSimples = contexto.match(/\b([\w.\-/]+\.(?:ts|html|scss|p|js|css))\b/);
    if (mSimples) return mSimples[1];
  }
  return null;
}

function renderCodeBlock(lang, codigo, contexto) {
  const isDiff       = lang === 'diff' || (lang !== 'text' && detectaDiff(codigo));
  const nomeArquivo  = extrairNomeArquivo(codigo, contexto || '');

  if (isDiff) {
    const todasLinhas = codigo.split('\n');
    const linhasHtml  = todasLinhas.map((linha, idx) => {
      if (!linha && idx === todasLinhas.length - 1) return '';
      if (linha.startsWith('+++') || linha.startsWith('---')) return '';
      if (linha.startsWith('+')) return `<div class="diff-add"><span class="diff-linenum"></span><span class="diff-sign">+</span><span class="diff-content">${escaparHtml(linha.slice(1))}</span></div>`;
      if (linha.startsWith('-')) return `<div class="diff-rem"><span class="diff-linenum"></span><span class="diff-sign">−</span><span class="diff-content">${escaparHtml(linha.slice(1))}</span></div>`;
      if (linha.startsWith('@@')) return `<div class="diff-hunk"><span class="diff-linenum"></span><span class="diff-sign"> </span><span class="diff-content">${escaparHtml(linha)}</span></div>`;
      const conteudo = linha.startsWith(' ') ? linha.slice(1) : linha;
      return `<div class="diff-ctx"><span class="diff-linenum"></span><span class="diff-sign"> </span><span class="diff-content">${escaparHtml(conteudo)}</span></div>`;
    }).join('');

    const fileHtml   = nomeArquivo
      ? `<span class="diff-filename">📄 ${escaparHtml(nomeArquivo)}</span>`
      : `<span class="diff-lang-badge">${escaparHtml(lang || 'diff')}</span>`;
    const toggleBtn  = `<button class="btn-toggle-view" title="Alternar modo escuro">&#60;/&#62;</button>`;
    return `<div class="diff-block"><div class="diff-header">${fileHtml}<span class="diff-header-right"><span class="diff-legend"><span class="leg-rem">− removido</span><span class="leg-add">+ adicionado</span></span>${toggleBtn}</span></div><div class="diff-lines">${linhasHtml}</div></div>`;
  }

  const esc       = escaparHtml(codigo.replace(/\n$/, ''));
  const label     = nomeArquivo ? `📄 ${escaparHtml(nomeArquivo)}` : escaparHtml(lang || 'código');
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
  h = h.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  h = h.replace(/^## (.+)$/gm,  '<h2 class="md-h2">$1</h2>');
  h = h.replace(/^# (.+)$/gm,   '<h1 class="md-h1">$1</h1>');
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  h = h.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
  h = h.replace(/^---$/gm, '<hr class="md-hr">');
  h = h.replace(/^(\d+)\. (.+)$/gm, '<li class="md-li"><span class="li-num">$1.</span>$2</li>');
  h = h.replace(/^[-*] (.+)$/gm,    '<li class="md-li"><span class="li-bullet">•</span>$1</li>');
  h = h.replace(/(<li[\s\S]*?<\/li>\n?)+/g, m => `<ul class="md-list">${m}</ul>`);
  const blocos = h.split(/\n\n+/);
  h = blocos.map(bloco => {
    bloco = bloco.trim();
    if (!bloco) return '';
    if (/^<(h[123]|ul|ol|hr|div|pre)/.test(bloco)) return bloco;
    return `<p class="md-p">${bloco.replace(/\n/g, '<br>')}</p>`;
  }).join('');
  return h;
}

// ============================================================ ARQUIVOS ALTERADOS

function extrairArquivosAlterados(texto) {
  const regex = /DIFF_START\s+arquivo:\s*(.+)/gi;
  const vistos = new Set();
  let match;
  while ((match = regex.exec(texto)) !== null) {
    vistos.add(match[1].trim());
  }
  return [...vistos];
}

function renderArquivosAlterados(caminhos, azureBase) {
  if (!caminhos.length) return '';
  return caminhos.map(caminho => {
    const nome = caminho.split('/').pop();
    const pathAzure = '/' + caminho.replace(/^\//, '');
    if (azureBase) {
      const url = `${azureBase}?path=${encodeURIComponent(pathAzure)}&version=GBmaster`;
      return `<p class="md-p"><a class="arquivo-link" data-url="${url}">📄 ${escaparHtml(caminho)}</a></p>`;
    }
    return `<p class="md-p">📄 ${escaparHtml(caminho)}</p>`;
  }).join('');
}

// ============================================================ renderSecao — suporte DIFF_START/DIFF_END

function renderSecao(texto) {
  if (!texto) return '';
  let html = '';
  const linhas = texto.split('\n');
  let i = 0;

  while (i < linhas.length) {
    const linha = linhas[i];
    if (linha.trim().startsWith('DIFF_START')) {
      const arquivoMatch = linha.match(/arquivo:\s*(.+)/i);
      const nomeArquivo  = arquivoMatch
        ? arquivoMatch[1].trim().split('/').pop()
        : 'arquivo';

      const linhasRemovidas   = [];
      const linhasAdicionadas = [];
      i++;

      while (i < linhas.length && !linhas[i].trim().startsWith('DIFF_END')) {
        const l = linhas[i];
        if (l.startsWith('-'))      linhasRemovidas.push(l.substring(1).trim());
        else if (l.startsWith('+')) linhasAdicionadas.push(l.substring(1).trim());
        i++;
      }

      html += `
        <div class="diff-block" data-view="light">
          <div class="diff-header">
            <span class="diff-file-icon">▣</span>
            <span class="diff-filename">${nomeArquivo}</span>
            <div class="diff-header-right">
              <span class="diff-legend">
                <span class="leg-rem">- removido</span>
                <span class="leg-add">+ adicionado</span>
              </span>
              <button class="btn-toggle-view" title="Alternar modo escuro">&lt;/&gt;</button>
            </div>
          </div>
          <div class="diff-lines">
            ${linhasRemovidas.map(l => `
              <div class="diff-rem"><span class="diff-linenum"></span><span class="diff-sign">−</span><span class="diff-content">${escapeHtml(l)}</span></div>
            `).join('')}
            ${linhasAdicionadas.map(l => `
              <div class="diff-add"><span class="diff-linenum"></span><span class="diff-sign">+</span><span class="diff-content">${escapeHtml(l)}</span></div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      html += renderTexto(linha);
    }
    i++;
  }
  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================ DOWNLOAD

async function downloadArquivo(url, nomeArquivo) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Arquivo não disponível no servidor.');
    const blob      = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href     = objectUrl;
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

// ============================================================ CONTROLE DE TELAS

function mostrarTela(tela) {
  document.getElementById('telaSelecao').style.display    = tela === 'selecao'   ? 'flex'  : 'none';
  document.getElementById('telaFormulario').style.display = tela === 'formulario'? 'flex'  : 'none';
  document.getElementById('telaLoading').style.display    = tela === 'loading'   ? 'flex'  : 'none';
  document.getElementById('telaResultado').style.display  = tela === 'resultado' ? 'block' : 'none';
  document.getElementById('telaErro').style.display       = tela === 'erro'      ? 'flex'  : 'none';
  document.body.style.minHeight = tela === 'resultado' ? '660px' : '';
}

function mostrarErro(mensagem) {
  document.getElementById('erroMensagem').textContent = mensagem;
  mostrarTela('erro');
}

async function resetarFormulario() {
  pararPolling();
  chrome.storage.local.remove(['requestId', 'inicio', 'resultado']);
  try { await fetch(`${SERVER_URL}/limpar`, { method: 'POST' }); } catch {}

  state.pdfFile = null;

  const dropzone = document.getElementById('dropzone');
  dropzone.classList.remove('attached');
  document.getElementById('dropzoneContent').style.display  = 'flex';
  document.getElementById('dropzoneFilename').style.display = 'none';
  document.getElementById('dropzoneFilenameText').textContent = '';
  document.getElementById('pdfInput').value = '';

  document.getElementById('checkDetalhes').checked = false;
  document.getElementById('fieldWrapDetalhes').style.display = 'none';
  document.getElementById('descricaoTextarea').value = '';
  esconderErroDescricao();

  mostrarTela('selecao');
}
