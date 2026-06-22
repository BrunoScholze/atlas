// Script injetado nas páginas de ticket do Jira
// Suporta Jira Cloud (data-testid) e Jira Server/Data Center (IDs clássicos)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getDadosTicket') {
    sendResponse(extrairDadosJira());
  }
  return true;
});

// Tenta cada seletor em ordem e retorna o primeiro com texto
function pegar(...seletores) {
  for (const s of seletores) {
    const el = document.querySelector(s);
    const texto = el?.textContent?.trim();
    if (texto) return texto;
  }
  return '';
}

function pegarTodos(...seletores) {
  for (const s of seletores) {
    const els = document.querySelectorAll(s);
    if (els.length > 0) return Array.from(els);
  }
  return [];
}

function extrairDadosJira() {
  // Ticket ID — sempre da URL
  const urlPartes = window.location.pathname.split('/browse/');
  const ticketId = urlPartes.length > 1 ? urlPartes[1].split('?')[0] : '';

  // Título
  const titulo = pegar(
    // Jira Server / Data Center
    '#summary-val',
    'h1#summary-val',
    '.issue-header-main-heading',
    '[data-field-id="summary"]',
    // Jira Cloud
    '[data-testid="issue.views.issue-base.foundation.summary.heading"]',
    '[data-testid="issue-title"]',
    // Genérico
    'h1[class*="Summary"]',
    'h1[class*="summary"]'
  );

  // Descrição
  const descricao = pegar(
    // Jira Server
    '#description-val',
    '#description-wiki-preview',
    '.user-content-block',
    // Jira Cloud
    '[data-testid="issue.views.issue-base.foundation.description.rendered-field"]'
  );

  // Prioridade
  const prioridade = pegar(
    // Jira Server
    '#priority-val',
    'span.priority-icon + span',
    '#priority-val img[alt]',
    // Jira Cloud
    '[data-testid*="priority"] span',
    '[data-testid*="Priority"] span'
  ) || document.querySelector('#priority-val img')?.getAttribute('alt') || '';

  // Tipo
  const tipo = pegar(
    '#type-val',
    '#issuetype-val',
    '[data-testid*="issuetype"] span',
    '[data-testid*="IssueType"] span'
  ) || document.querySelector('#type-val img')?.getAttribute('alt') || '';

  // Responsável
  const responsavel = pegar(
    '#assignee-val',
    '[data-testid*="assignee"]',
    '[data-testid*="Assignee"]',
    '.assignee .user-hover'
  );

  // Status
  const status = pegar(
    '#status-val',
    '[data-testid*="status"] span',
    '.jira-issue-status-lozenge'
  );

  // Comentários
  const comentariosEls = pegarTodos(
    // Jira Server
    '.comment-body',
    '.activity-comment .wiki-content',
    // Jira Cloud
    '[data-testid*="comment-base"]',
    '[data-testid*="Comment"]'
  );
  const comentarios = comentariosEls
    .map(el => el.textContent?.trim())
    .filter(Boolean)
    .join('\n---\n');

  return {
    ticketId,
    titulo,
    descricao,
    prioridade,
    tipo,
    responsavel,
    status,
    comentarios,
    historico: ''
  };
}
