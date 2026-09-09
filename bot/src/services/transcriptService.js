'use strict';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class TranscriptService {
  constructor({ maxMessages = 2000 } = {}) {
    this.maxMessages = maxMessages;
  }

  async collectMessages(channel) {
    const out = [];
    let before = null;
    while (out.length < this.maxMessages) {
      const page = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!page || page.size === 0) break;
      const values = Array.from(page.values());
      out.push(...values);
      before = values[values.length - 1].id;
      if (page.size < 100) break;
    }
    return out.reverse();
  }

  buildHtml({ guildName, channelName, ticket, messages, partial = false }) {
    const items = messages.map((message) => {
      const author = `${message.author?.tag || 'desconhecido'} (${message.author?.id || 'sem-id'})`;
      const createdAt = message.createdAt ? message.createdAt.toISOString() : 'desconhecido';
      const content = escapeHtml(message.content || '');
      const attachments = Array.from(message.attachments?.values?.() || [])
        .map((item) => {
          const url = String(item.url || '');
          if (!/^https?:\/\//i.test(url)) return null;
          return `<li><a href="${escapeHtml(url)}" rel="noreferrer noopener" target="_blank">${escapeHtml(item.name || item.id || 'anexo')}</a></li>`;
        })
        .filter(Boolean)
        .join('');
      return [
        '<article class="message">',
        `<header>${escapeHtml(author)} · ${escapeHtml(createdAt)} · msg ${escapeHtml(message.id)}</header>`,
        `<pre>${content || '(sem texto)'}</pre>`,
        attachments ? `<ul>${attachments}</ul>` : '',
        '</article>',
      ].join('');
    });

    return [
      '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">',
      "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:;\">",
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      `<title>Transcript ${escapeHtml(channelName)}</title>`,
      '<style>body{font-family:system-ui;background:#111;color:#eee;padding:16px}pre{white-space:pre-wrap;background:#1a1a1a;padding:8px;border-radius:6px}article{border:1px solid #333;border-radius:8px;padding:8px;margin:8px 0}a{color:#9dc1ff}</style>',
      '</head><body>',
      `<h1>Transcript · ${escapeHtml(guildName)} / #${escapeHtml(channelName)}</h1>`,
      `<p>Ticket ID interno: ${escapeHtml(ticket.id)} · Tipo: ${escapeHtml(ticket.ticket_type)}${partial ? ' · Parcial por limite configurado' : ''}</p>`,
      items.join(''),
      '</body></html>',
    ].join('');
  }
}

module.exports = { TranscriptService };
