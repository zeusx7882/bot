const state = { me: null, csrf: '', countdownUntil: 0 };

const views = Array.from(document.querySelectorAll('.view-section'));
const messageBox = document.getElementById('messageBox');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userBox = document.getElementById('userBox');
const countdownValue = document.getElementById('countdownValue');
const catalogGrid = document.getElementById('catalogGrid');
const historyList = document.getElementById('historyList');
const transcriptList = document.getElementById('transcriptList');
const transcriptDetail = document.getElementById('transcriptDetail');
const accountDialog = document.getElementById('accountDialog');
const accountText = document.getElementById('accountText');
const copyAccountBtn = document.getElementById('copyAccountBtn');

document.querySelectorAll('.menu-btn').forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.view));
});
logoutBtn.addEventListener('click', () => logout());
copyAccountBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(accountText.value);
    flash('Conta copiada.');
  } catch {
    accountText.focus();
    accountText.select();
    flash('Clipboard indisponível; selecione e copie manualmente.');
  }
});

async function init() {
  readCsrf();
  await refreshSession();
  setInterval(updateCountdown, 500);
}

function readCsrf() {
  const entry = document.cookie.split(/;\s*/).find((item) => item.startsWith('csrf='));
  state.csrf = entry ? decodeURIComponent(entry.split('=').slice(1).join('=')) : '';
}

async function refreshSession() {
  try {
    const response = await fetch('/api/me', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Sessão ausente');
    const data = await response.json();
    state.me = data.user;
    state.countdownUntil = Date.now() + data.cooldownRemainingMs;
    loginBtn.classList.add('hidden');
    userBox.textContent = `Conectado como ${data.user.globalName || data.user.username}`;
    await Promise.all([loadCatalog(), loadHistory(), loadTranscripts()]);
  } catch {
    state.me = null;
    loginBtn.href = `/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    loginBtn.classList.remove('hidden');
    userBox.textContent = 'Faça login para gerar e ver transcripts.';
  }
}

async function loadCatalog() {
  const response = await fetch('/api/catalog', { credentials: 'same-origin' });
  if (!response.ok) return;
  const data = await response.json();
  catalogGrid.textContent = '';
  data.items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'service-card';
    const icon = document.createElement('div');
    icon.className = 'service-icon';
    icon.textContent = pickSymbol(item.displayName);
    const title = document.createElement('h3');
    title.textContent = item.displayName;
    const stock = document.createElement('p');
    stock.className = 'muted';
    stock.textContent = `Disponíveis: ${item.availableCount}`;
    const button = document.createElement('button');
    button.textContent = 'Gerar conta';
    button.disabled = !state.me || item.availableCount <= 0;
    button.addEventListener('click', () => generate(item.serviceKey));
    card.append(icon, title, stock, button);
    catalogGrid.append(card);
  });
}

async function generate(serviceKey) {
  const requestId = crypto.randomUUID().replace(/-/g, '');
  sessionStorage.setItem('lastGenerateRequestId', requestId);
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': state.csrf, origin: location.origin },
      body: JSON.stringify({ serviceKey, requestId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao gerar.');
    state.countdownUntil = Date.now() + data.cooldownRemainingMs;
    accountText.value = data.item;
    accountDialog.showModal();
    flash(data.reused ? 'Pedido repetido recuperado com sucesso.' : 'Conta gerada com sucesso.');
    await Promise.all([loadCatalog(), loadHistory()]);
  } catch (error) {
    flash(error.message || 'Falha ao gerar.', true);
  }
}

async function loadHistory() {
  const response = await fetch('/api/history', { credentials: 'same-origin' });
  if (!response.ok) return;
  const data = await response.json();
  historyList.textContent = '';
  data.items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'card';
    const title = document.createElement('h3');
    title.textContent = item.displayName;
    const meta = document.createElement('p');
    meta.className = 'transcript-meta';
    meta.textContent = new Date(item.generatedAt).toLocaleString('pt-BR');
    const text = document.createElement('textarea');
    text.readOnly = true;
    text.rows = 3;
    text.value = item.item;
    const copy = document.createElement('button');
    copy.textContent = 'Copiar';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(item.item);
        flash('Conta copiada.');
      } catch {
        text.focus();
        text.select();
        flash('Selecione e copie manualmente.');
      }
    });
    card.append(title, meta, text, copy);
    historyList.append(card);
  });
}

async function loadTranscripts() {
  const response = await fetch('/api/transcripts', { credentials: 'same-origin' });
  if (!response.ok) return;
  const data = await response.json();
  transcriptList.textContent = '';
  data.items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'card';
    const title = document.createElement('h3');
    title.textContent = item.title;
    const meta = document.createElement('p');
    meta.className = 'transcript-meta';
    meta.textContent = `Guild ${item.guildId} · ticket ${item.ticketId} · ${new Date(item.createdAt).toLocaleString('pt-BR')}`;
    const button = document.createElement('button');
    button.textContent = 'Abrir transcript';
    button.addEventListener('click', () => loadTranscriptDetail(item.transcriptId));
    card.append(title, meta, button);
    transcriptList.append(card);
  });
}

async function loadTranscriptDetail(transcriptId) {
  const response = await fetch(`/api/transcripts/${encodeURIComponent(transcriptId)}`, { credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) {
    flash(data.error || 'Transcript não encontrado.', true);
    return;
  }
  transcriptDetail.textContent = '';
  transcriptDetail.classList.remove('hidden');
  const title = document.createElement('h2');
  title.textContent = data.title;
  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = data.payload.partial ? 'Transcript parcial por limite configurado.' : 'Transcript completo dentro do limite configurado.';
  transcriptDetail.append(title, note);
  data.payload.messages.forEach((message) => {
    const wrapper = document.createElement('article');
    wrapper.className = 'transcript-message';
    const meta = document.createElement('div');
    meta.className = 'transcript-meta';
    meta.textContent = `${message.author.tag} · ${new Date(message.createdAt).toLocaleString('pt-BR')}`;
    const content = document.createElement('pre');
    content.textContent = message.content || '(sem texto)';
    wrapper.append(meta, content);
    (message.embeds || []).forEach((embed) => {
      const pre = document.createElement('pre');
      pre.textContent = [embed.title, embed.description, ...(embed.fields || []).map((field) => `${field.name}: ${field.value}`)].filter(Boolean).join('\n');
      wrapper.append(pre);
    });
    if (message.attachments && message.attachments.length > 0) {
      const links = document.createElement('div');
      links.className = 'link-list';
      message.attachments.forEach((attachment) => {
        const link = document.createElement('a');
        link.href = attachment.url;
        link.target = '_blank';
        link.rel = 'noreferrer noopener';
        link.textContent = `${attachment.name || 'Anexo'} (o link externo pode expirar)`;
        links.append(link);
      });
      wrapper.append(links);
    }
    transcriptDetail.append(wrapper);
  });
  showView('transcripts');
}

async function logout() {
  try {
    await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': state.csrf, origin: location.origin },
      body: JSON.stringify({}),
    });
  } finally {
    location.href = '/';
  }
}

function showView(id) {
  views.forEach((view) => view.classList.toggle('hidden', view.id !== id));
}

function updateCountdown() {
  const remaining = Math.max(0, state.countdownUntil - Date.now());
  countdownValue.textContent = `${Math.ceil(remaining / 1000)}s`;
}

function pickSymbol(name) {
  const value = String(name || '').toLowerCase();
  if (value.includes('netflix')) return 'N';
  if (value.includes('disney')) return '★';
  if (value.includes('prime')) return 'P';
  if (value.includes('spotify')) return 'S';
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

function flash(message, isError = false) {
  messageBox.textContent = message;
  messageBox.classList.remove('hidden');
  messageBox.style.borderColor = isError ? 'var(--danger)' : 'var(--line)';
}

init();
